import { useGlobalStore } from '../../stores/globalStore.js'
import { ObjctKeyToCamelCaseNaming, deepCopy } from '../commonUtils.js'
import { parsePartialJsonObject } from '../partialJsonUtils.js'
import { buildResponseTemplate } from '../responseTemplates/index.js'
import { hashMessageOutput, mergeHeaders, parseSseJsonStream, retryWithSchedule, normalizeUsage, omitNullRequestFields } from './utils.js'

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
    if (part.type === 'input_audio' || part.type === 'audio_url' || part.type === 'video_url') {
        throw new Error(`Anthropic messages does not support content part type: ${part.type}`)
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

async function assistantMessageToAnthropicContent(message) {
    const anthropicSidecar = message.sidecar?.anthropic_messages
    // A flat message cannot keep the interleaved blocks, so replay the original content unless the message was edited.
    if (anthropicSidecar && anthropicSidecar.message_hash === await hashMessageOutput(message)) {
        // Tool ids are encoded the same as the tool_use_id of tool results.
        return anthropicSidecar.content.map(block => block.type === 'tool_use' ? { ...block, id: encodeAnthropicToolId(block.id) } : block)
    }
    // Signed thinking keeps its model context, even if the reasoning text was edited.
    const content = (anthropicSidecar?.content || []).filter(block => block.signature || block.type === 'redacted_thinking')
    if (!content.length && message.reasoning) {
        // Reasoning from other sources has no signature, which compatible providers accept.
        content.push({ type: 'thinking', thinking: message.reasoning })
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

// Models that reject manual extended thinking and non-default temperature, top_p and top_k.
function isClaudeAdaptiveThinkingModel(model) {
    const modelName = model.toLowerCase()
    return /claude-(?:opus-(?:4[-.][78]|5)|sonnet-5|haiku-5|fable-5(?:[-.]1)?|mythos)/.test(modelName)
}

async function buildAnthropicMessagesRequest(openaiRequestBody) {
    const body = deepCopy(openaiRequestBody)
    const { systemMessages, firstNonSystemIndex } = collectSystemMessages(body.messages || [])
    const messages = body.messages.slice(firstNonSystemIndex)
    assertNoMiddleSystemMessages(messages)

    // Convert or drop onPanda's Chat Completions keys, and pass the other keys through as Anthropic parameters.
    const { max_completion_tokens, stop, tools, stream_options, logprobs, top_logprobs, spaces_between_special_tokens, ...parameters } = body
    const maxTokens = body.max_tokens || max_completion_tokens || 32 * 1024
    const adaptiveThinking = isClaudeAdaptiveThinkingModel(body.model)
    const requestBody = {
        // Opt in to automatic prompt caching, which other protocols do by default; its breakpoint follows the last block as messages grow.
        cache_control: { type: 'ephemeral' },
        ...parameters,
        stream: true,
        max_tokens: maxTokens,
        messages: [],
    }
    for (const message of await Promise.all(messages.map(async message => {
        if (message.role === 'assistant') {
            return {
                role: 'assistant',
                content: await assistantMessageToAnthropicContent(message),
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
    }))) {
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
    if (stop) {
        requestBody.stop_sequences = Array.isArray(stop) ? stop : [stop]
    }
    if (typeof body.tool_choice === 'string') {
        // Chat Completions tool_choice: "none", "auto" or "required". Objects are passed through as Anthropic tool_choice.
        requestBody.tool_choice = { type: body.tool_choice === 'required' ? 'any' : body.tool_choice }
    }
    if (tools?.length) {
        requestBody.tools = tools.map(convertTool)
    }
    if (adaptiveThinking) {
        // Adaptive thinking models reject non-default temperature and top_p, which onPanda always sends.
        delete requestBody.temperature
        delete requestBody.top_p
        requestBody.thinking = {
            type: 'adaptive',
            display: requestBody.thinking?.display || 'summarized',
        }
        requestBody.output_config = {
            effort: 'high',
            ...requestBody.output_config,
        }
    } else if (!requestBody.thinking) {
        requestBody.thinking = {
            type: 'enabled',
            budget_tokens: maxTokens - 1,
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

async function* anthropicMessagesStreamToChatCompletionsStream(stream, { requestBody, apiConfig } = {}) {
    let messageId
    let model
    let toolCallCount = 0
    const toolCallIndexes = {}
    // The original content blocks, to replay the interleaved thinking, redacted_thinking, text and tool_use.
    const blocks = []
    const partialJsons = {}
    const choices = []
    function createChunk({ delta, finish_reason, usage } = {}) {
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
        choices.push(chunk.choices[0])
        return chunk
    }
    for await (const event of stream) {
        if (event.type === 'error') {
            throw new Error(`Anthropic messages stream error: ${JSON.stringify(event.error || event)}`)
        }
        if (event.type === 'message_start') {
            messageId = event.message.id
            model = event.message.model
            yield createChunk({
                delta: { role: event.message.role },
                usage: event.message.usage,
            })
            continue
        }
        if (event.type === 'content_block_start') {
            const block = { ...event.content_block }
            if (block.type === 'thinking' && blocks.some(previousBlock => previousBlock.type === 'thinking')) {
                // Separate thinking blocks like paragraphs.
                yield createChunk({ delta: { reasoning: '\n\n' } })
            }
            blocks[event.index] = block
            if (block.type === 'tool_use') {
                toolCallIndexes[event.index] = toolCallCount
                toolCallCount++
                yield createChunk({
                    delta: createToolCallStartDelta(block, toolCallIndexes[event.index]),
                })
            }
            continue
        }
        if (event.type === 'content_block_delta') {
            const delta = event.delta
            const block = blocks[event.index]
            if (delta.type === 'thinking_delta') {
                block.thinking += delta.thinking
                yield createChunk({
                    delta: { reasoning: delta.thinking },
                })
            } else if (delta.type === 'signature_delta') {
                block.signature = delta.signature
            } else if (delta.type === 'text_delta') {
                block.text += delta.text
                yield createChunk({
                    delta: { content: delta.text },
                })
            } else if (delta.type === 'input_json_delta') {
                partialJsons[event.index] = (partialJsons[event.index] || '') + delta.partial_json
                yield createChunk({
                    delta: createToolCallArgumentsDelta(toolCallIndexes[event.index], delta.partial_json),
                })
            }
            continue
        }
        if (event.type === 'content_block_stop' && blocks[event.index].type === 'tool_use') {
            // max_tokens may truncate the input JSON, so keep its complete entries the same as non-stream.
            const { entries } = parsePartialJsonObject(partialJsons[event.index])
            blocks[event.index].input = Object.fromEntries(entries.filter(entry => entry.complete).map(entry => [entry.name, entry.value]))
            continue
        }
        if (event.type === 'message_delta') {
            const finish_reason = mapFinishReason(event.delta.stop_reason)
            // Fingerprint the message exactly as onPanda parses it (some templates read finish_reason), to detect later edits.
            const message = buildResponseTemplate({ apiConfig }).parse({
                tokens: [...choices, { delta: { content: '' }, finish_reason }],
                messages: requestBody.messages,
                tools: requestBody.tools,
            })
            yield createChunk({
                delta: {
                    content: '',
                    sidecar: {
                        anthropic_messages: {
                            content: blocks,
                            message_hash: await hashMessageOutput(message),
                        },
                    },
                },
                finish_reason,
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
    body = omitNullRequestFields(await buildAnthropicMessagesRequest(body))

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
    mergeHeaders(headers, config.extraHeaders)
    const response = await retryWithSchedule(() => fetch(`${config.baseURL}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
    }), [5000, 30000])

    return anthropicMessagesStreamToChatCompletionsStream(parseSseJsonStream(response), { requestBody, apiConfig })
}
