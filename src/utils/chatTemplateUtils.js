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
        // new vLLM resends the tool_call wrapper on every chunk; skip filler chunks (no name) to avoid noisy JSON in display
        if (!toolCall.function?.name) {
            return ""
        }
        return JSON.stringify(toolCall, (k, v) => k === "arguments" && v === "" ? undefined : v)
    }
    return ""
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

export function tokensToPatches(tokens) {
    const responseDisplayTextAll = tokens.map(token => tokenToDisplayString(token, tokens)).join("")
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })
    const visibleSegments = Array.from(segmenter.segment(responseDisplayTextAll))
    // add a empty segment at the end for EOT token
    Array.from({ length: 4 }, () => visibleSegments.push({ segment: "" }))

    const patches = []
    let segmentIndex = 0
    let currentSegmentString = visibleSegments[segmentIndex]?.segment ?? ""
    let tokenToSegmentString = ""
    let tokenStartIndex = 0

    tokens.forEach((token, tokenIndex) => {
        const tokenDisplayText = tokenToDisplayString(token, tokens)
        tokenToSegmentString += tokenDisplayText

        while (
            segmentIndex < visibleSegments.length - 1 &&
            tokenToSegmentString.length > currentSegmentString.length
        ) {
            segmentIndex += 1
            currentSegmentString += visibleSegments[segmentIndex].segment
        }

        if (tokenToSegmentString === currentSegmentString) {
            const patchTokens = tokens.slice(tokenStartIndex, tokenIndex + 1)
            patches.push({
                patch: currentSegmentString,
                tokens: patchTokens,
                prob: patchTokens.reduce((acc, currentToken) => acc * probOfToken(currentToken), 1),
                index: patches.length,
                tokenStart: tokenStartIndex,
                tokenEnd: tokenIndex + 1,
            })
            tokenStartIndex = tokenIndex + 1
            tokenToSegmentString = ""
            segmentIndex += 1
            currentSegmentString = visibleSegments[segmentIndex]?.segment ?? ""
        } else if (
            currentSegmentString &&
            !currentSegmentString.startsWith(tokenToSegmentString)
        ) {
            const patchTokens = tokens.slice(tokenStartIndex, tokenIndex + 1)
            patches.push({
                patch: tokenToSegmentString,
                tokens: patchTokens,
                prob: patchTokens.reduce((acc, currentToken) => acc * probOfToken(currentToken), 1),
                index: patches.length,
                tokenStart: tokenStartIndex,
                tokenEnd: tokenIndex + 1,
            })
            tokenStartIndex = tokenIndex + 1
            tokenToSegmentString = ""
            segmentIndex += 1
            currentSegmentString = visibleSegments[segmentIndex]?.segment ?? ""
        }
    })

    return patches
}

export function matchPatchesToTextFullDP({ patchStrings, text }) {
    const dp = Array.from(
        { length: patchStrings.length + 1 },
        () => new Uint32Array(text.length + 1),
    )

    for (let patchIndex = patchStrings.length - 1; patchIndex >= 0; patchIndex--) {
        const patchString = patchStrings[patchIndex]
        for (let textIndex = text.length; textIndex >= 0; textIndex--) {
            var best = dp[patchIndex + 1][textIndex]
            if (textIndex < text.length && dp[patchIndex][textIndex + 1] > best) {
                best = dp[patchIndex][textIndex + 1]
            }
            if (patchString && text.startsWith(patchString, textIndex)) {
                const matchValue = 1 + dp[patchIndex + 1][textIndex + patchString.length]
                if (matchValue > best) {
                    best = matchValue
                }
            }
            dp[patchIndex][textIndex] = best
        }
    }

    var patchTextMapping = []
    var patchIndex = 0
    var textIndex = 0
    while (patchIndex < patchStrings.length && textIndex <= text.length) {
        const patchString = patchStrings[patchIndex]
        if (
            patchString &&
            text.startsWith(patchString, textIndex) &&
            dp[patchIndex][textIndex] === 1 + dp[patchIndex + 1][textIndex + patchString.length]
        ) {
            patchTextMapping.push({
                patchStart: patchIndex,
                patchEnd: patchIndex + 1,
                textStart: textIndex,
                textEnd: textIndex + patchString.length,
            })
            patchIndex += 1
            textIndex += patchString.length
        } else if (
            dp[patchIndex + 1][textIndex] >= (textIndex < text.length ? dp[patchIndex][textIndex + 1] : 0)
        ) {
            patchIndex += 1
        } else {
            textIndex += 1
        }
    }
    return patchTextMapping
}

export function matchTokensToPrompt(logprobsTokens, templatedPrompt) {
    const patches = tokensToPatches(logprobsTokens).filter(patch => patch.patch)
    const patchStrings = patches.map(patch => patch.patch)
    // This is an interface, input array of string and text, output patchTextMapping, which can be replaced with other optimized versions of algorithms in the future
    // patchTextMapping should keep patch partition information and do not merge adjacent patches, which may lead big patch fail to match
    const patchTextMapping = matchPatchesToTextFullDP({ patchStrings, text: templatedPrompt })
    return patchTextMapping.map(mapping => ({
        tokenStart: patches[mapping.patchStart].tokenStart,
        tokenEnd: patches[mapping.patchEnd - 1].tokenEnd,
        textStart: mapping.textStart,
        textEnd: mapping.textEnd,
    }))
}

export function pieceViewTokens({ logprobsTokens = [], text = "", patchTextMapping = [], textStart = 0, textEnd = text.length } = {}) {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })
    const tokens = []
    const appendGraphemes = (segmentText) => {
        for (const segment of segmenter.segment(segmentText)) {
            tokens.push({
                delta: { content: segment.segment },
                tokenIndex: tokens.length,
                logprobs: { content: [{ token: segment.segment, top_logprobs: [] }] },
            })
        }
    }

    var textCursor = textStart
    for (const mapping of patchTextMapping) {
        if (mapping.textStart < textStart || mapping.textEnd > textEnd) {
            continue
        }
        appendGraphemes(text.slice(textCursor, mapping.textStart))
        for (const logprobsToken of logprobsTokens.slice(mapping.tokenStart, mapping.tokenEnd)) {
            const token = deepCopy(logprobsToken)
            token.delta = { content: tokenToDisplayString(token, logprobsTokens) }
            delete token.finish_reason
            token.tokenIndex = tokens.length
            tokens.push(token)
        }
        textCursor = mapping.textEnd
    }
    appendGraphemes(text.slice(textCursor, textEnd))
    return tokens
}

export function pieceStructureViewTokens({ message, logprobsTokens = [], templatedPrompt = "", patchTextMapping = [], keyPathPromptMapping = [] } = {}) {
    var tokens = []
    const getKeyPathPromptMapping = (keyPath) => keyPathPromptMapping.find(mapping =>
        mapping.keyPath.length === keyPath.length &&
        mapping.keyPath.every((key, index) => key === keyPath[index])
    )
    const appendChannelTokens = (keyPath, text, buildDelta) => {
        const mapping = getKeyPathPromptMapping(keyPath)
        const channelTokens = mapping ? pieceViewTokens({
            logprobsTokens,
            text: templatedPrompt,
            patchTextMapping,
            textStart: mapping.textStart,
            textEnd: mapping.textEnd,
        }) : pieceViewTokens({ text })
        for (const token of channelTokens) {
            token.delta = buildDelta(token.delta.content)
        }
        tokens.push(...channelTokens)
    }

    appendChannelTokens(['reasoning'], message.reasoning ?? "", text => ({ reasoning: text }))
    appendChannelTokens(['content'], message.content ?? "", text => ({ content: text }))
    for (const toolCall of message.tool_calls || []) {
        const toolCallHeader = deepCopy(toolCall)
        delete toolCallHeader.function.arguments
        tokens.push({
            delta: { tool_calls: [toolCallHeader] },
            tokenIndex: tokens.length,
            logprobs: { content: [{ token: JSON.stringify(toolCallHeader), top_logprobs: [] }] },
        })
        appendChannelTokens(
            ['tool_calls', toolCall.index, 'function', 'arguments'],
            toolCall.function.arguments ?? "",
            text => ({ tool_calls: [{ index: toolCall.index, function: { arguments: text } }] }),
        )
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

export function buildViewTokens({ message, chatTemplate, logprobsTokens = [] } = {}) {
    chatTemplate = chatTemplate || ChatTemplateClosure()
    const { templatedPrompt, keyPathPromptMapping } = chatTemplate.apply(message)
    const patchTextMapping = logprobsTokens.length ? matchTokensToPrompt(logprobsTokens, templatedPrompt) : []
    if (chatTemplate.chatTemplateType === "plain_text") {
        return pieceViewTokens({ logprobsTokens, text: templatedPrompt, patchTextMapping })
    }
    return pieceStructureViewTokens({
        logprobsTokens,
        templatedPrompt,
        patchTextMapping,
        message,
        keyPathPromptMapping,
    })
}

export function ChatTemplateClosure({ apiConfig } = {}) {
    function apply(message = {}) {
        var templatedPrompt = ""
        var textCursor = 0
        const keyPathPromptMapping = []
        const appendText = (keyPath, text) => {
            if (!text) {
                return
            }
            if (templatedPrompt) {
                const separator = '✦'
                templatedPrompt += separator
                textCursor += separator.length
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
