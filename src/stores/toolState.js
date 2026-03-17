import { ref } from 'vue'
import { deepCopy } from '../utils/commonUtils.js'

function contentItemToText(item) {
    if (item.type === 'text') {
        return item.text
    }
    if (item.type === 'resource') {
        return JSON.stringify(item.resource, null, 2)
    }
    return JSON.stringify(item, null, 2)
}

function contentItemToMessageContent(item) {
    if (item.type === 'text') {
        return [{ type: 'text', text: item.text }]
    }
    if (item.type === 'image') {
        return [{
            type: 'image_url',
            image_url: {
                url: `data:${item.mimeType};base64,${item.data}`,
            },
        }]
    }
    if (item.type === 'audio') {
        return [{
            type: 'audio_url',
            audio_url: {
                url: `data:${item.mimeType};base64,${item.data}`,
            },
        }]
    }
    return [{ type: 'text', text: contentItemToText(item) }]
}

function mcpToolResultToContent(result) {
    if (result.content?.length) {
        return result.content.flatMap((item, index) => (
            (index === 0 ? [] : [{ type: 'text', text: '\n' }]).concat(contentItemToMessageContent(item))
        ))
    }
    if (result.structuredContent !== undefined) {
        return JSON.stringify(result.structuredContent, null, 2)
    }
    if (result.toolResult !== undefined) {
        return JSON.stringify(result.toolResult, null, 2)
    }
    return ''
}

function getToolCallNames(toolCalls = []) {
    return toolCalls.map(toolCall => toolCall.function?.name).filter(Boolean)
}

function getToolCallReadyFallback(toolCalls = []) {
    const unreadyToolNames = [...new Set(getToolCallNames(toolCalls))]
    return {
        isReadys: toolCalls.map(() => false),
        allReady: toolCalls.length === 0,
        unreadyToolNames,
    }
}

function buildRejectedToolResponses(toolCalls = [], content = 'The user rejected the tool_calls.') {
    return toolCalls.map(toolCall => ({
        role: 'tool',
        content,
        tool_call_id: toolCall.id,
        name: toolCall.function?.name,
    }))
}

function getToolCallDiscardReason({
    toolCallStatus,
    toolCallID,
    toolCallDialogKey,
    currentDialogKey,
}) {
    if (!toolCallStatus.calling) {
        return 'calling stopped'
    }
    if (toolCallID !== toolCallStatus.callTimes) {
        return `call ID mismatch ${toolCallID} !== ${toolCallStatus.callTimes}`
    }
    if (toolCallDialogKey !== currentDialogKey) {
        return `dialog changed from ${toolCallDialogKey} to ${currentDialogKey}`
    }
    return ''
}

function logDiscardedToolCall(toolCallID, toolCalls = [], reason) {
    console.log(`[tool call ${toolCallID}] discard ${getToolCallNames(toolCalls).join(', ') || 'unknown tools'}: ${reason}`)
}

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
                            throw new Error(`Duplicated tool name "${toolName}" from ${toolNameToSource[toolName]} and ${source}.`)
                        }
                        toolNameToSource[toolName] = source
                        nextToolNameToRequireApproval[toolName] = requireApproval
                        nextTools.push(tool)
                    }

                    for (const toolConfig of toolConfigs) {
                        const requireApproval = toolConfig.require_approval || 'never'
                        if (toolConfig.type === 'function') {
                            registerTool(deepCopy(toolConfig), 'function tool config', requireApproval)
                            continue
                        }
                        if (toolConfig.type === 'mcp') {
                            const [{ Client }, { StreamableHTTPClientTransport }] = await Promise.all([
                                import('@modelcontextprotocol/sdk/client/index.js'),
                                import('@modelcontextprotocol/sdk/client/streamableHttp.js'),
                            ])
                            const transport = new StreamableHTTPClientTransport(new URL(toolConfig.server_url))
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
                                registerTool({
                                    type: 'function',
                                    function: {
                                        name: mcpTool.name,
                                        description: mcpTool.description,
                                        parameters: mcpTool.inputSchema,
                                    },
                                }, toolConfig.server_url, requireApproval)
                                nextToolNameToCall[mcpTool.name] = async (toolCall) => {
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
        const isReadys = toolCalls.map(toolCall => toolCall.function?.name in toolNameToCall)
        const unreadyToolNames = [...new Set(toolCalls
            .filter((toolCall, index) => !isReadys[index])
            .map(toolCall => toolCall.function?.name)
            .filter(Boolean))]
        return {
            isReadys,
            allReady: isReadys.every(Boolean),
            unreadyToolNames,
        }
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
    operationCenter,
    finalMessage,
    warning,
} = {}) {
    const toolCallStatus = ref({
        callTimes: 0,
        calling: false,
    })
    const pandaState = operationCenter.pandaState

    pandaState.registerBeforeOperationHook(() => {
        toolCallStatus.value.calling = false
    })

    function checkCallReady(toolCalls = []) {
        const toolState = peekToolState()
        if (!toolState) {
            return getToolCallReadyFallback(toolCalls)
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

    async function callToolCalls(toolCalls = null) {
        await ensureDialogToolsMaterialized()
        const toolCallsToRun = toolCalls || finalMessage.value.tool_calls || []
        const currentToolState = await getToolState()
        const readyStatus = currentToolState.checkCallReady(toolCallsToRun)
        if (!readyStatus.allReady) {
            return readyStatus
        }
        toolCallStatus.value.calling = true
        toolCallStatus.value.callTimes++
        const toolCallID = toolCallStatus.value.callTimes
        const toolCallDialogKey = pandaState.currentDialogKey.value
        try {
            const toolResponses = await currentToolState.call(toolCallsToRun)
            const discardReason = getToolCallDiscardReason({
                toolCallStatus: toolCallStatus.value,
                toolCallID,
                toolCallDialogKey,
                currentDialogKey: pandaState.currentDialogKey.value,
            })
            if (discardReason) {
                logDiscardedToolCall(toolCallID, toolCallsToRun, discardReason)
                return readyStatus
            }
            toolCallStatus.value.calling = false
            await operationCenter.startNewRound(toolResponses)
            return readyStatus
        } catch (error) {
            const discardReason = getToolCallDiscardReason({
                toolCallStatus: toolCallStatus.value,
                toolCallID,
                toolCallDialogKey,
                currentDialogKey: pandaState.currentDialogKey.value,
            })
            if (discardReason) {
                logDiscardedToolCall(toolCallID, toolCallsToRun, discardReason)
                return readyStatus
            }
            toolCallStatus.value.calling = false
            warning(error)
            return readyStatus
        }
    }

    async function rejectToolCalls(toolCalls = null) {
        const toolCallsToReject = toolCalls || finalMessage.value.tool_calls || []
        if (!toolCallsToReject.length) {
            return
        }
        await ensureDialogToolsMaterialized()
        await operationCenter.startNewRound(buildRejectedToolResponses(toolCallsToReject))
    }

    async function maybeAutoCallToolCalls(toolCalls = null) {
        const toolCallsToRun = toolCalls || finalMessage.value.tool_calls || []
        if (
            checkCallReady(toolCallsToRun).allReady &&
            !checkRequireApproval(toolCallsToRun).needApproval
        ) {
            await callToolCalls(toolCallsToRun)
        }
    }

    async function retry() {
        await operationCenter.generateNew()
    }

    function stopToolCalls() {
        toolCallStatus.value.calling = false
    }

    return {
        toolCallStatus,
        checkCallReady,
        checkRequireApproval,
        callToolCalls,
        rejectToolCalls,
        maybeAutoCallToolCalls,
        retry,
        stopToolCalls,
    }
}
