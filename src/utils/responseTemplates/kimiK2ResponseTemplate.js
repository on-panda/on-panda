import { tokenToDisplayString } from '../chatUtils.js'
import { deepCopy } from '../commonUtils.js'

const THINK_BEGIN = '<think>'
const THINK_END = '</think>'
const REASONING_END = 'reasoning_end'
const TOOL_CALLS_SECTION_BEGIN = '<|tool_calls_section_begin|>'
const TOOL_CALLS_SECTION_END = '<|tool_calls_section_end|>'
const TOOL_CALL_BEGIN = '<|tool_call_begin|>'
const TOOL_CALL_ARGUMENT_BEGIN = '<|tool_call_argument_begin|>'
const TOOL_CALL_END = '<|tool_call_end|>'

function stripRepeatedThinkBegin(text) {
    while (text.startsWith(THINK_BEGIN)) {
        text = text.slice(THINK_BEGIN.length)
    }
    return text
}

function parseFunctionNameFromToolCallId(toolCallId) {
    const namePart = toolCallId.startsWith('functions.')
        ? toolCallId.slice('functions.'.length)
        : toolCallId
    const indexSeparator = namePart.lastIndexOf(':')
    return indexSeparator === -1 ? namePart : namePart.slice(0, indexSeparator)
}

function parseToolCallIndex(toolCallId, fallbackIndex) {
    const indexMatch = toolCallId.match(/:(\d+)$/)
    return indexMatch ? Number(indexMatch[1]) : fallbackIndex
}

function buildToolCallFromText({ toolCallId, argumentsText, fallbackIndex } = {}) {
    const index = parseToolCallIndex(toolCallId, fallbackIndex)
    return {
        id: toolCallId,
        type: 'function',
        index,
        function: {
            name: parseFunctionNameFromToolCallId(toolCallId),
            arguments: argumentsText,
        },
    }
}

function parseToolCalls(toolCallsText) {
    const toolCalls = []
    var cursor = 0
    while (cursor < toolCallsText.length) {
        const toolCallBegin = toolCallsText.indexOf(TOOL_CALL_BEGIN, cursor)
        if (toolCallBegin === -1) {
            break
        }
        const toolCallIdStart = toolCallBegin + TOOL_CALL_BEGIN.length
        const argumentBegin = toolCallsText.indexOf(TOOL_CALL_ARGUMENT_BEGIN, toolCallIdStart)
        if (argumentBegin === -1) {
            const toolCallId = toolCallsText.slice(toolCallIdStart).trim()
            if (toolCallId) {
                toolCalls.push(buildToolCallFromText({
                    toolCallId,
                    argumentsText: '',
                    fallbackIndex: toolCalls.length,
                }))
            }
            break
        }

        const toolCallId = toolCallsText.slice(toolCallIdStart, argumentBegin).trim()
        const argumentsStart = argumentBegin + TOOL_CALL_ARGUMENT_BEGIN.length
        const toolCallEnd = toolCallsText.indexOf(TOOL_CALL_END, argumentsStart)
        const argumentsText = toolCallEnd === -1
            ? toolCallsText.slice(argumentsStart)
            : toolCallsText.slice(argumentsStart, toolCallEnd)
        if (toolCallId) {
            toolCalls.push(buildToolCallFromText({
                toolCallId,
                argumentsText,
                fallbackIndex: toolCalls.length,
            }))
        }
        if (toolCallEnd === -1) {
            break
        }
        cursor = toolCallEnd + TOOL_CALL_END.length
    }
    return toolCalls
}

function parseKimiK2ResponseText(text) {
    const message = { role: 'assistant' }
    var remainingText = text
    var reasoningClosed = false

    if (remainingText.startsWith(THINK_BEGIN)) {
        const reasoningStart = THINK_BEGIN.length
        const reasoningEnd = remainingText.indexOf(THINK_END, reasoningStart)
        if (reasoningEnd === -1) {
            const maybeContentText = stripRepeatedThinkBegin(remainingText.slice(reasoningStart))
            if (maybeContentText.includes(TOOL_CALLS_SECTION_BEGIN)) {
                remainingText = maybeContentText
            } else {
                if (maybeContentText) {
                    message.reasoning = maybeContentText
                }
                return message
            }
        } else {
            const reasoning = stripRepeatedThinkBegin(remainingText.slice(reasoningStart, reasoningEnd))
            if (reasoning) {
                message.reasoning = reasoning
            }
            remainingText = remainingText.slice(reasoningEnd + THINK_END.length)
            reasoningClosed = true
        }
    }

    const toolCallsSectionBegin = remainingText.indexOf(TOOL_CALLS_SECTION_BEGIN)
    if (toolCallsSectionBegin === -1) {
        message.content = remainingText
        if (reasoningClosed && !remainingText) {
            message.finish_reason = REASONING_END
        }
        return message
    }

    message.content = remainingText.slice(0, toolCallsSectionBegin)
    const toolCallsSectionContentStart = toolCallsSectionBegin + TOOL_CALLS_SECTION_BEGIN.length
    const toolCallsSectionEnd = remainingText.indexOf(TOOL_CALLS_SECTION_END, toolCallsSectionContentStart)
    const toolCallsText = toolCallsSectionEnd === -1
        ? remainingText.slice(toolCallsSectionContentStart)
        : remainingText.slice(toolCallsSectionContentStart, toolCallsSectionEnd)
    const toolCalls = parseToolCalls(toolCallsText)
    if (toolCalls.length) {
        message.tool_calls = toolCalls
    }
    return message
}

function tokensToResponseText(tokens = []) {
    if (typeof tokens === 'string') {
        return tokens
    }
    return tokens
        .filter(token => !token.pruned)
        .map(token => tokenToDisplayString(token, tokens))
        .join('')
}

function mergeTwoDeltas(delta1, delta2, unmergedKeys = []) {
    var merged = { ...delta1 }
    for (const key in delta2) {
        if (!(key in merged)) {
            merged[key] = deepCopy(delta2[key])
        } else {
            const value1 = delta1[key]
            const value2 = delta2[key]
            if (unmergedKeys.includes(key)) {
                merged[key] = deepCopy(merged[key])
            } else if (typeof value1 === 'string' && typeof value2 === 'string') {
                merged[key] = value1 + value2
            } else if (typeof value1 === 'number' && typeof value2 === 'number') {
                console.assert(value1 === value2, `Number mismatch: ${value1} !== ${value2}`)
                merged[key] = value1
            } else if (typeof value1 === 'object' && typeof value2 === 'object') {
                merged[key] = mergeTwoDeltas(value1, value2, unmergedKeys)
            }
        }
    }
    return merged
}

function mergeToolCalls(toolCalls1 = [], toolCalls2 = []) {
    const toolCalls = toolCalls1.map(toolCall => deepCopy(toolCall))
    for (const toolCall2 of toolCalls2) {
        const index = toolCall2.index
        if (toolCalls[index]) {
            toolCalls[index] = mergeTwoDeltas(toolCalls[index], toolCall2, ['type', 'id', 'name'])
        } else {
            toolCalls[index] = deepCopy(toolCall2)
        }
    }
    return toolCalls
}

function parseStructuredTokens(tokens = []) {
    var role = null
    var finish_reason
    const message = tokens.filter(
        token => !token.pruned
    ).map(
        token => {
            if (token.finish_reason) {
                finish_reason = token.finish_reason
            }
            return token.delta || {}
        }
    ).reduce((delta1, delta2) => {
        const delta = { ...delta1 }
        for (var key in delta2) {
            if (key === 'tool_calls' && delta2.tool_calls?.length) {
                if (delta.finish_reason === REASONING_END) {
                    delete delta.finish_reason
                }
                var toolCalls = delta.tool_calls || []
                var toolCall2 = delta2.tool_calls[0]
                console.assert(delta2.tool_calls.length === 1)
                console.assert(typeof toolCall2.index === 'number')
                if (toolCall2.index === toolCalls.length) {
                    toolCalls.push(toolCall2)
                } else {
                    var toolCall1 = toolCalls[toolCall2.index]
                    toolCalls[toolCall2.index] = mergeTwoDeltas(toolCall1, toolCall2, ['type', 'id', 'name'])
                }
                delta.tool_calls = toolCalls
                continue
            }
            if (key === 'content' && delta2.content) {
                if (delta.finish_reason === REASONING_END) {
                    delete delta.finish_reason
                }
            }
            if (key === 'sidecar') {
                delta.sidecar = mergeTwoDeltas(delta.sidecar || {}, delta2.sidecar || {})
                continue
            }
            if (key === 'reasoning' && delta1.content?.length && !delta1.reasoning?.length) {
                // Plain-text continuation sends the response prefix as content, but some servers still resume by streaming reasoning deltas.
                const parsedPrefix = parseKimiK2ResponseText(delta.content)
                if (parsedPrefix.reasoning || parsedPrefix.tool_calls?.length) {
                    if (parsedPrefix.reasoning) {
                        delta.reasoning = parsedPrefix.reasoning
                    }
                    if (parsedPrefix.finish_reason === REASONING_END) {
                        delta.finish_reason = REASONING_END
                        delta.content = ''
                    } else if (parsedPrefix.content) {
                        delta.content = parsedPrefix.content
                    } else {
                        delete delta.content
                    }
                    if (parsedPrefix.tool_calls?.length) {
                        delta.tool_calls = mergeToolCalls(parsedPrefix.tool_calls, delta.tool_calls || [])
                    }
                } else {
                    delta.reasoning = stripRepeatedThinkBegin(delta.content)
                    delete delta.content
                }
            }
            delta[key] = (delta[key] || '') + (delta2[key] || '')
            if (key === 'role' && delta2.role) {
                role = delta2.role
            }
        }
        return delta
    }, {})
    if (message.reasoning) {
        message.reasoning = message.reasoning.replace(/\n+$/, '')
        if (message.content) {
            message.content = message.content.replace(/^\n+/, '')
        }
    }
    if (message.tool_calls?.length && message.content) {
        message.content = message.content.replace(/\n+$/, '')
    }
    if (role) {
        message.role = role
    } else if (tokens.length) {
        message.role = 'assistant'
    }
    if (role && !message.content && !message.reasoning && !message.tool_calls?.length) {
        message.content = ''
    }
    if (finish_reason) {
        message.finish_reason = finish_reason
        if (message.finish_reason === 'stop' && message.tool_calls?.length) {
            message.finish_reason = 'tool_calls'
        }
    }
    return message
}

function hasStructuredDelta(tokens = []) {
    return tokens.some(token => token.delta?.reasoning || token.delta?.tool_calls?.length)
}

function normalizePlainTextInStructuredMessage(message) {
    if (
        typeof message.content !== 'string' ||
        !message.content.includes(THINK_BEGIN) &&
        !message.content.includes(TOOL_CALLS_SECTION_BEGIN)
    ) {
        return message
    }
    const parsedTextMessage = parseKimiK2ResponseText(message.content)
    if (parsedTextMessage.reasoning) {
        message.reasoning = message.reasoning
            ? message.reasoning + parsedTextMessage.reasoning
            : parsedTextMessage.reasoning
    }
    if (parsedTextMessage.finish_reason === REASONING_END && !message.tool_calls?.length) {
        message.finish_reason = REASONING_END
        message.content = ''
    } else if (parsedTextMessage.finish_reason === REASONING_END) {
        message.content = ''
    } else if (parsedTextMessage.content) {
        message.content = parsedTextMessage.content
    } else {
        delete message.content
    }
    if (parsedTextMessage.tool_calls?.length) {
        message.tool_calls = mergeToolCalls(parsedTextMessage.tool_calls, message.tool_calls || [])
    }
    if (message.finish_reason === 'stop' && message.tool_calls?.length) {
        message.finish_reason = 'tool_calls'
    }
    return message
}

export class KimiK2ResponseTemplate {
    static match({ responseTemplateConfig } = {}) {
        return /^moonshotai\/kimi-k2/i.test(responseTemplateConfig?.name_or_path || '')
    }

    constructor({ apiConfig } = {}) {
        this.responseTemplateType = 'plain_text'
        this.configMark = JSON.stringify((apiConfig?.value || apiConfig || {}).response_template ?? null)
    }

    apply(message = {}) {
        const isPartial = !['stop', 'tool_calls'].includes(message.finish_reason)
        const reasoning = message.reasoning ? stripRepeatedThinkBegin(message.reasoning) : ''
        const isPureReasoningPartial = isPartial && reasoning && message.finish_reason !== REASONING_END && !message.content && !message.tool_calls?.length
        var templatedPrompt = ''
        var textCursor = 0
        const keyPathPromptMapping = []
        const appendRawText = (text) => {
            templatedPrompt += text
            textCursor += text.length
        }
        const appendMappedText = (keyPath, text) => {
            if (!text) {
                return
            }
            keyPathPromptMapping.push({ keyPath, textStart: textCursor, textEnd: textCursor + text.length })
            appendRawText(text)
        }

        if (reasoning) {
            appendRawText(THINK_BEGIN)
            appendMappedText(['reasoning'], reasoning)
            if (!isPureReasoningPartial) {
                appendRawText(THINK_END)
            }
        }
        appendMappedText(['content'], message.content)
        if (message.tool_calls?.length) {
            appendRawText(TOOL_CALLS_SECTION_BEGIN)
            for (const [toolCallPosition, toolCall] of message.tool_calls.entries()) {
                const toolCallId = toolCall.id || `functions.${toolCall.function.name}:${toolCall.index}`
                appendRawText(`${TOOL_CALL_BEGIN}${toolCallId}${TOOL_CALL_ARGUMENT_BEGIN}`)
                appendMappedText(
                    ['tool_calls', toolCall.index, 'function', 'arguments'],
                    toolCall.function.arguments,
                )
                if (!isPartial || toolCallPosition < message.tool_calls.length - 1) {
                    appendRawText(TOOL_CALL_END)
                }
            }
            if (!isPartial) {
                appendRawText(TOOL_CALLS_SECTION_END)
            }
        }
        return { templatedPrompt, keyPathPromptMapping }
    }

    parse(tokens = []) {
        if (typeof tokens !== 'string' && !tokens.some(token => !token.pruned)) {
            return {}
        }
        if (typeof tokens !== 'string' && hasStructuredDelta(tokens)) {
            // Kimi/vLLM continuation can stream the plain-text reasoning prefix in content, then structured tool_calls.
            return normalizePlainTextInStructuredMessage(parseStructuredTokens(tokens))
        }
        const responseText = tokensToResponseText(tokens)
        if (!responseText) {
            // Kimi plain text has no role marker, so empty text is not a real assistant turn. Should not include role.
            return {}
        }
        const message = parseKimiK2ResponseText(responseText)
        if (typeof tokens !== 'string') {
            const finishReasonToken = tokens.filter(token => !token.pruned && token.finish_reason).at(-1)
            if (finishReasonToken) {
                message.finish_reason = finishReasonToken.finish_reason
                if (message.finish_reason === 'stop' && message.tool_calls?.length) {
                    message.finish_reason = 'tool_calls'
                }
            }
        }
        return message
    }
}
