import { ref } from 'vue'
import {
    buildDuplicatedToolNameError,
    buildFunctionToolFromConfig,
    buildFunctionToolSourceLabel,
    buildMcpToolSourceLabel,
    checkToolCallReadyStatus,
    formatToolName,
    getToolCallDiscardReason,
    logDiscardedToolCall,
    mcpToolResultToContent,
} from '../utils/toolUtils.js'

export function ToolStateClosure({ toolConfigs = [] } = {}) {
    let tools = []
    const toolNameToCall = {}
    const toolNameToRequireApproval = {}
    let closers = []
    let initPromise = null

    async function init() {
        if (!initPromise) {
            initPromise = (async () => {
                const nextTools = []
                const toolNameToSource = {}
                const nextToolNameToCall = {}
                const nextToolNameToRequireApproval = {}
                const nextClosers = []
                try {
                    const registerTool = (tool, source, requireApproval = 'never') => {
                        const toolName = tool.function.name
                        if (toolName in toolNameToSource) {
                            throw buildDuplicatedToolNameError(toolName, toolNameToSource[toolName], source)
                        }
                        toolNameToSource[toolName] = source
                        nextToolNameToRequireApproval[toolName] = requireApproval
                        nextTools.push(tool)
                    }

                    for (const [toolConfigIndex, toolConfig] of toolConfigs.entries()) {
                        const requireApproval = toolConfig.require_approval || 'never'
                        if (toolConfig.type === 'function') {
                            registerTool(
                                buildFunctionToolFromConfig(toolConfig),
                                buildFunctionToolSourceLabel(toolConfig, toolConfigIndex),
                                requireApproval,
                            )
                            continue
                        }
                        if (toolConfig.type === 'mcp') {
                            const [{ Client }, { StreamableHTTPClientTransport }] = await Promise.all([
                                import('@modelcontextprotocol/sdk/client/index.js'),
                                import('@modelcontextprotocol/sdk/client/streamableHttp.js'),
                            ])
                            const serverUrl = new URL(toolConfig.server_url, window.location.origin)
                            const transport = new StreamableHTTPClientTransport(serverUrl)
                            const client = new Client({
                                name: 'frontend-agent',
                                version: '0.1.0',
                            })
                            client.onerror = (error) => {
                                console.error('[OnPandaWeb MCP] Client error.', error)
                            }
                            await client.connect(transport)
                            nextClosers.push(() => transport.close())
                            const { tools: mcpTools } = await client.listTools()
                            for (const mcpTool of mcpTools) {
                                const formattedToolName = formatToolName(mcpTool.name, toolConfig)
                                registerTool({
                                    type: 'function',
                                    function: {
                                        name: formattedToolName,
                                        description: mcpTool.description,
                                        parameters: mcpTool.inputSchema,
                                    },
                                }, buildMcpToolSourceLabel(toolConfig, toolConfigIndex, mcpTool.name), requireApproval)
                                nextToolNameToCall[formattedToolName] = async (toolCall) => {
                                    const result = await client.callTool({
                                        name: mcpTool.name,
                                        arguments: JSON.parse(toolCall.function.arguments || '{}'),
                                    })
                                    return mcpToolResultToContent(result)
                                }
                            }
                            continue
                        }
                        throw new Error(`Unsupported tool config type: ${toolConfig.type}`)
                    }

                    tools = nextTools
                    for (const toolName in toolNameToCall) {
                        delete toolNameToCall[toolName]
                    }
                    for (const toolName in toolNameToRequireApproval) {
                        delete toolNameToRequireApproval[toolName]
                    }
                    Object.assign(toolNameToCall, nextToolNameToCall)
                    Object.assign(toolNameToRequireApproval, nextToolNameToRequireApproval)
                    closers = nextClosers
                    return nextTools
                } catch (error) {
                    await Promise.allSettled(nextClosers.map(closeClient => closeClient()))
                    throw error
                }
            })()
            initPromise = initPromise.catch((error) => {
                initPromise = null
                throw error
            })
        }
        return initPromise
    }

    function checkCallReady(toolCalls = []) {
        return checkToolCallReadyStatus(toolCalls, toolNameToCall)
    }

    function checkRequireApproval(toolCalls = []) {
        const approvalToolNames = [...new Set(toolCalls
            .filter(toolCall => toolNameToRequireApproval[toolCall.function?.name] === 'always')
            .map(toolCall => toolCall.function?.name)
            .filter(Boolean))]
        return {
            needApproval: approvalToolNames.length > 0,
            approvalToolNames,
        }
    }

    async function call(toolCalls = []) {
        await init()
        return await Promise.all(toolCalls.map(async (toolCall) => ({
            role: 'tool',
            content: await toolNameToCall[toolCall.function.name](toolCall),
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
        })))
    }

    async function close() {
        await Promise.all(closers.map(closeClient => closeClient()))
    }

    return {
        get tools() {
            return tools
        },
        init,
        checkCallReady,
        checkRequireApproval,
        call,
        toolNameToCall,
        close,
    }
}

export function ToolCallStateClosure({
    ensureDialogToolsMaterialized,
    getToolState,
    peekToolState,
    warning,
} = {}) {
    const toolCallStatus = ref({
        callTimes: 0,
        calling: false,
        autoApproveRunNum: 0,
        approvedRunCount: 0,
        currentCallConsumedApproval: false,
    })

    function setAutoApproveLoop(autoApproveRunNum = 0) {
        toolCallStatus.value.autoApproveRunNum = autoApproveRunNum
        toolCallStatus.value.approvedRunCount = 0
        toolCallStatus.value.currentCallConsumedApproval = false
    }

    async function prepareToolCallExecution(toolCalls = []) {
        await ensureDialogToolsMaterialized()
        const toolCallsToRun = toolCalls || []
        const currentToolState = await getToolState()
        const readyStatus = currentToolState.checkCallReady(toolCallsToRun)
        return {
            toolCallsToRun,
            currentToolState,
            readyStatus,
        }
    }

    function checkCallReady(toolCalls = []) {
        const toolState = peekToolState()
        if (!toolState) {
            return checkToolCallReadyStatus(toolCalls)
        }
        return toolState.checkCallReady(toolCalls)
    }

    function checkRequireApproval(toolCalls = []) {
        const toolState = peekToolState()
        if (!toolState) {
            return {
                needApproval: false,
                approvalToolNames: [],
            }
        }
        return toolState.checkRequireApproval(toolCalls)
    }

    async function runPreparedToolCalls({
        toolCallsToRun,
        currentToolState,
        readyStatus,
    }, consumeApproval = false) {
        if (!readyStatus.allReady) {
            return {
                readyStatus,
                toolMessages: null,
                info: "!readyStatus.allReady"
            }
        }
        toolCallStatus.value.currentCallConsumedApproval = consumeApproval
        if (consumeApproval) {
            toolCallStatus.value.approvedRunCount++
        }
        toolCallStatus.value.calling = true
        toolCallStatus.value.callTimes++
        const toolCallID = toolCallStatus.value.callTimes
        try {
            const toolMessages = await currentToolState.call(toolCallsToRun)
            const discardReason = getToolCallDiscardReason({
                toolCallStatus: toolCallStatus.value,
                toolCallID,
            })
            if (discardReason) {
                logDiscardedToolCall(toolCallID, toolCallsToRun, discardReason)
                return {
                    readyStatus,
                    toolMessages: null,
                    info: discardReason
                }
            }
            toolCallStatus.value.calling = false
            return {
                readyStatus,
                toolMessages,
            }
        } catch (error) {
            const discardReason = getToolCallDiscardReason({
                toolCallStatus: toolCallStatus.value,
                toolCallID,
            })
            if (discardReason) {
                logDiscardedToolCall(toolCallID, toolCallsToRun, discardReason)
                return {
                    readyStatus,
                    toolMessages: null,
                    info: discardReason
                }
            }
            toolCallStatus.value.calling = false
            warning(error)
            return {
                readyStatus,
                toolMessages: null,
                info: error
            }
        }
    }

    async function maybeAutoCallToolCalls(toolCalls = []) {
        const prepared = await prepareToolCallExecution(toolCalls)
        if (!prepared.readyStatus.allReady) {
            return {
                readyStatus: prepared.readyStatus,
                toolMessages: null,
                info: "!prepared.readyStatus.allReady"
            }
        }
        const hasRemainingAutoApproveRuns = (
            toolCallStatus.value.approvedRunCount < toolCallStatus.value.autoApproveRunNum
        )
        if (!hasRemainingAutoApproveRuns) {
            return {
                readyStatus: prepared.readyStatus,
                toolMessages: null,
                info: "!hasRemainingAutoApproveRuns"
            }
        }
        return await runPreparedToolCalls(prepared, true)
    }

    function stopToolCalls() {
        toolCallStatus.value.calling = false
    }

    return {
        toolCallStatus,
        setAutoApproveLoop,
        checkCallReady,
        checkRequireApproval,
        maybeAutoCallToolCalls,
        stopToolCalls,
    }
}
