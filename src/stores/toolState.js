import { computed, isRef, ref, watch } from 'vue'
import { deepCopy } from '../utils/commonUtils.js'
import {
    buildDuplicatedToolNameError,
    buildFunctionToolFromConfig,
    buildMcpPlaceholderFromConfig,
    buildMcpToolSourceLabel,
    buildToolConfigTagName,
    checkToolCallReadyStatus,
    formatToolName,
    getToolRuntime,
    getToolCallDiscardReason,
    hashToolSchema,
    logDiscardedToolCall,
    matchTwoToolLists,
    mcpToolResultToContent,
    stripRuntime,
} from '../utils/toolUtils.js'

export function ToolManagerStateClosure({ presetToolConfigs = [] } = {}) {
    const presetToolConfigsInput = isRef(presetToolConfigs) ? presetToolConfigs : ref(deepCopy(presetToolConfigs || []))
    const registeredDialogCache = ref(null)
    const runtimeVersion = ref(0)
    const runtimeRecordByHash = new Map()
    const presetConfigHashToIndex = ref({})
    const allTools = ref([])
    const matchedAllToSelectedIndex = ref({})

    let resolvePresetToolReady = () => { }
    let rejectPresetToolReady = () => { }
    const presetToolReadyPromise = ref(new Promise((resolve, reject) => {
        resolvePresetToolReady = resolve
        rejectPresetToolReady = reject
    }))

    const dataToolConfigs = computed(() => registeredDialogCache.value?.value?.tool_configs || [])
    const toolConfigsComputed = computed(() => [...dataToolConfigs.value, ...presetToolConfigsInput.value])
    const toolConfigItemsComputed = computed(() => [
        ...dataToolConfigs.value.map((toolConfig, index) => ({ toolConfig, index, source: 'data' })),
        ...presetToolConfigsInput.value.map((toolConfig, index) => ({ toolConfig, index, source: 'preset' })),
    ])
    const currentDialogTools = computed(() => registeredDialogCache.value?.value?.tools || [])

    function touchRuntimeVersion() {
        runtimeVersion.value++
    }

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

    function applyRequireApprovalToRecord(record, toolConfig = {}) {
        const requireApproval = toolConfig.require_approval || 'never'
        record.requireApproval = requireApproval
        for (const tool of record.tools || []) {
            const toolName = tool.function?.name
            if (toolName) {
                record.toolNameToRequireApproval[toolName] = requireApproval
            }
        }
    }

    async function ensureFunctionRecord(record, toolConfig = {}, toolConfigIndex = 0, source = 'data') {
        if (record.tools.length) {
            applyRequireApprovalToRecord(record, toolConfig)
            return record
        }
        const tool = buildFunctionToolFromConfig(toolConfig)
        const runtime = getToolRuntime(tool)
        runtime.tool_name_format = toolConfig.tool_name_format
        runtime.displayName = tool.function?.name || buildToolConfigTagName(toolConfig, toolConfigIndex, source)
        runtime.hash = await hashToolSchema(toolConfig)
        record.tools = [tool]
        applyRequireApprovalToRecord(record, toolConfig)
        touchRuntimeVersion()
        return record
    }

    async function ensureMcpRecord(record, toolConfig = {}, toolConfigIndex = 0) {
        if (record.tools.length) {
            return record
        }
        if (!record.initPromise) {
            record.initPromise = (async () => {
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
                        name: 'frontend-agent',
                        version: '0.1.0',
                    })
                    client.onerror = (error) => {
                        console.error('[OnPandaWeb MCP] Client error.', error)
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
                        await registerTool(tool, mcpTool.name, record.requireApproval)
                        nextToolNameToCall[formattedToolName] = async (toolCall) => {
                            const result = await client.callTool({
                                name: mcpTool.name,
                                arguments: JSON.parse(toolCall.function.arguments || '{}'),
                            })
                            return mcpToolResultToContent(result)
                        }
                    }

                    record.tools = nextTools
                    record.toolNameToCall = nextToolNameToCall
                    record.toolNameToRequireApproval = nextToolNameToRequireApproval
                    record.closers = nextClosers
                    touchRuntimeVersion()
                    return record
                } catch (error) {
                    await Promise.allSettled(nextClosers.map(closeClient => closeClient()))
                    throw error
                }
            })()
            record.initPromise = record.initPromise.catch((error) => {
                record.initPromise = null
                throw error
            })
        }
        return await record.initPromise
    }

    async function ensureRuntimeRecord(toolConfig = {}, { source = 'data', toolConfigIndex = 0, eager = false } = {}) {
        const configHash = await hashToolSchema(toolConfig)
        let record = runtimeRecordByHash.get(configHash)
        if (!record) {
            record = {
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
            runtimeRecordByHash.set(configHash, record)
        }
        if (source === 'preset') {
            record.source = 'preset'
        }
        if (toolConfig.type === 'function') {
            await ensureFunctionRecord(record, toolConfig, toolConfigIndex, source)
        } else if (toolConfig.type === 'mcp') {
            applyRequireApprovalToRecord(record, toolConfig)
            if (eager) {
                await ensureMcpRecord(record, toolConfig, toolConfigIndex)
            }
        } else {
            throw new Error(`Unsupported tool config type: ${toolConfig.type}`)
        }
        return record
    }

    async function buildToolsFromToolConfigs(toolConfigs = []) {
        const matchedDataToPresetIndex = await matchTwoToolLists(toolConfigs, presetToolConfigsInput.value)
        const nextTools = []
        for (const [toolConfigIndex, toolConfig] of toolConfigs.entries()) {
            if (matchedDataToPresetIndex[toolConfigIndex] != null) {
                const matchedPresetIndex = matchedDataToPresetIndex[toolConfigIndex]
                const presetRecord = await ensureRuntimeRecord(presetToolConfigsInput.value[matchedPresetIndex], {
                    source: 'preset',
                    toolConfigIndex: matchedPresetIndex,
                    eager: true,
                })
                nextTools.push(...deepCopy(presetRecord.tools))
                continue
            }
            const record = await ensureRuntimeRecord(toolConfig, { source: 'data', toolConfigIndex, eager: toolConfig.type === 'function' })
            if (toolConfig.type === 'function') {
                nextTools.push(...deepCopy(record.tools))
                continue
            }
            const placeholder = buildMcpPlaceholderFromConfig(toolConfig, toolConfigIndex, 'data')
            getToolRuntime(placeholder).hash = record.configHash
            nextTools.push(placeholder)
        }
        return nextTools
    }

    async function buildRequestTools() {
        const dialogCache = getDialogCacheValue()
        if (!dialogCache) {
            return []
        }
        if (!('tools' in dialogCache) && dialogCache.tool_configs?.length) {
            setDialogTools(await buildToolsFromToolConfigs(dialogCache.tool_configs))
        }
        const currentToolsValue = getDialogCacheValue()?.tools || []
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
                const presetRecord = await ensureRuntimeRecord(presetToolConfigsInput.value[matchedPresetIndex], {
                    source: 'preset',
                    toolConfigIndex: matchedPresetIndex,
                    eager: true,
                })
                nextTools.push(...deepCopy(presetRecord.tools))
            } else {
                const toolConfigIndex = runtime.toolConfigIndex ?? -1
                const toolConfig = dialogCache.tool_configs?.[toolConfigIndex] || tool
                const record = await ensureRuntimeRecord(toolConfig, {
                    source: runtime.source || 'data',
                    toolConfigIndex,
                    eager: true,
                })
                nextTools.push(...deepCopy(record.tools))
            }
            replacedPlaceholder = true
        }

        if (!('tools' in dialogCache) || replacedPlaceholder) {
            setDialogTools(nextTools)
        }
        return stripRuntime(deepCopy(getDialogCacheValue()?.tools || []))
    }

    function getToolNameToCall() {
        const toolNameToCall = {}
        for (const record of runtimeRecordByHash.values()) {
            Object.assign(toolNameToCall, record.toolNameToCall)
        }
        return toolNameToCall
    }

    function getToolNameToRequireApproval() {
        const toolNameToRequireApproval = {}
        for (const record of runtimeRecordByHash.values()) {
            Object.assign(toolNameToRequireApproval, record.toolNameToRequireApproval)
        }
        return toolNameToRequireApproval
    }

    async function refreshAllTools() {
        const nextAllTools = []
        for (const { toolConfig, index, source } of toolConfigItemsComputed.value) {
            const record = await ensureRuntimeRecord(toolConfig, {
                source,
                toolConfigIndex: index,
                eager: source === 'preset' && toolConfig.type === 'mcp',
            })
            if (toolConfig.type === 'mcp' && !record.tools.length) {
                const placeholder = buildMcpPlaceholderFromConfig(toolConfig, index, source)
                getToolRuntime(placeholder).hash = record.configHash
                nextAllTools.push(placeholder)
                continue
            }
            nextAllTools.push(...deepCopy(record.tools))
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

    async function updateMatchedTools() {
        matchedAllToSelectedIndex.value = await matchTwoToolLists(allTools.value, currentDialogTools.value)
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
        const nextTools = deepCopy(getDialogCacheValue()?.tools || [])
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

    watch(presetToolConfigsInput, (nextPresetToolConfigs) => {
        presetToolReadyPromise.value = new Promise((resolve, reject) => {
            resolvePresetToolReady = resolve
            rejectPresetToolReady = reject
        })
        presetToolReadyPromise.value.catch(() => { })
        const localResolvePresetToolReady = resolvePresetToolReady
        const localRejectPresetToolReady = rejectPresetToolReady
        ; (async () => {
            const nextPresetConfigHashToIndex = {}
            await Promise.all(nextPresetToolConfigs.map(async (toolConfig, toolConfigIndex) => {
                const record = await ensureRuntimeRecord(toolConfig, {
                    source: 'preset',
                    toolConfigIndex,
                    eager: true,
                })
                nextPresetConfigHashToIndex[record.configHash] = toolConfigIndex
            }))
            presetConfigHashToIndex.value = nextPresetConfigHashToIndex
            await syncDialogToolsFromConfigsIfNeeded()
            await refreshAllTools()
            await updateMatchedTools()
            localResolvePresetToolReady()
        })().catch((error) => {
            localRejectPresetToolReady(error)
        })
    }, { deep: true, immediate: true, flush: 'sync' })

    let refreshAllToolsID = 0
    watch([toolConfigItemsComputed, runtimeVersion], () => {
        const currentRefreshID = ++refreshAllToolsID
        ; (async () => {
            await refreshAllTools()
            if (currentRefreshID !== refreshAllToolsID) {
                return
            }
            await syncDialogToolsFromConfigsIfNeeded()
            await updateMatchedTools()
        })().catch(error => {
            console.error(error)
        })
    }, { deep: true, immediate: true, flush: 'sync' })

    let updateMatchedToolsID = 0
    watch([allTools, currentDialogTools], () => {
        const currentUpdateID = ++updateMatchedToolsID
        ; (async () => {
            const matchedIndex = await matchTwoToolLists(allTools.value, currentDialogTools.value)
            if (currentUpdateID !== updateMatchedToolsID) {
                return
            }
            matchedAllToSelectedIndex.value = matchedIndex
        })().catch(error => {
            console.error(error)
        })
    }, { deep: true, immediate: true, flush: 'sync' })

    function checkCallReady(toolCalls = []) {
        return checkToolCallReadyStatus(toolCalls, getToolNameToCall())
    }

    function checkRequireApproval(toolCalls = []) {
        const toolNameToRequireApproval = getToolNameToRequireApproval()
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
        await Promise.allSettled(Array.from(runtimeRecordByHash.values()).flatMap(record => record.closers.map(closeClient => closeClient())))
    }

    return {
        presetToolConfigsInput,
        presetToolReadyPromise,
        dataToolConfigs,
        toolConfigsComputed,
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
