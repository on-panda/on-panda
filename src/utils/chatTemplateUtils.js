import { deepCopy } from './commonUtils.js'

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

export function pieceViewTokens({ text = "", textStart = 0, textEnd = text.length, tokenIndexStart = 0 } = {}) {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })
    var tokens = []
    const viewText = text.slice(textStart, textEnd)
    for (const segment of segmenter.segment(viewText)) {
        tokens.push({
            delta: { content: segment.segment },
            tokenIndex: tokenIndexStart + tokens.length,
            logprobs: { content: [{ token: segment.segment, top_logprobs: [] }] },
        })
    }
    return tokens
}

export function pieceStructureViewTokens(options = {}) {
    const message = options.finalMessage || options.message
    var tokens = []

    for (const token of pieceViewTokens({ text: message.reasoning ?? "" })) {
        token.delta = { reasoning: token.delta.content }
        tokens.push(token)
    }
    for (const token of pieceViewTokens({ text: message.content ?? "" })) {
        tokens.push(token)
    }
    for (const toolCall of message.tool_calls || []) {
        const toolCallHeader = deepCopy(toolCall)
        delete toolCallHeader.function.arguments
        tokens.push({
            delta: { tool_calls: [toolCallHeader] },
            tokenIndex: tokens.length,
            logprobs: { content: [{ token: JSON.stringify(toolCallHeader), top_logprobs: [] }] },
        })
        for (const token of pieceViewTokens({ text: toolCall.function.arguments ?? "" })) {
            token.delta = { tool_calls: [{ index: toolCall.index, function: { arguments: token.delta.content } }] }
            tokens.push(token)
        }
    }

    if (tokens.length > 0) {
        tokens[0].delta.role = message.role || "assistant"
        if (message.finish_reason) {
            tokens.push({
                delta: { content: "" },
                tokenIndex: tokens.length,
                finish_reason: message.finish_reason,
            })
        }
    } else {
        tokens = [{
            delta: { role: message.role || "assistant", content: "" },
            tokenIndex: 0,
            logprobs: { content: [{ token: "", top_logprobs: [], logprob: 0 }] },
        }]
    }
    tokens.forEach((token, tokenIndex) => token.tokenIndex = tokenIndex)
    return tokens
}

export function buildViewTokens(options = {}) {
    const message = options.message
    const chatTemplate = options.chatTemplate || ChatTemplateStateClosure({})
    const { templatedPrompt } = chatTemplate.apply(message)
    if (chatTemplate.chatTemplateType === "plain_text") {
        return pieceViewTokens({ text: templatedPrompt })
    }
    return pieceStructureViewTokens({ finalMessage: message })
}

export function ChatTemplateStateClosure(options = {}) {
    function apply(message = {}) {
        var templatedPrompt = ""
        var textCursor = 0
        const keyPathPromptMapping = []
        const appendText = (keyPath, text) => {
            if (!text) {
                return
            }
            const textLength = text.length
            keyPathPromptMapping.push({ keyPath, textStart: textCursor, textEnd: textCursor + textLength })
            templatedPrompt += text
            textCursor += textLength
        }

        appendText(['reasoning'], message.reasoning)
        appendText(['content'], message.content)
        for (const toolCall of message.tool_calls || []) {
            appendText(['tool_calls', toolCall.index, 'function', 'name'], toolCall.function.name)
            appendText(['tool_calls', toolCall.index, 'function', 'arguments'], toolCall.function.arguments)
        }
        return { templatedPrompt, keyPathPromptMapping }
    }

    function parse(tokens = []) {
        if (typeof tokens === "string") {
            return { role: "assistant", content: tokens }
        }
        var role = null  // Compatible with Claude that each token has a role
        var finish_reason
        var mergedMessage = tokens.filter(
            token => !token.pruned
        ).map(
            token => {
                if (token.finish_reason) {
                    finish_reason = token.finish_reason
                }
                return (token.delta || {})
            }
        ).reduce((delta1, delta2) => {
            const delta = { ...delta1 }
            for (var key in delta2) {
                if (key === "tool_calls" && delta2.tool_calls?.length) {
                    var toolCalls = delta.tool_calls || []
                    var toolCall2 = delta2.tool_calls[0]
                    console.assert(delta2.tool_calls.length === 1)
                    console.assert(typeof toolCall2.index === "number")
                    if (toolCall2.index === toolCalls.length) {
                        toolCalls.push(toolCall2)
                    } else {
                        var toolCall1 = toolCalls[toolCall2.index]
                        toolCalls[toolCall2.index] = mergeTwoDeltas(toolCall1, toolCall2, ["type", "id"])
                    }
                    delta.tool_calls = toolCalls
                    continue
                }
                if (key === "reasoning_details") {
                    delta.reasoning_details = [mergeTwoDeltas(delta.reasoning_details?.[0], delta2.reasoning_details?.[0], ["type", "format"])]
                    continue
                }
                delta[key] = (delta[key] || "") + (delta2[key] || "")
                if (key === "role" && delta2.role) {
                    role = delta2.role
                }
            }
            return delta
        }, {})
        if (mergedMessage.reasoning) {
            mergedMessage.reasoning = mergedMessage.reasoning.replace(/\n+$/, "")
            if (mergedMessage.content) {
                mergedMessage.content = mergedMessage.content.replace(/^\n+/, "")
            }
        }
        if (mergedMessage.tool_calls?.length && mergedMessage.content) {
            mergedMessage.content = mergedMessage.content.replace(/\n+$/, "")
        }
        if (role) {
            mergedMessage.role = role
        } else if (tokens.length) {
            mergedMessage.role = "assistant" // when has token, the default role is assistant
        }
        if (role && !mergedMessage.content) {  // only role but no content
            mergedMessage.content = ""
        }
        // Compatible with different models for continue generating
        // For keys other than assistant and user, if v is the empty string, then delete
        for (var key in mergedMessage) {
            if (key !== "role" && key !== "content" && mergedMessage[key] === "") {
                delete mergedMessage[key]
            }
        }
        if (finish_reason) {
            mergedMessage.finish_reason = finish_reason
        }
        return mergedMessage
    }

    return {
        apply,
        parse,
        chatTemplateType: "default",
    }
}
