import { useGlobalStore } from '../../stores/globalStore.js'
import { ObjctKeyToCamelCaseNaming, deepCopy } from '../commonUtils.js'
import { normalizeStream } from '../fetchOpenaiApi.js'
import { parseSseJsonStream, retryWithSchedule } from './utils.js'

const DEFAULT_THINKING_CONFIG = {
    thinkingLevel: 'HIGH',
}

function contentPartToGemini(part) {
    if (part.type === 'text') {
        return { text: part.text }
    }
    if (part.type === 'image_url') {
        const url = part.image_url.url
        if (url.startsWith('data:')) {
            const [mediaTypePart, data] = url.split(';base64,')
            return {
                inlineData: {
                    mimeType: mediaTypePart.slice('data:'.length),
                    data,
                },
            }
        }
        return {
            fileData: {
                fileUri: url,
            },
        }
    }
    if (part.type === 'audio_url') {
        const url = part.audio_url.url
        if (url.startsWith('data:')) {
            const [mediaTypePart, data] = url.split(';base64,')
            return {
                inlineData: {
                    mimeType: mediaTypePart.slice('data:'.length),
                    data,
                },
            }
        }
        return {
            fileData: {
                fileUri: url,
            },
        }
    }
    if (part.type === 'input_audio') {
        return {
            inlineData: {
                mimeType: `audio/${part.input_audio.format}`,
                data: part.input_audio.data,
            },
        }
    }
    return { text: JSON.stringify(part) }
}

function messageContentToGeminiParts(content) {
    if (typeof content === 'string') {
        return [{ text: content }]
    }
    return content.map(contentPartToGemini)
}

function parseToolCallArguments(toolCall) {
    return JSON.parse(toolCall.function.arguments || '{}')
}

function sidecarThoughtSignature(message, key) {
    return message.sidecar?.gemini?.thoughtSignatures?.[key]
}

function addThoughtSignature(part, signature) {
    if (signature) {
        part.thoughtSignature = signature
    }
    return part
}

function toolCallToGeminiPart(toolCall, message) {
    return addThoughtSignature({
        functionCall: {
            name: toolCall.function.name,
            args: parseToolCallArguments(toolCall),
        },
    }, sidecarThoughtSignature(message, `tool_calls.${toolCall.index}`))
}

function assistantMessageToGeminiParts(message) {
    const parts = []
    if (message.reasoning) {
        parts.push(addThoughtSignature({
            text: message.reasoning,
            thought: true,
        }, sidecarThoughtSignature(message, 'reasoning.0')))
    }
    if (message.content) {
        parts.push(...messageContentToGeminiParts(message.content))
    }
    parts.push(...(message.tool_calls || []).map(toolCall => toolCallToGeminiPart(toolCall, message)))
    return parts
}

function messageContentToFunctionResponse(content) {
    if (typeof content === 'string') {
        return {
            response: { result: content },
        }
    }
    const functionResponse = {
        response: {
            result: content
                .filter(part => part.type === 'text')
                .map(part => part.text)
                .join(''),
        },
    }
    const parts = content
        .filter(part => part.type !== 'text')
        .map(contentPartToGemini)
    if (parts.length) {
        functionResponse.parts = parts
    }
    return functionResponse
}

function toolMessageToGeminiParts(message) {
    return [{
        functionResponse: {
            name: message.name,
            ...messageContentToFunctionResponse(message.content),
        },
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
            throw new Error('Gemini generateContent only supports leading contiguous system/developer messages.')
        }
    }
}

function openaiMessageToGeminiContent(message) {
    if (message.role === 'assistant') {
        return {
            role: 'model',
            parts: assistantMessageToGeminiParts(message),
        }
    }
    if (message.role === 'tool') {
        return {
            role: 'user',
            parts: toolMessageToGeminiParts(message),
        }
    }
    return {
        role: 'user',
        parts: messageContentToGeminiParts(message.content),
    }
}

function normalizeGeminiSchema(schema) {
    if (Array.isArray(schema)) {
        return schema.map(normalizeGeminiSchema)
    }
    if (!schema || typeof schema !== 'object') {
        return schema
    }
    const nextSchema = {}
    for (const [key, value] of Object.entries(schema)) {
        if (key === 'type' && typeof value === 'string') {
            nextSchema[key] = value.toUpperCase()
        } else {
            nextSchema[key] = normalizeGeminiSchema(value)
        }
    }
    return nextSchema
}

function convertTool(tool) {
    return {
        name: tool.function.name,
        description: tool.function.description,
        parameters: normalizeGeminiSchema(tool.function.parameters),
    }
}

function buildToolConfig(body) {
    if (body.tool_choice === 'none') {
        return {
            functionCallingConfig: {
                mode: 'NONE',
            },
        }
    }
    if (body.tool_choice === 'required') {
        return {
            functionCallingConfig: {
                mode: 'ANY',
            },
        }
    }
    if (body.tool_choice?.function?.name) {
        return {
            functionCallingConfig: {
                mode: 'ANY',
                allowedFunctionNames: [body.tool_choice.function.name],
            },
        }
    }
    return body.toolConfig
}

function buildGenerationConfig(body) {
    const generationConfig = {
        ...(body.generationConfig || {}),
    }
    const keyMapping = {
        temperature: 'temperature',
        top_p: 'topP',
        top_k: 'topK',
        candidate_count: 'candidateCount',
        presence_penalty: 'presencePenalty',
        frequency_penalty: 'frequencyPenalty',
        response_mime_type: 'responseMimeType',
        response_schema: 'responseSchema',
    }
    for (const [sourceKey, targetKey] of Object.entries(keyMapping)) {
        if (body[sourceKey] != null) {
            generationConfig[targetKey] = body[sourceKey]
        }
    }
    const maxOutputTokens = body.max_tokens || body.max_completion_tokens
    if (maxOutputTokens) {
        generationConfig.maxOutputTokens = maxOutputTokens
    }
    if (body.stop) {
        generationConfig.stopSequences = Array.isArray(body.stop) ? body.stop : [body.stop]
    }
    if (body.top_logprobs) {
        generationConfig.responseLogprobs = true
        generationConfig.logprobs = body.top_logprobs
    }
    generationConfig.thinkingConfig = body.thinkingConfig || generationConfig.thinkingConfig || DEFAULT_THINKING_CONFIG
    return generationConfig
}

function buildGeminiGenerateContentRequest(openaiRequestBody) {
    const body = deepCopy(openaiRequestBody)
    const { systemMessages, firstNonSystemIndex } = collectSystemMessages(body.messages || [])
    const messages = body.messages.slice(firstNonSystemIndex)
    assertNoMiddleSystemMessages(messages)

    const requestBody = {
        contents: [],
        generationConfig: buildGenerationConfig(body),
    }
    if (systemMessages.length) {
        requestBody.systemInstruction = {
            parts: systemMessages.flatMap(message => messageContentToGeminiParts(message.content || '')),
        }
    }
    for (const content of messages.map(openaiMessageToGeminiContent)) {
        const lastContent = requestBody.contents[requestBody.contents.length - 1]
        if (lastContent?.role === content.role) {
            lastContent.parts.push(...content.parts)
        } else {
            requestBody.contents.push(content)
        }
    }
    if (body.tools?.length) {
        requestBody.tools = [{
            functionDeclarations: body.tools.map(convertTool),
        }]
    }
    const toolConfig = buildToolConfig(body)
    if (toolConfig) {
        requestBody.toolConfig = toolConfig
    }
    if (body.safetySettings) {
        requestBody.safetySettings = body.safetySettings
    }
    if (body.cachedContent) {
        requestBody.cachedContent = body.cachedContent
    }
    return requestBody
}

function mapFinishReason(finishReason, hasToolCalls) {
    if (hasToolCalls) {
        return 'tool_calls'
    }
    return {
        STOP: 'stop',
        MAX_TOKENS: 'length',
        SAFETY: 'content_filter',
        RECITATION: 'content_filter',
        BLOCKLIST: 'content_filter',
        PROHIBITED_CONTENT: 'content_filter',
        SPII: 'content_filter',
        MALFORMED_FUNCTION_CALL: 'tool_calls',
    }[finishReason] || finishReason?.toLowerCase()
}

function normalizeGeminiUsage(usage = {}) {
    const promptTokens = usage.promptTokenCount
    const completionTokens = usage.candidatesTokenCount ?? usage.totalTokenCount - promptTokens
    return {
        ...usage,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: usage.totalTokenCount,
    }
}

function createChunk({ messageId, model, delta, finish_reason, usage, logprobs } = {}) {
    const choice = {
        index: 0,
        delta,
    }
    if (finish_reason) {
        choice.finish_reason = finish_reason
    }
    if (logprobs) {
        choice.logprobs = logprobs
    }
    const chunk = {
        id: messageId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [choice],
    }
    if (usage) {
        chunk.usage = normalizeGeminiUsage(usage)
    }
    return chunk
}

function createToolCallStartDelta(functionCall, index) {
    return {
        tool_calls: [{
            index,
            id: `functions.${functionCall.name}:${index}`,
            type: 'function',
            function: {
                name: functionCall.name,
                arguments: JSON.stringify(functionCall.args || {}),
            },
        }],
    }
}

function createThoughtSignatureDelta(key, signature) {
    return {
        sidecar: {
            gemini: {
                thoughtSignatures: {
                    [key]: signature,
                },
            },
        },
    }
}

function logprobsResultToOpenAI(logprobsResult, state) {
    const chosenCandidates = logprobsResult.chosenCandidates || []
    const topCandidates = logprobsResult.topCandidates || []
    const startIndex = chosenCandidates.length > state.seen ? state.seen : 0
    const newChosenCandidates = chosenCandidates.slice(startIndex)
    const newTopCandidates = topCandidates.slice(startIndex, startIndex + newChosenCandidates.length)
    state.seen = chosenCandidates.length > state.seen ? chosenCandidates.length : state.seen + chosenCandidates.length
    return {
        content: newChosenCandidates.map((candidate, index) => ({
            token: candidate.token,
            logprob: candidate.logProbability,
            token_ids: candidate.tokenId == null ? undefined : [candidate.tokenId],
            top_logprobs: (newTopCandidates[index]?.candidates || []).map(topCandidate => ({
                token: topCandidate.token,
                logprob: topCandidate.logProbability,
                token_ids: topCandidate.tokenId == null ? undefined : [topCandidate.tokenId],
            })),
        })),
    }
}

async function* geminiGenerateContentStreamToChatCompletionsStream(stream, { model } = {}) {
    const messageId = `chatcmpl-gemini-${Date.now()}`
    let roleSent = false
    let hasToolCalls = false
    let toolCallCount = 0
    let reasoningPartCount = 0
    let pendingThoughtSignature = null
    let lastThoughtSignatureKey = null
    const logprobsState = { seen: 0 }
    for await (const event of stream) {
        if (event.error) {
            throw new Error(`Gemini generateContent stream error: ${JSON.stringify(event.error)}`)
        }
        if (!roleSent) {
            roleSent = true
            yield createChunk({
                messageId,
                model: event.modelVersion || model,
                delta: { role: 'assistant' },
                usage: event.usageMetadata,
            })
        }
        const candidate = event.candidates?.[0]
        const logprobs = candidate?.logprobsResult
            ? logprobsResultToOpenAI(candidate.logprobsResult, logprobsState)
            : null
        let logprobsUsed = false
        for (const part of candidate?.content?.parts || []) {
            if (part.thoughtSignature && !part.text && !part.functionCall) {
                if (lastThoughtSignatureKey) {
                    yield createChunk({
                        messageId,
                        model: event.modelVersion || model,
                        delta: createThoughtSignatureDelta(lastThoughtSignatureKey, part.thoughtSignature),
                    })
                } else {
                    pendingThoughtSignature = part.thoughtSignature
                }
                continue
            }
            if (part.text) {
                const key = part.thought ? `reasoning.${reasoningPartCount}` : 'content.0'
                const thoughtSignature = part.thoughtSignature || pendingThoughtSignature
                pendingThoughtSignature = null
                lastThoughtSignatureKey = key
                if (thoughtSignature) {
                    yield createChunk({
                        messageId,
                        model: event.modelVersion || model,
                        delta: createThoughtSignatureDelta(key, thoughtSignature),
                    })
                }
                if (part.thought) {
                    reasoningPartCount += 1
                }
                yield createChunk({
                    messageId,
                    model: event.modelVersion || model,
                    delta: part.thought ? { reasoning: part.text } : { content: part.text },
                    logprobs: logprobsUsed ? null : logprobs,
                })
                logprobsUsed = true
            }
            if (part.functionCall) {
                const toolCallIndex = toolCallCount
                const key = `tool_calls.${toolCallIndex}`
                const thoughtSignature = part.thoughtSignature || pendingThoughtSignature
                pendingThoughtSignature = null
                lastThoughtSignatureKey = key
                hasToolCalls = true
                toolCallCount += 1
                if (thoughtSignature) {
                    yield createChunk({
                        messageId,
                        model: event.modelVersion || model,
                        delta: createThoughtSignatureDelta(key, thoughtSignature),
                    })
                }
                yield createChunk({
                    messageId,
                    model: event.modelVersion || model,
                    delta: createToolCallStartDelta(part.functionCall, toolCallIndex),
                    logprobs: logprobsUsed ? null : logprobs,
                })
                logprobsUsed = true
            }
        }
        if (candidate?.finishReason) {
            yield createChunk({
                messageId,
                model: event.modelVersion || model,
                delta: { content: '' },
                finish_reason: mapFinishReason(candidate.finishReason, hasToolCalls),
                usage: event.usageMetadata,
            })
        } else if (event.usageMetadata && !candidate?.content?.parts?.length) {
            yield createChunk({
                messageId,
                model: event.modelVersion || model,
                delta: { content: '' },
                usage: event.usageMetadata,
            })
        }
    }
}

function buildGeminiStreamUrl({ baseURL, model }) {
    const trimmedBaseURL = baseURL.replace(/\/$/, '')
    const modelPath = encodeURIComponent(`${model}`.replace(/^models\//, ''))
    if (trimmedBaseURL.endsWith('/models')) {
        return `${trimmedBaseURL}/${modelPath}:streamGenerateContent?alt=sse`
    }
    if (trimmedBaseURL.endsWith('/v1beta')) {
        return `${trimmedBaseURL}/models/${modelPath}:streamGenerateContent?alt=sse`
    }
    return `${trimmedBaseURL}/v1beta/models/${modelPath}:streamGenerateContent?alt=sse`
}

export async function createGeminiGenerateContentStream({ requestBody, apiConfig, signal } = {}) {
    const globalStore = useGlobalStore()
    let body = deepCopy(requestBody)
    if (globalStore.hooks?.beforeCreateChatCompletion?.length) {
        for (let hook of globalStore.hooks.beforeCreateChatCompletion) {
            body = await hook(body)
        }
    }
    body = buildGeminiGenerateContentRequest(body)

    const config = ObjctKeyToCamelCaseNaming(apiConfig.client_config)
    const response = await retryWithSchedule(() => fetch(buildGeminiStreamUrl({
        baseURL: config.baseURL,
        model: requestBody.model,
    }), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': config.apiKey,
        },
        body: JSON.stringify(body),
        signal,
    }), [5000, 30000])

    const stream = geminiGenerateContentStreamToChatCompletionsStream(parseSseJsonStream(response), {
        model: requestBody.model,
    })
    return normalizeStream({ stream, requestBody, apiConfig })
}
