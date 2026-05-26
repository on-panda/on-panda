import { useGlobalStore } from '../../stores/globalStore.js'
import { ObjctKeyToCamelCaseNaming, deepCopy } from '../commonUtils.js'
import { parseSseJsonStream, retryWithSchedule, normalizeUsage } from './utils.js'

const ANTHROPIC_VERSION = '2023-06-01'
const TOOL_ID_CHAR_TO_TOKEN = {
    '.': 'DOT',
    ':': 'COLON',
}

function encodeAnthropicToolId(id) {
    return [...id].map(char => {
        if (/^[a-zA-Z0-9_-]$/.test(char)) {
            return char
        }
        const token = TOOL_ID_CHAR_TO_TOKEN[char] || `U${char.codePointAt(0).toString(16).toUpperCase()}`
        return `-_${token}_-`
    }).join('')
}

function contentPartToAnthropic(part) {
    if (part.type === 'text') {
        return { type: 'text', text: part.text }
    }
    if (part.type === 'image_url') {
        const dataUrl = part.image_url.url
        if (!dataUrl.startsWith('data:')) {
            return {
                type: 'image',
                source: {
                    type: 'url',
                    url: dataUrl,
                },
            }
        }
        const [mediaTypePart, data] = dataUrl.split(';base64,')
        return {
            type: 'image',
            source: {
                type: 'base64',
                media_type: mediaTypePart.slice('data:'.length),
                data,
            },
        }
    }
    if (part.type === 'input_audio' || part.type === 'audio_url') {
        return {
            type: 'text',
            text: JSON.stringify(part),
        }
    }
    return part
}

function messageContentToAnthropic(content) {
    if (typeof content === 'string') {
        return content
    }
    return content.map(contentPartToAnthropic)
}

function concatAnthropicContent(content1, content2) {
    return (Array.isArray(content1) ? content1 : [{ type: 'text', text: content1 }])
        .concat(Array.isArray(content2) ? content2 : [{ type: 'text', text: content2 }])
}

function toolCallToAnthropicContent(toolCall) {
    return {
        type: 'tool_use',
        id: encodeAnthropicToolId(toolCall.id),
        name: toolCall.function.name,
        input: JSON.parse(toolCall.function.arguments || '{}'),
    }
}

function assistantMessageToAnthropicContent(message) {
    const content = []
    if (message.reasoning) {
        const thinking = {
            type: 'thinking',
            thinking: message.reasoning,
        }
        if (message.sidecar?.anthropic?.thinking?.signature) {
            thinking.signature = message.sidecar.anthropic.thinking.signature
        }
        content.push(thinking)
    }
    if (message.content) {
        content.push({ type: 'text', text: message.content })
    }
    content.push(...(message.tool_calls || []).map(toolCallToAnthropicContent))
    return content
}

function toolMessageToAnthropicContent(message) {
    const content = typeof message.content === 'string'
        ? message.content
        : messageContentToAnthropic(message.content)
    return [{
        type: 'tool_result',
        tool_use_id: encodeAnthropicToolId(message.tool_call_id),
        content,
    }]
}

function collectSystemMessages(messages) {
    const systemMessages = []
    for (let index = 0; index < messages.length; index++) {
        const message = messages[index]
        if (message.role !== 'system' && message.role !== 'developer') {
            return { systemMessages, firstNonSystemIndex: index }
        }
        systemMessages.push(message)
    }
    return { systemMessages, firstNonSystemIndex: messages.length }
}

function assertNoMiddleSystemMessages(messages) {
    for (const message of messages) {
        if (message.role === 'system' || message.role === 'developer') {
            throw new Error('Anthropic messages only supports leading contiguous system/developer messages.')
        }
    }
}

function convertTool(tool) {
    return {
        name: tool.function.name,
        description: tool.function.description,
        input_schema: tool.function.parameters,
    }
}

function buildAnthropicMessagesRequest(openaiRequestBody) {
    const body = deepCopy(openaiRequestBody)
    const { systemMessages, firstNonSystemIndex } = collectSystemMessages(body.messages || [])
    const messages = body.messages.slice(firstNonSystemIndex)
    assertNoMiddleSystemMessages(messages)

    const maxTokens = body.max_tokens || body.max_completion_tokens || 1025
    const requestBody = {
        model: body.model,
        stream: true,
        max_tokens: maxTokens,
        messages: [],
    }
    for (const message of messages.map(message => {
        if (message.role === 'assistant') {
            return {
                role: 'assistant',
                content: assistantMessageToAnthropicContent(message),
            }
        }
        if (message.role === 'tool') {
            return {
                role: 'user',
                content: toolMessageToAnthropicContent(message),
            }
        }
        return {
            role: message.role,
            content: messageContentToAnthropic(message.content),
        }
    })) {
        const lastMessage = requestBody.messages[requestBody.messages.length - 1]
        if (lastMessage?.role === message.role) {
            lastMessage.content = concatAnthropicContent(lastMessage.content, message.content)
        } else {
            requestBody.messages.push(message)
        }
    }
    if (systemMessages.length) {
        // TODO: It may be better to automatically convert non-leading system/developer messages into a user message template.
        requestBody.system = systemMessages.map(message => message.content || '').join('\n\n')
    }
    for (const key of ['temperature', 'top_p', 'top_k', 'stop_sequences', 'thinking', 'output_config']) {
        if (body[key] != null) {
            requestBody[key] = body[key]
        }
    }
    if (body.stop) {
        requestBody.stop_sequences = Array.isArray(body.stop) ? body.stop : [body.stop]
    }
    if (body.tools?.length) {
        requestBody.tools = body.tools.map(convertTool)
    }
    if (!requestBody.thinking) {
        const modelName = `${body.model || ''}`.toLowerCase()
        if (modelName.includes('claude-opus') || modelName.includes('claude-sonnet')) {
            requestBody.thinking = { type: 'adaptive' }
            if (!requestBody.output_config) {
                requestBody.output_config = { effort: 'max' }
            }
        } else {
            requestBody.thinking = {
                type: 'enabled',
                budget_tokens: maxTokens - 1,
            }
        }
    }
    return requestBody
}

function mapFinishReason(stopReason) {
    return {
        end_turn: 'stop',
        max_tokens: 'length',
        stop_sequence: 'stop',
        tool_use: 'tool_calls',
    }[stopReason] || stopReason
}

function createChunk({ messageId, model, delta, finish_reason, usage } = {}) {
    const chunk = {
        id: messageId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{
            index: 0,
            delta,
        }],
    }
    if (finish_reason) {
        chunk.choices[0].finish_reason = finish_reason
    }
    if (usage) {
        chunk.usage = normalizeUsage(usage)
    }
    return chunk
}

function createToolCallStartDelta(block, index) {
    return {
        tool_calls: [{
            index,
            id: block.id,
            type: 'function',
            function: {
                name: block.name,
                arguments: '',
            },
        }],
    }
}

function createToolCallArgumentsDelta(index, argumentsText) {
    return {
        tool_calls: [{
            index,
            function: {
                arguments: argumentsText,
            },
        }],
    }
}

async function* anthropicMessagesStreamToChatCompletionsStream(stream) {
    let messageId
    let model
    let toolCallCount = 0
    const toolCallIndexes = {}
    for await (const event of stream) {
        if (event.type === 'error') {
            throw new Error(`Anthropic messages stream error: ${JSON.stringify(event.error || event)}`)
        }
        if (event.type === 'message_start') {
            messageId = event.message.id
            model = event.message.model
            yield createChunk({
                messageId,
                model,
                delta: { role: event.message.role },
                usage: event.message.usage,
            })
            continue
        }
        if (event.type === 'content_block_start') {
            const block = event.content_block
            if (block.type === 'tool_use') {
                toolCallIndexes[event.index] = toolCallCount
                toolCallCount++
                yield createChunk({
                    messageId,
                    model,
                    delta: createToolCallStartDelta(block, toolCallIndexes[event.index]),
                })
            }
            continue
        }
        if (event.type === 'content_block_delta') {
            const delta = event.delta
            if (delta.type === 'thinking_delta') {
                yield createChunk({
                    messageId,
                    model,
                    delta: { reasoning: delta.thinking },
                })
            } else if (delta.type === 'signature_delta') {
                yield createChunk({
                    messageId,
                    model,
                    delta: { sidecar: { anthropic: { thinking: { signature: delta.signature } } } },
                })
            } else if (delta.type === 'text_delta') {
                yield createChunk({
                    messageId,
                    model,
                    delta: { content: delta.text },
                })
            } else if (delta.type === 'input_json_delta') {
                yield createChunk({
                    messageId,
                    model,
                    delta: createToolCallArgumentsDelta(toolCallIndexes[event.index], delta.partial_json),
                })
            }
            continue
        }
        if (event.type === 'message_delta') {
            yield createChunk({
                messageId,
                model,
                delta: { content: "" },
                finish_reason: mapFinishReason(event.delta.stop_reason),
                usage: event.usage,
            })
        }
    }
}

export async function createAnthropicMessagesStream({ requestBody, apiConfig, signal } = {}) {
    const globalStore = useGlobalStore()
    let body = deepCopy(requestBody)
    if (globalStore.hooks?.beforeCreateChatCompletion?.length) {
        for (let hook of globalStore.hooks.beforeCreateChatCompletion) {
            body = await hook(body)
        }
    }
    body = buildAnthropicMessagesRequest(body)

    const config = ObjctKeyToCamelCaseNaming(apiConfig.client_config)
    const apiProtocol = apiConfig.api_protocol || {}
    const headers = {
        'Content-Type': 'application/json',
    }
    if (apiProtocol.compat_provider) {
        headers.Authorization = `Bearer ${config.apiKey}`
    } else {
        headers['anthropic-version'] = apiProtocol.anthropic_version || ANTHROPIC_VERSION
        headers['x-api-key'] = config.apiKey
    }
    const response = await retryWithSchedule(() => fetch(`${config.baseURL}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
    }), [5000, 30000])

    return anthropicMessagesStreamToChatCompletionsStream(parseSseJsonStream(response))
}
