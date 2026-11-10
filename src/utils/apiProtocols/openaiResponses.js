import { useGlobalStore } from '../../stores/globalStore.js'
import { ObjctKeyToCamelCaseNaming, deepCopy } from '../commonUtils.js'
import { buildResponseTemplate } from '../responseTemplates/index.js'
import { hashMessageOutput, mergeHeaders, parseSseJsonStream, retryWithSchedule, normalizeUsage, omitNullRequestFields, sortToolMessages } from './utils.js'

function messageContentToResponses(content) {
    if (typeof content === 'string') {
        return content
    }
    return content.map(part => {
        if (part.type === 'text') {
            return { type: 'input_text', text: part.text }
        }
        if (part.type === 'image_url') {
            return { type: 'input_image', image_url: part.image_url.url, detail: part.image_url.detail }
        }
        return part
    })
}

async function messageToResponsesInput(message) {
    if (message.role === 'tool') {
        return [{
            type: 'function_call_output',
            call_id: message.tool_call_id,
            output: messageContentToResponses(message.content),
        }]
    }
    if (message.role !== 'assistant') {
        return [{ role: message.role, content: messageContentToResponses(message.content) }]
    }
    const responsesSidecar = message.sidecar?.openai_responses
    // A flat message cannot keep the interleaved items, so replay the original output unless the message was edited.
    if (responsesSidecar && responsesSidecar.message_hash === await hashMessageOutput(message)) {
        return responsesSidecar.output
    }
    const reasoningItems = (responsesSidecar?.output || []).filter(item => item.type === 'reasoning')
    const items = reasoningItems.filter(item => item.encrypted_content)
    if (!items.length && reasoningItems.length && message.reasoning) {
        // Open models return raw reasoning text instead of encrypted_content, so replay the edited text.
        // Reasoning from other sources is dropped: OpenAI rejects reasoning items with raw text.
        items.push({ type: 'reasoning', summary: [], content: [{ type: 'reasoning_text', text: message.reasoning }] })
    }
    if (message.content) {
        items.push({ role: 'assistant', content: message.content, phase: responsesSidecar?.output.findLast(item => item.type === 'message')?.phase })
    }
    for (const toolCall of message.tool_calls || []) {
        items.push({
            type: 'function_call',
            call_id: toolCall.id,
            name: toolCall.function.name,
            arguments: toolCall.function.arguments,
        })
    }
    return items
}

function convertTool(tool) {
    return {
        type: 'function',
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
        // Responses API treats an omitted strict as true, which forces optional parameters to be required.
        strict: tool.function.strict ?? false,
    }
}

async function buildOpenaiResponsesRequest(body) {
    // Convert or drop onPanda's Chat Completions keys, and pass the other keys through as Responses parameters.
    const { messages, tools, max_tokens, max_completion_tokens, reasoning_effort, stream_options, logprobs, top_logprobs, spaces_between_special_tokens, ...parameters } = body
    const requestBody = {
        // Stateless mode: reasoning is replayed by encrypted_content instead of server-stored items.
        store: false,
        include: ['reasoning.encrypted_content'],
        ...parameters,
        stream: true,
        input: (await Promise.all(sortToolMessages(messages).map(messageToResponsesInput))).flat(),
    }
    // `reasoning: null` omits the parameter, for servers that reject or hang on it.
    if (body.reasoning !== null) {
        requestBody.reasoning = {
            effort: reasoning_effort || 'xhigh',
            summary: 'detailed',
            ...body.reasoning,
        }
    }
    const maxOutputTokens = max_tokens || max_completion_tokens
    if (maxOutputTokens) {
        requestBody.max_output_tokens = maxOutputTokens
    }
    if (tools?.length) {
        requestBody.tools = tools.map(convertTool)
    }
    return requestBody
}

async function* openaiResponsesStreamToChatCompletionsStream(stream, { requestBody, apiConfig } = {}) {
    let response
    const toolCallIds = []
    const toolCallIndexes = {}
    const startedFields = {}
    const choices = []
    function createChunk({ delta, finish_reason, usage } = {}) {
        const chunk = {
            id: response.id,
            object: 'chat.completion.chunk',
            created: response.created_at,
            model: response.model,
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
        if (event.type === 'error' || event.type === 'response.failed') {
            throw new Error(`OpenAI responses stream error: ${JSON.stringify(event.response?.error || event)}`)
        }
        if (event.type === 'response.refusal.done') {
            throw new Error(`OpenAI responses refusal: ${event.refusal}`)
        }
        if (event.type === 'response.created') {
            response = event.response
            yield createChunk({ delta: { role: 'assistant' } })
        } else if (event.type.endsWith('part.added')) {
            // Separate summary parts, reasoning parts and output messages like paragraphs.
            const field = ['summary_text', 'reasoning_text'].includes(event.part.type) ? 'reasoning' : 'content'
            if (startedFields[field]) {
                yield createChunk({ delta: { [field]: '\n\n' } })
            }
            startedFields[field] = true
        } else if (event.type === 'response.reasoning_summary_text.delta' || event.type === 'response.reasoning_text.delta') {
            yield createChunk({ delta: { reasoning: event.delta } })
        } else if (event.type === 'response.output_text.delta') {
            yield createChunk({ delta: { content: event.delta } })
        } else if (event.type === 'response.output_item.added' && event.item.type === 'function_call') {
            toolCallIndexes[event.output_index] = toolCallIds.length
            yield createChunk({
                delta: {
                    tool_calls: [{
                        index: toolCallIds.length,
                        id: event.item.call_id,
                        type: 'function',
                        function: {
                            name: event.item.name,
                            arguments: '',
                        },
                    }],
                },
            })
            toolCallIds.push(event.item.call_id)
        } else if (event.type === 'response.function_call_arguments.delta') {
            yield createChunk({
                delta: {
                    tool_calls: [{
                        index: toolCallIndexes[event.output_index],
                        function: {
                            arguments: event.delta,
                        },
                    }],
                },
            })
        } else if (event.type === 'response.completed' || event.type === 'response.incomplete') {
            // Read the final output items: encrypted_content in output_item.added is not final.
            const { output, status, incomplete_details, usage } = event.response
            const finish_reason = status === 'incomplete'
                ? { max_output_tokens: 'length' }[incomplete_details.reason] || incomplete_details.reason
                : toolCallIds.length ? 'tool_calls' : 'stop'
            if (finish_reason === 'content_filter') {
                throw new Error(`OpenAI responses content filtered: ${JSON.stringify(incomplete_details)}`)
            }
            // Fingerprint the message exactly as onPanda parses it (some templates read finish_reason), to detect later edits.
            const message = buildResponseTemplate({ apiConfig }).parse({
                tokens: [...choices, { delta: { content: '' }, finish_reason }],
                messages: requestBody.messages,
                tools: requestBody.tools,
            })
            let toolCallIndex = 0
            yield createChunk({
                delta: {
                    content: '',
                    sidecar: {
                        openai_responses: {
                            // Item ids are dropped: with store: false they cannot be resolved by the server.
                            // vLLM reports other call_ids here than in stream events, so keep the streamed ones that tool messages refer to.
                            output: output.map(({ id, ...item }) => item.type === 'function_call' ? { ...item, call_id: toolCallIds[toolCallIndex++] } : item),
                            message_hash: await hashMessageOutput(message),
                        },
                    },
                },
                finish_reason,
                usage,
            })
        }
    }
}

export async function createOpenaiResponsesStream({ requestBody, apiConfig, signal } = {}) {
    const globalStore = useGlobalStore()
    let body = deepCopy(requestBody)
    if (globalStore.hooks?.beforeCreateChatCompletion?.length) {
        for (let hook of globalStore.hooks.beforeCreateChatCompletion) {
            body = await hook(body)
        }
    }
    body = omitNullRequestFields(await buildOpenaiResponsesRequest(body))

    const config = ObjctKeyToCamelCaseNaming(apiConfig.client_config)
    const response = await retryWithSchedule(() => fetch(`${config.baseURL}/responses`, {
        method: 'POST',
        headers: mergeHeaders({
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
        }, config.extraHeaders),
        body: JSON.stringify(body),
        signal,
    }), [5000, 30000])

    return openaiResponsesStreamToChatCompletionsStream(parseSseJsonStream(response), { requestBody, apiConfig })
}
