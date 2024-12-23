import { deepCopy, deepEqual, getUnicodeLength } from './commonUtils'

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

export function messagesDifferent(messages1, messages2, modelRoles = ['assistant',]) {
    var { prompt: prompt1, response: response1 } = splitToPromptResponse(messages1, modelRoles)
    var { prompt: prompt2, response: response2 } = splitToPromptResponse(messages2, modelRoles)
    var is_prompt_modified = !deepEqual(prompt1, prompt2)

    // console.log('is_prompt_modified:', is_prompt_modified, prompt1, prompt2)
    // if response is null, response is different
    var is_response_modified = true
    if (response1 && response2) {
        function findCommonPrefix(str1, str2) {
            let i = 0;
            while (i < str1.length && i < str2.length && str1[i] === str2[i]) {
                i++;
            }
            return str1.substring(0, i);
        }
        var commonPrefix = findCommonPrefix(response1.content, response2.content)
        var common_prefix_length = getUnicodeLength(commonPrefix)
        if (response1.role !== response2.role) {
            var response_modified_type = 'change_role'
        } else {
            var seq1 = messageToSeq(response1)
            var seq2 = messageToSeq(response2)
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
    return tokens.map(token => (token.delta.content || "") + ((token.finish_reason && token.finish_reason !== 'length') ? ('<|' + token.finish_reason + '|>') : '')).join('')
}

export function messageToSeq(message) {
    var content = message.content
    content = typeof content === 'string' ? content : JSON.stringify(content)
    return content + ((message.finish_reason && message.finish_reason !== 'length') ? ('<|' + message.finish_reason + '|>') : '')
}

export function normalizeRequest(requestBody) {
    const body = deepCopy(requestBody)
    if (body.messages?.length) {
        body.messages.map(message => {
            delete message.finish_reason
        })
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
