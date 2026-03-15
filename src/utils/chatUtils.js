import { deepCopy, deepEqual, getUnicodeLength } from './commonUtils'
import { formatMessageAsText, formatSimpleContentAsText } from './messageTextCodec.js'

export {
    MESSAGE_KEYS_IN_CONTEXT,
    MESSAGE_META_KEYS,
    MESSAGE_CONTEXT_SECTION_MARKERS,
} from './messageTextCodec.js'

export function verifyUrlIsLlmApiCall(url) {
    // check is LLM api call by /models or /completions
    return /\/models|\/completions/.test(url);
}

export function isFinalRoleModelRole(messages, modelRoles = ['assistant',]) {
    return modelRoles.includes(messages[messages.length - 1].role)
}

export function splitToPromptResponse(messages, modelRoles = ['assistant',]) {
    if (isFinalRoleModelRole(messages, modelRoles)) {
        var prompt = messages.slice(0, -1)
        var response = messages[messages.length - 1]
    } else {
        var prompt = messages
        var response = null
    }
    return { prompt, response }
}

export function dialogDifferent(dialog1, dialog2, modelRoles = ['assistant',]) {
    const messages1 = dialog1.messages || []
    const messages2 = dialog2.messages || []
    const tools1 = dialog1.tools || []
    const tools2 = dialog2.tools || []

    var { prompt: prompt1, response: response1 } = splitToPromptResponse(messages1, modelRoles)
    var { prompt: prompt2, response: response2 } = splitToPromptResponse(messages2, modelRoles)
    var is_prompt_modified = !(deepEqual(prompt1, prompt2) && deepEqual(tools1, tools2))

    // console.log('is_prompt_modified:', is_prompt_modified, prompt1, prompt2)
    // if response is null, response is different
    var is_response_modified = true
    if (response1 && response2) {
        var seq1 = messageToSeq(response1)
        var seq2 = messageToSeq(response2)
        function findCommonPrefix(str1, str2) {
            let i = 0;
            while (i < str1.length && i < str2.length && str1[i] === str2[i]) {
                i++;
            }
            return str1.substring(0, i);
        }
        var commonPrefix = findCommonPrefix(seq1, seq2)
        var common_prefix_length = getUnicodeLength(commonPrefix)
        if (response1.role !== response2.role) {
            var response_modified_type = 'change_role'
        } else {
            // console.log('response diff:', seq1, seq2, response1, response2)
            if (seq1 == seq2) {
                var response_modified_type = 'same'
                is_response_modified = false
            } else if (seq1.startsWith(seq2)) {
                var response_modified_type = 'truncated'
            } else if (seq2.startsWith(seq1)) {
                var response_modified_type = 'continued'
            } else {
                var response_modified_type = 'bifurcation'
            }
        }
    } else {
        var response_modified_type = 'no_response'
        var common_prefix_length = -1
        is_response_modified = true

        // console.log('response diff:', response1, response2, messages1, messages2)
        if (response1 && !response2) {
            response_modified_type = 'delete_response'
        } else if (!response1 && response2) {
            response_modified_type = 'add_response'
        } else {
            response_modified_type = 'no_response'
            is_response_modified = false
        }
    }
    return { is_prompt_modified, is_response_modified, response_modified_type, common_prefix_length }
}


export function tokensToSeq(tokens) {
    return tokens.map(token => tokenToDisplayString(token) + ((token.finish_reason && token.finish_reason !== 'length') ? ('<|' + token.finish_reason + '|>') : '')).join('')
}

export function messageToSeq(message, { includeFinishReason = true } = {}) {
    message = message || {}
    var seq = formatMessageAsText(message, {
        formatContentAsText: formatSimpleContentAsText,
    })

    if (includeFinishReason && message.finish_reason && message.finish_reason !== 'length') {
        seq += `<|${message.finish_reason}|>`
    }
    return seq
}


export function convertMessageToTokens(message) {
    if (message.role == "assistant") {
        var reasoning = message.reasoning ?? ""
        var content = message.content
        const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
        var tokens = []
        const appendTextTokens = (text, key) => {
            if (!text) {
                return
            }
            for (const segment of segmenter.segment(text)) {
                tokens.push({
                    delta: { [key]: segment.segment },
                    tokenIndex: tokens.length,
                    logprobs: { content: [{ token: segment.segment, top_logprobs: [] }] },
                })
            }
        }

        appendTextTokens(reasoning, 'reasoning')
        appendTextTokens(content, 'content')
        for (const toolCall of message.tool_calls || []) {
            tokens.push({
                delta: { tool_calls: [deepCopy(toolCall)] },
                tokenIndex: tokens.length,
                logprobs: { content: [{ token: tokenToDisplayString({ delta: { tool_calls: [toolCall] } }), top_logprobs: [] }] },
            })
        }
        if (tokens && tokens.length > 0) {
            tokens[0].delta.role = "assistant"
            if (message.finish_reason) {
                tokens[tokens.length - 1].finish_reason = message.finish_reason
            }
            if (!message.finish_reason || message.finish_reason == "length") {
                tokens[tokens.length - 1].bifurcationPoint = true
            }
        } else {  // final message is empty content but with role name
            tokens = [{
                delta: { role: message.role, content: "" },
                tokenIndex: 0,
                logprobs: { content: [{ token: "", top_logprobs: [], logprob: 0 }] },
            }]
        }
    }
    return tokens
}

export function tokenToDisplayString(token, tokens = undefined) {
    const delta = token?.delta || {}
    if (typeof delta.content === 'string' && delta.content !== '') {
        return delta.content
    }
    const reasoning = delta.reasoning
    if (typeof reasoning === 'string' && reasoning !== '') {
        return reasoning
    }
    const toolCall = delta.tool_calls?.[0]
    if (toolCall) {
        if (toolCall.function?.arguments) {
            return toolCall.function.arguments
        }
        return JSON.stringify(toolCall)
    }
    return ""
}

export function normalizeRequest(requestBody) {
    const body = deepCopy(requestBody)
    if (body.messages?.length) {
        body.messages.map(message => {
            delete message.finish_reason
            delete message.comment
            delete message.description
        })
    }
    if (body.stop) {
        try {
            body.stop = JSON.parse(body.stop)
        } catch (e) {
            // body.stop = body.stop
        }
    } else {
        delete body.stop
    }
    if (!body.chat_template) {
        delete body.chat_template
    }
    if (body.top_logprobs == 0) {  // turn off logprobs
        delete body.logprobs
        delete body.top_logprobs
    }
    if (body.max_tokens == 0) {  // turn off max_tokens
        delete body.max_tokens
    }
    if (body.model.indexOf('gpt-') >= 0) {
        // convert max_tokens to max_completion_tokens for GPT model
        body.max_completion_tokens = body.max_tokens
        delete body.max_tokens
    }
    if (body.tools && !body.tools.length) {  // turn off tools if no tools
        delete body.tools
    }
    return body
}


export function getContentTypes(input) {
    // Support both content, single message and list of messages
    var isMessages = Array.isArray(input) && (input.length == 0 || input[0].role)
    var isContent = typeof input === 'string' || (Array.isArray(input) && input.length > 0 && input[0].type)
    if (isMessages) {
        var list = input.map(getContentTypes).reduce((a, b) => a.concat(b), [])
        return [...new Set(list)]
    } else {
        var content = isContent ? input : input.content
        var contentTypes = []
        if (content && Array.isArray(content)) {
            content.map(content => contentTypes.push(content.type))
        }
        if (typeof content === 'string') {
            contentTypes.push('text')
        }
        return [...new Set(contentTypes)]
    }
}

export function clearTokenObject(token) {
    // inplace clear items that are not needed in token object
    // clear top_logprobs in cache tokens
    if (token.logprobs?.content && token.logprobs.content[0]) {
        delete token.logprobs.content[0].top_logprobs
        delete token.logprobs.content[0].bytes
        delete token.logprobs.content[0].token_piece
    }
    // clear items that value is null
    for (let key in token) {
        if (token[key] === null) {
            delete token[key]
        }
    }
    // clear items in delta that value is null
    for (let key in token.delta) {
        if (token.delta[key] === null) {
            delete token.delta[key]
        }
    }
}

export function recordAsRejectedToken(token, tokens) {
    // if provide tokens, record the rejected_token.unicode_start_index
    var rejected_token = deepCopy(token)
    clearTokenObject(rejected_token)
    delete rejected_token.model
    delete rejected_token.usage
    delete rejected_token.index
    delete rejected_token.delta?.role
    delete rejected_token.pruned
    delete rejected_token.bifurcationPoint
    if (tokens) {
        const index = tokens.value.indexOf(token)
        console.assert(index !== -1, 'Token not found in tokens array')
        if (index !== -1) {
            const prefixTokens = tokens.value.slice(0, index)
            const prefixText = prefixTokens.map(token => token.delta?.content || "").join("")
            rejected_token.unicode_start_index = getUnicodeLength(prefixText)
        }
    }
    return rejected_token
}


export function probOfToken(token) {
    var logprob = token.logprobs?.content?.[0]?.logprob
    var prob = Math.exp(logprob)

    if (typeof logprob !== 'number') {
        if (token.tokenIndex === 0 && !(token.delta.content)) {
            // if first role token has no prob and will in first patch
            prob = 1
        }
    }
    return prob
}

export function mergeTwoDeltas(delta1, delta2, unmergedKeys = []) {
    // Merge two deltas
    // 1. if delta1 not has one key, set deepCopy delta2
    // 2. if value is string, concate string
    // 3. if value is number, assert same number
    // 4. if value is obj, recurse
    var merged = { ...delta1 }
    for (const key in delta2) {
        if (!(key in merged)) {
            merged[key] = deepCopy(delta2[key])
        } else {
            const value1 = delta1[key]
            const value2 = delta2[key]
            if (unmergedKeys.includes(key)) {
                merged[key] = deepCopy(merged[key])
            } else if (typeof value1 === "string" && typeof value2 === "string") {
                merged[key] = value1 + value2
            } else if (typeof value1 === "number" && typeof value2 === "number") {
                console.assert(value1 === value2, `Number mismatch: ${value1} !== ${value2}`)
                merged[key] = value1
            } else if (typeof value1 === "object" && typeof value2 === "object") {
                merged[key] = mergeTwoDeltas(value1, value2, unmergedKeys)
            }
        }
    }
    return merged
}

export function filterEmptyMessage(messages) {
    return messages.filter(message => messageToSeq(message, { includeFinishReason: false }))
}
