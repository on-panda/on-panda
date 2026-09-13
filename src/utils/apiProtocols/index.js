import { ObjctKeyToCamelCaseNaming } from '../commonUtils.js'
import { OpenAI, normalizeStream } from '../fetchOpenaiApi.js'  // TODO: git mv to ./openaiChatCompletions.js
import { buildResponseTemplate, buildViewTokens } from '../responseTemplates/index.js'
import { createAnthropicMessagesStream } from './anthropicMessages.js'
import { createGeminiGenerateContentStream } from './geminiGenerateContent.js'

function createNonStreamChatCompletionStream({ response, requestBody, apiConfig } = {}) {
    const choice = response.choices[0]
    const message = { ...choice.message }
    if (typeof message.reasoning_content === 'string') {
        message.reasoning = message.reasoning || message.reasoning_content
        delete message.reasoning_content
    }
    if (message.tool_calls?.length === 0) {
        delete message.tool_calls
    }
    if (choice.finish_reason) {
        message.finish_reason = choice.finish_reason
    }

    const logprobsContent = choice.logprobs?.content || []
    const logprobsTokens = logprobsContent.map(logprob => ({
        delta: { content: logprob.token },
        logprobs: { content: [logprob] },
    }))
    const generatedText = logprobsContent.map(logprob => logprob.token).join('')
    const continuationPrefix = requestBody.messages.at(-1)?.content
    if (
        requestBody.continue_final_message &&
        typeof continuationPrefix === 'string' &&
        typeof message.content === 'string' &&
        message.content === continuationPrefix + generatedText
    ) {
        message.content = generatedText
    }

    const tokens = buildViewTokens({
        message,
        responseTemplate: buildResponseTemplate({ apiConfig }),
        logprobsTokens,
        isContinuedMessage: requestBody.continue_final_message,
    })
    if (!tokens.length) {
        tokens.push({
            delta: { role: message.role || 'assistant', content: '' },
            ...(message.finish_reason ? { finish_reason: message.finish_reason } : {}),
        })
    }
    if (message.role) {
        tokens[0].delta.role = message.role
    }

    return (async function* () {
        for (const [tokenIndex, token] of tokens.entries()) {
            const chunk = {
                id: response.id,
                object: 'chat.completion.chunk',
                created: response.created,
                model: response.model,
                choices: [{
                    index: choice.index,
                    delta: token.delta,
                    ...(token.logprobs ? { logprobs: token.logprobs } : {}),
                    finish_reason: token.finish_reason || null,
                }],
            }
            if (tokenIndex === tokens.length - 1 && response.usage) {
                chunk.usage = response.usage
            }
            yield chunk
        }
    })()
}

export async function createChatCompletionsStream({ requestBody, apiConfig, signal } = {}) {
    const apiProtocol = apiConfig.api_protocol || {}
    if (apiProtocol.protocol === 'anthropic' && apiProtocol.endpoint === 'messages') {
        return createAnthropicMessagesStream({ requestBody, apiConfig, signal })
    }
    if (apiProtocol.protocol === 'gemini' && apiProtocol.endpoint === 'generateContent') {
        return createGeminiGenerateContentStream({ requestBody, apiConfig, signal })
    }
    for (const message of requestBody.messages || []) {
        delete message.sidecar
    }
    const openai = new OpenAI(ObjctKeyToCamelCaseNaming(apiConfig.client_config))
    const completion = await openai.chat.completions.create(requestBody, { signal })
    if (requestBody.stream === false) {
        return createNonStreamChatCompletionStream({ response: completion, requestBody, apiConfig })
    }
    return normalizeStream({ stream: completion, requestBody, apiConfig })
}
