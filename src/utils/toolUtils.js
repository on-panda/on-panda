import { deepCopy } from './commonUtils.js'

function mcpContentItemToText(item) {
    if (item.type === 'text') {
        return item.text
    }
    if (item.type === 'resource') {
        return JSON.stringify(item.resource, null, 2)
    }
    return JSON.stringify(item, null, 2)
}

function mcpContentItemToMessageContent(item) {
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
    return [{ type: 'text', text: mcpContentItemToText(item) }]
}

export function formatToolName(rawName, toolConfig = {}) {
    if (!toolConfig.tool_name_format) {
        return rawName
    }
    const templateValues = {
        ...toolConfig,
        name: rawName,
    }
    return toolConfig.tool_name_format.replace(/\{([^{}]+)\}/g, (match, key) => {
        if (!(key in templateValues) || templateValues[key] == null) {
            return ''
        }
        return String(templateValues[key])
    })
}

export function buildFunctionToolFromConfig(toolConfig = {}) {
    const tool = deepCopy(toolConfig)
    delete tool.require_approval
    delete tool.tool_name_format
    delete tool.server_label
    tool.function = deepCopy(toolConfig.function || {})
    tool.function.name = formatToolName(toolConfig.function?.name || '', toolConfig)
    return tool
}

export function buildMcpToolSourceLabel(toolConfig = {}, toolConfigIndex, rawName = '') {
    const serverLabel = toolConfig.server_label || toolConfig.server_url || 'mcp'
    return `tool_configs[${toolConfigIndex}] (${serverLabel}${rawName ? ` -> ${rawName}` : ''})`
}

export function buildFunctionToolSourceLabel(toolConfig = {}, toolConfigIndex) {
    const rawName = toolConfig.function?.name || 'function'
    return `tool_configs[${toolConfigIndex}] (${rawName})`
}

export function buildDuplicatedToolNameError(toolName, previousSource, source) {
    const error = new Error(`Duplicated tool name "${toolName}" from ${previousSource} and ${source}. Add or adjust \`tool_name_format\` so the final tool names stay unique.`)
    error.name = 'ToolConfigError'
    return error
}

export function mcpToolResultToContent(result) {
    if (result.content?.length) {
        return result.content.flatMap((item, index) => (
            (index === 0 ? [] : [{ type: 'text', text: '\n' }]).concat(mcpContentItemToMessageContent(item))
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

export function checkToolCallReadyStatus(toolCalls = [], toolNameToCall = {}) {
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

export function buildRejectedToolResponses(toolCalls = [], toolCallsRejectedGuidance = '') {
    const guidance = toolCallsRejectedGuidance.trim()
    const content = guidance ? `<tool_calls_rejected_notice>
The user rejected the tool_calls.
<guidance_from_user>
${guidance}
</guidance_from_user>
</tool_calls_rejected_notice>` : `<tool_calls_rejected_notice>
The user rejected the tool_calls.
</tool_calls_rejected_notice>`
    return toolCalls.map(toolCall => ({
        role: 'tool',
        content,
        tool_call_id: toolCall.id,
        name: toolCall.function?.name,
    }))
}

export function dropStaleToolAsset(body = {}) {
    const maxToolMessageAssets = Math.max(0, Number(body.max_tool_message_assets) || 0)
    const toolMessageAssetKeepRounds = Math.max(0, Number(body.tool_message_asset_keep_rounds) || 0)

    delete body.max_tool_message_assets
    delete body.tool_message_asset_keep_rounds

    if (!maxToolMessageAssets && !toolMessageAssetKeepRounds) {
        return body
    }

    const assetRecords = []
    const toolCallIdToRoundIndex = {}
    let currentRoundIndex = -1

    for (const message of body.messages || []) {
        if (message.tool_calls?.length) {
            currentRoundIndex++
            for (const toolCall of message.tool_calls) {
                if (toolCall.id) {
                    toolCallIdToRoundIndex[toolCall.id] = currentRoundIndex
                }
            }
        }
        if (message.role !== 'tool' || !Array.isArray(message.content)) {
            continue
        }
        for (const [chunkIndex, chunk] of message.content.entries()) {
            if (chunk.type !== 'image_url' && chunk.type !== 'audio_url') {
                continue
            }
            assetRecords.push({
                assetIndex: assetRecords.length,
                chunkIndex,
                message,
                roundIndex: toolCallIdToRoundIndex[message.tool_call_id],
                type: chunk.type.replace('_url', ''),
            })
        }
    }

    if (!assetRecords.length) {
        return body
    }

    const keepAssetIndexes = new Set()
    if (maxToolMessageAssets > 0) {
        for (const record of assetRecords.slice(-maxToolMessageAssets)) {
            keepAssetIndexes.add(record.assetIndex)
        }
    }
    if (toolMessageAssetKeepRounds > 0) {
        const minRoundIndexToKeep = currentRoundIndex - toolMessageAssetKeepRounds + 1
        for (const record of assetRecords) {
            if (record.roundIndex >= minRoundIndexToKeep) {
                keepAssetIndexes.add(record.assetIndex)
            }
        }
    }

    for (const record of assetRecords) {
        if (keepAssetIndexes.has(record.assetIndex)) {
            continue
        }
        record.message.content.splice(record.chunkIndex, 1, {
            type: 'text',
            text: `<drop_stale_tool_asset tool_asset_index=${record.assetIndex}>To save context tokens, this ${record.type} was dropped in the request.</drop_stale_tool_asset>`,
        })
    }

    return body
}

export function getToolCallDiscardReason({
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

export function logDiscardedToolCall(toolCallID, toolCalls = [], reason) {
    const toolNames = toolCalls.map(toolCall => toolCall.function?.name).filter(Boolean)
    console.log(`[tool call ${toolCallID}] discard ${toolNames.join(', ') || 'unknown tools'}: ${reason}`)
}
