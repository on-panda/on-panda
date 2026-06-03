import { deepCopy } from './commonUtils.js'
import { tokenToDisplayString, tokensToPatches } from './chatUtils.js'
import { buildMatchedResponseTemplate } from './responseTemplates/index.js'

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

// const MATCH_FULL_DP_MAX_CELLS = 10 //_000_000
const MATCH_FULL_DP_MAX_CELLS = 10_000_000

export function matchPatchesToTextGreedy({ patchStrings, text }) {
    const patchTextMapping = []
    var patchCursor = patchStrings.length
    var textCursor = text.length

    while (patchCursor > 0 && textCursor > 0) {
        const pendingPatchIndexes = []
        var pendingPatchChars = 0
        var matchedMapping = null

        function findPatchByEndDistance(patchString, minDistance, maxDistance) {
            maxDistance = Math.min(maxDistance, textCursor)
            for (let textDistance = minDistance; textDistance <= maxDistance; textDistance++) {
                const textEnd = textCursor - textDistance
                const textStart = textEnd - patchString.length
                if (textStart >= 0 && text.startsWith(patchString, textStart)) {
                    return textStart
                }
            }
            return -1
        }

        function tryMatch(patchIndex, minDistance, maxDistance) {
            const patchString = patchStrings[patchIndex]
            const textStart = findPatchByEndDistance(patchString, minDistance, maxDistance)
            if (textStart !== -1) {
                matchedMapping = {
                    patchStart: patchIndex,
                    patchEnd: patchIndex + 1,
                    textStart,
                    textEnd: textStart + patchString.length,
                }
            }
        }

        for (let patchIndex = patchCursor - 1; patchIndex >= 0 && !matchedMapping; patchIndex--) {
            const previousPatchChars = pendingPatchChars
            pendingPatchChars += patchStrings[patchIndex].length
            pendingPatchIndexes.push(patchIndex)

            tryMatch(patchIndex, 0, previousPatchChars || pendingPatchChars)

            if (matchedMapping || !previousPatchChars) {
                continue
            }
            for (const pendingPatchIndex of pendingPatchIndexes) {
                tryMatch(pendingPatchIndex, previousPatchChars + 1, pendingPatchChars)
                if (matchedMapping) {
                    break
                }
            }
        }

        if (!matchedMapping) {
            break
        }
        patchTextMapping.push(matchedMapping)
        patchCursor = matchedMapping.patchStart
        textCursor = matchedMapping.textStart
    }

    return patchTextMapping.reverse()
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
        const best = dp[patchIndex][textIndex]
        if (textIndex < text.length && dp[patchIndex][textIndex + 1] === best) {
            textIndex += 1
        } else if (
            patchString &&
            text.startsWith(patchString, textIndex) &&
            best === 1 + dp[patchIndex + 1][textIndex + patchString.length]
        ) {
            patchTextMapping.push({
                patchStart: patchIndex,
                patchEnd: patchIndex + 1,
                textStart: textIndex,
                textEnd: textIndex + patchString.length,
            })
            patchIndex += 1
            textIndex += patchString.length
        } else {
            patchIndex += 1
        }
    }
    return patchTextMapping
}

export function matchTokensToPrompt(logprobsTokens, templatedPrompt) {
    const patches = tokensToPatches(logprobsTokens).filter(patch => patch.patch)
    const patchStrings = patches.map(patch => patch.patch)
    // This is an interface, input array of string and text, output patchTextMapping, which can be replaced with other optimized versions of algorithms in the future
    // patchTextMapping should keep patch partition information and do not merge adjacent patches, which may lead big patch fail to match
    const patchTextMapping = patchStrings.length * templatedPrompt.length <= MATCH_FULL_DP_MAX_CELLS
        ? matchPatchesToTextFullDP({ patchStrings, text: templatedPrompt })
        : matchPatchesToTextGreedy({ patchStrings, text: templatedPrompt })
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
            // Disregarding logprobsTokens's structure
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
        if (message.sidecar) {
            tokens[0].delta.sidecar = deepCopy(message.sidecar)
        }
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

export function buildViewTokens({ message, responseTemplate, logprobsTokens = [] } = {}) {
    responseTemplate = responseTemplate || buildResponseTemplate()
    const { templatedPrompt, keyPathPromptMapping } = responseTemplate.apply(message)
    const patchTextMapping = logprobsTokens.length ? matchTokensToPrompt(logprobsTokens, templatedPrompt) : []
    if (responseTemplate.responseTemplateType === "plain_text") {
        const tokens = pieceViewTokens({ logprobsTokens, text: templatedPrompt, patchTextMapping })
        if (message.finish_reason) {
            tokens.push({
                delta: { content: "" },
                tokenIndex: tokens.length,
                finish_reason: message.finish_reason,
            })
        }
        return tokens
    }
    return pieceStructureViewTokens({
        logprobsTokens,
        templatedPrompt,
        patchTextMapping,
        message,
        keyPathPromptMapping,
    })
}

export function buildResponseTemplate({ apiConfig } = {}) {
    return buildMatchedResponseTemplate({ apiConfig }) || new DefaultResponseTemplate({ apiConfig })
}

export class DefaultResponseTemplate {
    constructor({ apiConfig } = {}) {
        this.responseTemplateType = "default"
        this.configMark = JSON.stringify((apiConfig?.value || apiConfig || {}).response_template ?? null)
    }

    apply(message = {}) {
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

    parse(tokens = []) {
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
                if (key === "sidecar") {
                    delta.sidecar = mergeTwoDeltas(delta.sidecar || {}, delta2.sidecar || {})
                    continue
                }
                if (key === "reasoning" && delta1.content?.length && !delta1.reasoning?.length) {
                    // if delta1 has content and delta2 is reasoning, set old content as reasoning
                    delta.reasoning = delta.content
                    delete delta.content
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
}
