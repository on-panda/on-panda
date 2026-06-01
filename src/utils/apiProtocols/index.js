import { ObjctKeyToCamelCaseNaming } from '../commonUtils.js'
import { OpenAI, normalizeStream } from '../fetchOpenaiApi.js'  // TODO: git mv to ./openaiChatCompletions.js
import { createAnthropicMessagesStream } from './anthropicMessages.js'
import { createGeminiGenerateContentStream } from './geminiGenerateContent.js'

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
    var stream = await openai.chat.completions.create(requestBody, { signal })
    return normalizeStream({ stream, requestBody, apiConfig })
}
