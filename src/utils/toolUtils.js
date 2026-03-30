import { deepCopy, hashObjectSHA256Base64 } from './commonUtils.js'

export const TEST_TOOL_CONFIGS = [
    {
        type: 'mcp',
        server_url: `${typeof window === 'undefined' ? '' : window.location.origin}/bypass-CORS/http://127.0.0.1:9300/mcp`,
        require_approval: 'always',
    },
    {
        type: 'function',
        function: {
            name: 'get_weather',
            description: 'Get the current weather in a given location',
            parameters: {
                type: 'object',
                properties: {
                    location: {
                        type: 'string',
                        description: "City and state, e.g., 'San Francisco, CA'",
                    },
                    unit: {
                        type: 'string',
                        enum: ['celsius', 'fahrenheit'],
                    },
                },
                required: ['location', 'unit'],
            },
        },
    },
]

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

export function getToolRuntime(target = {}) {
    if (!target.runtime || typeof target.runtime !== 'object') {
        target.runtime = {}
    }
    return target.runtime
}

export function buildToolConfigTagName(toolConfig = {}, toolConfigIndex = 0, source = 'data') {
    if (toolConfig.type === 'mcp') {
        return `mcp:${toolConfig.server_label || `${source}${toolConfigIndex + 1}`}`
    }
    return toolConfig.function.name
}

export function buildMcpPlaceholderFromConfig(toolConfig = {}, toolConfigIndex = 0, source = 'data') {
    const placeholder = deepCopy(toolConfig)
    const runtime = getToolRuntime(placeholder)
    runtime.isPlaceholder = true
    runtime.source = source
    runtime.toolConfigIndex = toolConfigIndex
    runtime.displayName = `mcp:${source}${toolConfigIndex + 1}`
    return placeholder
}

function pickHashFields(obj = {}, keys = []) {
    const nextObject = {}
    for (const key of keys) {
        if (obj[key] !== undefined) {
            nextObject[key] = obj[key]
        }
    }
    return nextObject
}

export async function hashToolSchema(toolOrConfig = {}) {
    const runtime = getToolRuntime(toolOrConfig)
    if (runtime.hash) {
        return runtime.hash
    }

    const hashInput = { type: toolOrConfig.type }
    if (toolOrConfig.type === 'mcp') {
        Object.assign(hashInput, pickHashFields(toolOrConfig, ['server_url', 'tool_name_format']))
    } else if (toolOrConfig.type === 'function') {
        const toolNameFormat = toolOrConfig.tool_name_format ?? runtime.tool_name_format
        if (toolNameFormat !== undefined) {
            hashInput.tool_name_format = toolNameFormat
        }
        hashInput.function = pickHashFields(toolOrConfig.function, ['name', 'description', 'parameters'])
    }

    runtime.hash = await hashObjectSHA256Base64(hashInput)
    return runtime.hash
}

export async function matchTwoToolLists(tools1 = [], tools2 = []) {
    const [hashes1, hashes2] = await Promise.all([
        Promise.all(tools1.map(tool => hashToolSchema(tool))),
        Promise.all(tools2.map(tool => hashToolSchema(tool))),
    ])
    const usedIndexes2 = new Set()
    const matchedIndex1ToIndex2 = {}

    for (const [index1, hash1] of hashes1.entries()) {
        for (const [index2, hash2] of hashes2.entries()) {
            if (usedIndexes2.has(index2) || hash1 !== hash2) {
                continue
            }
            matchedIndex1ToIndex2[index1] = index2
            usedIndexes2.add(index2)
            break
        }
    }

    return matchedIndex1ToIndex2
}

export function stripRuntime(value) {
    if (Array.isArray(value)) {
        return value.map(stripRuntime)
    }
    if (!value || typeof value !== 'object') {
        return value
    }
    const nextValue = {}
    for (const [key, childValue] of Object.entries(value)) {
        if (key === 'runtime') {
            continue
        }
        nextValue[key] = stripRuntime(childValue)
    }
    return nextValue
}

export function buildMcpToolSourceLabel(toolConfig = {}, toolConfigIndex, rawName = '') {
    const serverLabel = toolConfig.server_label || toolConfig.server_url || 'mcp'
    return `tool_configs[${toolConfigIndex}] (${serverLabel}${rawName ? ` -> ${rawName}` : ''})`
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

export function buildRejectedToolMessages(toolCalls = [], toolCallsRejectedGuidance = '') {
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
        name: toolCall.function.name,
    }))
}

export function getToolCallDiscardReason({
    toolCallStatus,
    toolCallID,
}) {
    if (!toolCallStatus.calling) {
        return 'calling stopped'
    }
    if (toolCallID !== toolCallStatus.callTimes) {
        return `call ID mismatch ${toolCallID} !== ${toolCallStatus.callTimes}`
    }
    return ''
}

export function logDiscardedToolCall(toolCallID, toolCalls = [], reason) {
    const toolNames = toolCalls.map(toolCall => toolCall.function.name)
    console.log(`[tool call ${toolCallID}] discard ${toolNames.join(', ') || 'unknown tools'}: ${reason}`)
}
