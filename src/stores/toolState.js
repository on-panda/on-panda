import { computed, isRef, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { deepCopy } from '../utils/commonUtils.js'
import {
    buildDuplicatedToolNameError,
    buildMcpPlaceholderFromConfig,
    buildMcpToolSourceLabel,
    formatToolName,
    getToolRuntime,
    getToolCallDiscardReason,
    hashToolSchema,
    logDiscardedToolCall,
    matchTwoToolLists,
    mcpToolResultToContent,
    stripRuntime,
} from '../utils/toolUtils.js'

export function ToolManageStateClosure({ presetToolConfigs = [] } = {}) {
    const isMounted = ref(false)
    onMounted(() => {
        isMounted.value = true
    })

    function showErrorMessage(message) {
        setTimeout(() => {
            if (isMounted.value) {
                ElMessage({
                    showClose: true,
                    message,
                    type: 'error',
                    duration: 10000,
                })
            }
        }, isMounted.value ? 0 : 2000)
    }

    const presetToolConfigsInput = isRef(presetToolConfigs) ? presetToolConfigs : ref(deepCopy(presetToolConfigs || []))
    const registeredDialogCache = ref(null)
    const runtimeVersion = ref(0)
    const runtimeEntryByHash = new Map()
    const presetConfigHashToIndex = ref({})
    const matchedDataToPresetIndex = ref({})
    const allTools = ref([])
    const matchedAllToSelectedIndex = ref({})

    const presetToolReadyPromise = ref(Promise.resolve())

    const dataToolConfigs = computed(() => registeredDialogCache.value?.value?.tool_configs || [])
    const visibleToolConfigItems = computed(() => [
        ...dataToolConfigs.value
            .map((toolConfig, index) => ({ toolConfig, index, source: 'data' }))
            .filter(({ index }) => matchedDataToPresetIndex.value[index] == null),
        ...presetToolConfigsInput.value.map((toolConfig, index) => ({ toolConfig, index, source: 'preset' })),
    ])
    const currentDialogTools = computed(() => registeredDialogCache.value?.value?.tools || [])

    function getDialogCacheValue() {
        return registeredDialogCache.value?.value || null
    }

    function setDialogTools(tools = []) {
        const dialogCache = getDialogCacheValue()
        if (!dialogCache) {
            return
        }
        dialogCache.tools = tools
    }

    function applyRequireApprovalToEntry(entry, toolConfig = {}) {
        const requireApproval = toolConfig.require_approval || 'never'
        entry.requireApproval = requireApproval
        for (const tool of entry.tools) {
            entry.toolNameToRequireApproval[tool.function.name] = requireApproval
        }
    }

    async function ensureFunctionEntry({ entry, toolConfig = {}, toolConfigIndex = 0, source = 'data' } = {}) {
        if (entry.tools.length) {
            applyRequireApprovalToEntry(entry, toolConfig)
            return entry
        }
        const tool = deepCopy(toolConfig)
        delete tool.require_approval
        delete tool.tool_name_format
        delete tool.server_label
        tool.function = deepCopy(toolConfig.function)
        tool.function.name = formatToolName(toolConfig.function.name, toolConfig)
        const runtime = getToolRuntime(tool)
        runtime.tool_name_format = toolConfig.tool_name_format
        runtime.displayName = tool.function.name
        runtime.hash = entry.configHash
        entry.tools = [tool]
        applyRequireApprovalToEntry(entry, toolConfig)
        runtimeVersion.value++
        return entry
    }

    async function ensureMcpToolsLoaded({ entry, toolConfig = {}, toolConfigIndex = 0 } = {}) {
        if (entry.tools.length) {
            return entry
        }
        if (!entry.initPromise) {
            entry.initPromise = (async () => {
                const source = buildMcpToolSourceLabel(toolConfig, toolConfigIndex)
                let hasShownErrorMessage = false
                function showMcpErrorMessage(message) {
                    if (hasShownErrorMessage) {
                        return
                    }
                    hasShownErrorMessage = true
                    showErrorMessage(message)
                }
                const nextTools = []
                const toolNameToSource = {}
                const nextToolNameToCall = {}
                const nextToolNameToRequireApproval = {}
                const nextClosers = []
                try {
                    const [{ Client }, { StreamableHTTPClientTransport }] = await Promise.all([
                        import('@modelcontextprotocol/sdk/client/index.js'),
                        import('@modelcontextprotocol/sdk/client/streamableHttp.js'),
                    ])
                    const serverUrl = new URL(toolConfig.server_url, window.location.origin)
                    const transport = new StreamableHTTPClientTransport(serverUrl)
                    const client = new Client({
                        name: 'on-panda',
                        version: '0.1.0',
                    })
                    client.onerror = (error) => {
                        console.error('[OnPandaWeb MCP] Client error.', error)
                        showMcpErrorMessage(`Error in MCP connection of "${source}":\n ${error.message}`)
                    }
                    await client.connect(transport)
                    nextClosers.push(() => transport.close())
                    const { tools: mcpTools } = await client.listTools()

                    const registerTool = async (tool, rawName, requireApproval = 'never') => {
                        const toolName = tool.function.name
                        const source = buildMcpToolSourceLabel(toolConfig, toolConfigIndex, rawName)
                        if (toolName in toolNameToSource) {
                            throw buildDuplicatedToolNameError(toolName, toolNameToSource[toolName], source)
                        }
                        toolNameToSource[toolName] = source
                        nextToolNameToRequireApproval[toolName] = requireApproval
                        const runtime = getToolRuntime(tool)
                        runtime.tool_name_format = toolConfig.tool_name_format
                        runtime.displayName = toolName
                        runtime.hash = await hashToolSchema(tool)
                        nextTools.push(tool)
                    }

                    for (const mcpTool of mcpTools) {
                        const formattedToolName = formatToolName(mcpTool.name, toolConfig)
                        const tool = {
                            type: 'function',
                            function: {
                                name: formattedToolName,
                                description: mcpTool.description,
                                parameters: mcpTool.inputSchema,
                            },
                        }
                        await registerTool(tool, mcpTool.name, entry.requireApproval)
                        nextToolNameToCall[formattedToolName] = async (toolCall) => {
                            const result = await client.callTool({
                                name: mcpTool.name,
                                arguments: JSON.parse(toolCall.function.arguments || '{}'),
                            })
                            return mcpToolResultToContent(result)
                        }
                    }

                    entry.tools = nextTools
                    entry.toolNameToCall = nextToolNameToCall
                    entry.toolNameToRequireApproval = nextToolNameToRequireApproval
                    entry.closers = nextClosers
                    runtimeVersion.value++
                    return entry
                } catch (error) {
                    showMcpErrorMessage(`Error in loading MCP tools of "${source}":\n ${error.message}`)
                    await Promise.allSettled(nextClosers.map(closeClient => closeClient()))
                    throw error
                }
            })()
            entry.initPromise = entry.initPromise.catch((error) => {
                entry.initPromise = null
                throw error
            })
        }
        return await entry.initPromise
    }

    async function prepareRuntimeEntry({ toolConfig = {}, source = 'data', toolConfigIndex = 0, eager = false } = {}) {
        const configHash = await hashToolSchema(toolConfig)
        let entry = runtimeEntryByHash.get(configHash)
        if (!entry) {
            entry = {
                configHash,
                source,
                type: toolConfig.type,
                requireApproval: toolConfig.require_approval || 'never',
                tools: [],
                toolNameToCall: {},
                toolNameToRequireApproval: {},
                closers: [],
                initPromise: null,
            }
            runtimeEntryByHash.set(configHash, entry)
        }
        if (source === 'preset') {
            entry.source = 'preset'
        }
        if (toolConfig.type === 'function') {
            await ensureFunctionEntry({ entry, toolConfig, toolConfigIndex, source })
        } else if (toolConfig.type === 'mcp') {
            applyRequireApprovalToEntry(entry, toolConfig)
            if (eager) {
                await ensureMcpToolsLoaded({ entry, toolConfig, toolConfigIndex })
            }
        } else {
            throw new Error(`Unsupported tool config type: ${toolConfig.type}`)
        }
        return entry
    }

    async function buildToolsFromToolConfigs(toolConfigs = []) {
        const matchedDataToPresetIndex = await matchTwoToolLists(toolConfigs, presetToolConfigsInput.value)
        const nextTools = []
        for (const [toolConfigIndex, toolConfig] of toolConfigs.entries()) {
            if (matchedDataToPresetIndex[toolConfigIndex] != null) {
                const matchedPresetIndex = matchedDataToPresetIndex[toolConfigIndex]
                const presetEntry = await prepareRuntimeEntry({
                    toolConfig: presetToolConfigsInput.value[matchedPresetIndex],
                    source: 'preset',
                    toolConfigIndex: matchedPresetIndex,
                    eager: true,
                })
                nextTools.push(...deepCopy(presetEntry.tools))
                continue
            }
            const entry = await prepareRuntimeEntry({
                toolConfig,
                source: 'data',
                toolConfigIndex,
                eager: toolConfig.type === 'function',
            })
            if (toolConfig.type === 'function') {
                nextTools.push(...deepCopy(entry.tools))
                continue
            }
            const placeholder = buildMcpPlaceholderFromConfig(toolConfig, toolConfigIndex, 'data')
            getToolRuntime(placeholder).hash = entry.configHash
            nextTools.push(placeholder)
        }
        return nextTools
    }

    async function buildRequestTools() {
        const dialogCache = getDialogCacheValue()
        if (!dialogCache) {
            return []
        }
        await syncDialogToolsFromConfigsIfNeeded()
        const currentToolsValue = dialogCache.tools ?? []
        const nextTools = []
        let replacedPlaceholder = false

        for (const tool of currentToolsValue) {
            const runtime = getToolRuntime(tool)
            if (!(tool.type === 'mcp' && runtime.isPlaceholder)) {
                nextTools.push(tool)
                continue
            }
            const configHash = await hashToolSchema(tool)
            const matchedPresetIndex = presetConfigHashToIndex.value[configHash]
            if (matchedPresetIndex != null) {
                const presetEntry = await prepareRuntimeEntry({
                    toolConfig: presetToolConfigsInput.value[matchedPresetIndex],
                    source: 'preset',
                    toolConfigIndex: matchedPresetIndex,
                    eager: true,
                })
                nextTools.push(...deepCopy(presetEntry.tools))
            } else {
                const toolConfigIndex = runtime.toolConfigIndex
                const toolConfig = dialogCache.tool_configs[toolConfigIndex]
                const entry = await prepareRuntimeEntry({
                    toolConfig,
                    source: runtime.source,
                    toolConfigIndex,
                    eager: true,
                })
                nextTools.push(...deepCopy(entry.tools))
            }
            replacedPlaceholder = true
        }

        if (!('tools' in dialogCache) || replacedPlaceholder) {
            setDialogTools(nextTools)
        }
        return stripRuntime(deepCopy(dialogCache.tools ?? []))
    }

    function getToolNameToCall() {
        const toolNameToCall = {}
        for (const entry of runtimeEntryByHash.values()) {
            Object.assign(toolNameToCall, entry.toolNameToCall)
        }
        return toolNameToCall
    }

    function getToolNameToRequireApproval() {
        const toolNameToRequireApproval = {}
        for (const entry of runtimeEntryByHash.values()) {
            Object.assign(toolNameToRequireApproval, entry.toolNameToRequireApproval)
        }
        return toolNameToRequireApproval
    }

    async function refreshAllTools() {
        const nextAllTools = []
        for (const { toolConfig, index, source } of visibleToolConfigItems.value) {
            const entry = await prepareRuntimeEntry({
                toolConfig,
                source,
                toolConfigIndex: index,
                eager: source === 'preset' && toolConfig.type === 'mcp',
            })
            if (toolConfig.type === 'mcp' && !entry.tools.length) {
                const placeholder = buildMcpPlaceholderFromConfig(toolConfig, index, source)
                getToolRuntime(placeholder).hash = entry.configHash
                nextAllTools.push(placeholder)
                continue
            }
            nextAllTools.push(...deepCopy(entry.tools))
        }
        allTools.value = nextAllTools
    }

    async function syncDialogToolsFromConfigsIfNeeded() {
        const dialogCache = getDialogCacheValue()
        if (!dialogCache?.tool_configs?.length || 'tools' in dialogCache) {
            return
        }
        setDialogTools(await buildToolsFromToolConfigs(dialogCache.tool_configs))
    }

    function registerDialogCache(dialogCache) {
        registeredDialogCache.value = dialogCache
    }

    async function appendToolToDialog(allToolIndex = -1) {
        if (allToolIndex < 0 || allToolIndex >= allTools.value.length) {
            return
        }
        const dialogCache = getDialogCacheValue()
        if (!dialogCache) {
            return
        }
        if (!('tools' in dialogCache)) {
            await syncDialogToolsFromConfigsIfNeeded()
        }
        const nextTools = deepCopy(dialogCache.tools ?? [])
        nextTools.push(deepCopy(allTools.value[allToolIndex]))
        setDialogTools(nextTools)
    }

    async function removeSelectedTool(selectedToolIndex = -1) {
        const dialogCache = getDialogCacheValue()
        if (!dialogCache?.tools?.length || selectedToolIndex < 0 || selectedToolIndex >= dialogCache.tools.length) {
            return
        }
        const nextTools = deepCopy(dialogCache.tools)
        nextTools.splice(selectedToolIndex, 1)
        setDialogTools(nextTools)
    }

    watch(presetToolConfigsInput, function watchPresetToolConfigs(nextPresetToolConfigs, _oldValue, onCleanup) {
        let expired = false
        onCleanup(() => {
            expired = true
        })
        presetToolReadyPromise.value = (async () => {
            const presetEntries = await Promise.all(nextPresetToolConfigs.map((toolConfig, toolConfigIndex) => (
                prepareRuntimeEntry({
                    toolConfig,
                    source: 'preset',
                    toolConfigIndex,
                    eager: true,
                })
            )))
            if (!expired) {
                const nextPresetConfigHashToIndex = {}
                for (const [toolConfigIndex, entry] of presetEntries.entries()) {
                    nextPresetConfigHashToIndex[entry.configHash] = toolConfigIndex
                }
                presetConfigHashToIndex.value = nextPresetConfigHashToIndex
            }
        })()
    }, { deep: true, immediate: true, flush: 'sync' })

    watch([dataToolConfigs, presetToolConfigsInput], function watchMatchedDataConfigs(_values, _oldValues, onCleanup) {
        let expired = false
        onCleanup(() => {
            expired = true
        })
            ; (async () => {
                const matchedIndex = await matchTwoToolLists(dataToolConfigs.value, presetToolConfigsInput.value)
                if (!expired) {
                    matchedDataToPresetIndex.value = matchedIndex
                }
            })().catch(error => {
                console.error(error)
            })
    }, { deep: true, immediate: true, flush: 'sync' })

    watch([visibleToolConfigItems, runtimeVersion], function watchAllTools(_values, _oldValues, onCleanup) {
        let expired = false
        onCleanup(() => {
            expired = true
        })
            ; (async () => {
                await refreshAllTools()
                if (!expired) {
                    await syncDialogToolsFromConfigsIfNeeded()
                }
            })().catch(error => {
                console.error(error)
            })
    }, { deep: true, immediate: true, flush: 'sync' })

    watch([allTools, currentDialogTools], function watchMatchedTools(_values, _oldValues, onCleanup) {
        let expired = false
        onCleanup(() => {
            expired = true
        })
            ; (async () => {
                const matchedIndex = await matchTwoToolLists(allTools.value, currentDialogTools.value)
                if (!expired) {
                    matchedAllToSelectedIndex.value = matchedIndex
                }
            })().catch(error => {
                console.error(error)
            })
    }, { deep: true, immediate: true, flush: 'sync' })

    function checkCallReady(toolCalls = []) {
        const toolNameToCall = getToolNameToCall()
        const isReadys = toolCalls.map(toolCall => toolCall.function.name in toolNameToCall)
        const unreadyToolNames = [...new Set(toolCalls
            .filter((toolCall, index) => !isReadys[index])
            .map(toolCall => toolCall.function.name))]
        return {
            isReadys,
            allReady: isReadys.every(Boolean),
            unreadyToolNames,
        }
    }

    function checkRequireApproval(toolCalls = []) {
        const toolNameToRequireApproval = getToolNameToRequireApproval()
        const approvalToolNames = [...new Set(toolCalls
            .filter(toolCall => toolNameToRequireApproval[toolCall.function.name] === 'always')
            .map(toolCall => toolCall.function.name))]
        return {
            needApproval: approvalToolNames.length > 0,
            approvalToolNames,
        }
    }

    async function call(toolCalls = []) {
        await buildRequestTools()
        const toolNameToCall = getToolNameToCall()
        return await Promise.all(toolCalls.map(async (toolCall) => ({
            role: 'tool',
            content: await toolNameToCall[toolCall.function.name](toolCall),
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
        })))
    }

    async function close() {
        await Promise.allSettled(Array.from(runtimeEntryByHash.values()).flatMap(entry => entry.closers.map(closeClient => closeClient())))
    }

    return {
        presetToolConfigsInput,
        presetToolReadyPromise,
        dataToolConfigs,
        visibleToolConfigItems,
        allTools,
        matchedAllToSelectedIndex,
        currentDialogTools,
        registerDialogCache,
        appendToolToDialog,
        removeSelectedTool,
        buildRequestTools,
        checkCallReady,
        checkRequireApproval,
        call,
        close,
    }
}

export function ToolCallStateClosure({
    toolManageState,
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

    async function runPreparedToolCalls({
        toolCalls,
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
            const toolMessages = await toolManageState.call(toolCalls)
            const discardReason = getToolCallDiscardReason({
                toolCallStatus: toolCallStatus.value,
                toolCallID,
            })
            if (discardReason) {
                logDiscardedToolCall(toolCallID, toolCalls, discardReason)
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
                logDiscardedToolCall(toolCallID, toolCalls, discardReason)
                return {
                    readyStatus,
                    toolMessages: null,
                    info: discardReason
                }
            }
            toolCallStatus.value.calling = false
            return {
                readyStatus,
                toolMessages: null,
                info: error
            }
        }
    }

    async function maybeAutoCallToolCalls(toolCalls = []) {

        await toolManageState.buildRequestTools()
        const readyStatus = toolManageState.checkCallReady(toolCalls)

        if (!readyStatus.allReady) {
            return {
                readyStatus: readyStatus,
                toolMessages: null,
                info: "!readyStatus.allReady"
            }
        }
        const hasRemainingAutoApproveRuns = (
            toolCallStatus.value.approvedRunCount < toolCallStatus.value.autoApproveRunNum
        )
        if (!hasRemainingAutoApproveRuns) {
            return {
                readyStatus: readyStatus,
                toolMessages: null,
                info: "!hasRemainingAutoApproveRuns"
            }
        }
        return await runPreparedToolCalls({
            toolCalls,
            readyStatus,
        }, true)
    }

    function stopToolCalls() {
        toolCallStatus.value.calling = false
    }

    return {
        toolCallStatus,
        setAutoApproveLoop,
        maybeAutoCallToolCalls,
        stopToolCalls,
    }
}
