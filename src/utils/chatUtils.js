import { deepEqual, getUnicodeLength } from './commonUtils'

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
            var response_modified_type = 'role'
        } else {
            function responeToSeq(response) {
                return response.content + ((response.finish_reason && response.finish_reason !== 'length') ? ('<|' + response.finish_reason + '|>') : '')
            }
            var seq1 = responeToSeq(response1)
            var seq2 = responeToSeq(response2)
            // console.log(seq1, seq2, response1, response2)
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
    }
    return { is_prompt_modified, is_response_modified, response_modified_type, common_prefix_length }
}


export function tokensToSeq(tokens) {
    return tokens.map(token => (token.delta.content || "") + ((token.finish_reason && token.finish_reason !== 'length') ? ('<|' + token.finish_reason + '|>') : '')).join('')
}

