export function applyImageDetailLevel(body = {}) {
    const imageDetailLevel = body.image_detail_level
    delete body.image_detail_level

    if (!imageDetailLevel) {
        return body
    }

    for (const message of body.messages || []) {
        if (typeof message.content !== 'object') {
            continue
        }
        for (const chunk of message.content) {
            if (chunk.type.indexOf('image') !== -1) {
                chunk[chunk.type].detail = imageDetailLevel
            }
        }
    }

    return body
}

export function assertNoLegacyChatConfigTools(chatConfig = {}) {
    if ('tools' in (chatConfig || {})) {
        throw new Error('`chat_config.tools` is no longer supported. Move tool definitions to `dialog.tool_configs`, or store the final request tools in `dialog.tools`.')
    }
}

export function dropStaleToolAsset(body = {}) {
    const maxToolAssets = Math.max(0, Number(body.max_tool_assets) || 0)
    const toolAssetKeepRounds = Math.max(0, Number(body.tool_asset_keep_rounds) || 0)

    delete body.max_tool_assets
    delete body.tool_asset_keep_rounds

    if (!maxToolAssets && !toolAssetKeepRounds) {
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
    if (maxToolAssets > 0) {
        for (const record of assetRecords.slice(-maxToolAssets)) {
            keepAssetIndexes.add(record.assetIndex)
        }
    }
    if (toolAssetKeepRounds > 0) {
        const minRoundIndexToKeep = currentRoundIndex - toolAssetKeepRounds + 1
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
        const info = `To save context tokens, this ${record.type} was dropped in the request.`
        record.message.content.splice(record.chunkIndex, 1, {
            type: 'text',
            text: `<|drop_stale_tool_asset_start|>${JSON.stringify({
                tool_asset_index: record.assetIndex,
                type: record.type,
                info,
            })}<|drop_stale_tool_asset_end|>`,
        })
    }

    return body
}
