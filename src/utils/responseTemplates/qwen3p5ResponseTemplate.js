import { tokenToDisplayString } from '../chatUtils.js'
import { deepCopy } from '../commonUtils.js'

const specialMarker = (name) => ['<|', name, '|>'].join('')
const xmlMarker = (name, closing = false) => ['<', closing ? '/' : '', name, '>'].join('')
const xmlValueMarker = (name) => ['<', name, '='].join('')
const ASSISTANT_BEGIN = `${specialMarker('im_start')}assistant\n`
const IM_END = specialMarker('im_end')
const THINK_BEGIN = xmlMarker('think')
const THINK_END = xmlMarker('think', true)
const TOOL_CALL_BEGIN = xmlMarker('tool_call')
const TOOL_CALL_END = xmlMarker('tool_call', true)
const FUNCTION_BEGIN = xmlValueMarker('function')
const FUNCTION_END = xmlMarker('function', true)
const PARAMETER_BEGIN = xmlValueMarker('parameter')
const PARAMETER_END = xmlMarker('parameter', true)
const REASONING_END = 'reasoning_end'

function stripRepeatedThinkBegin(text) {
    while (text.startsWith(THINK_BEGIN)) {
        text = text.slice(THINK_BEGIN.length)
        if (text.startsWith('\n')) {
            text = text.slice(1)
        }
    }
    return text
}

function stringifyJsonForTemplate(value) {
    if (Array.isArray(value)) {
        return `[${value.map(stringifyJsonForTemplate).join(', ')}]`
    }
    if (value && typeof value === 'object') {
        return `{${Object.entries(value).map(
            ([key, childValue]) => `${JSON.stringify(key)}: ${stringifyJsonForTemplate(childValue)}`
        ).join(', ')}}`
    }
    return JSON.stringify(value)
}

function argumentValueToText(value) {
    if (value === null) {
        return 'None'
    }
    if (typeof value === 'boolean') {
        return value ? 'True' : 'False'
    }
    if (typeof value === 'object') {
        return stringifyJsonForTemplate(value)
    }
    return String(value)
}

function parseArgumentsPrefix(argumentsText) {
    if (!argumentsText) {
        return { parameters: [], complete: false }
    }
    var argumentsObject
    try {
        argumentsObject = JSON.parse(argumentsText)
    } catch {
        if (argumentsText.trim() === '{') {
            return { parameters: [], complete: false }
        }
        var inString = false
        var escaped = false
        for (const character of argumentsText) {
            if (escaped) {
                escaped = false
            } else if (inString && character === '\\') {
                escaped = true
            } else if (character === '"') {
                inString = !inString
            }
        }
        try {
            argumentsObject = JSON.parse(argumentsText + (inString ? '"}' : 'null}'))
        } catch {
            return null
        }
        if (!argumentsObject || typeof argumentsObject !== 'object' || Array.isArray(argumentsObject)) {
            return null
        }
        const parameters = Object.entries(argumentsObject).map(([name, value]) => ({
            name,
            value: argumentValueToText(value),
            complete: true,
        }))
        parameters[parameters.length - 1].complete = false
        if (!inString) {
            parameters[parameters.length - 1].value = ''
        }
        return { parameters, complete: false }
    }
    if (!argumentsObject || typeof argumentsObject !== 'object' || Array.isArray(argumentsObject)) {
        return null
    }
    return {
        parameters: Object.entries(argumentsObject).map(([name, value]) => ({
            name,
            value: argumentValueToText(value),
            complete: true,
        })),
        complete: true,
    }
}

function buildArgumentsPrefix(parameters, functionClosed) {
    const argumentParts = parameters.map(parameter => {
        var valueText = JSON.stringify(parameter.value)
        if (!parameter.complete) {
            valueText = valueText.slice(0, -1)
        }
        return `${JSON.stringify(parameter.name)}: ${valueText}`
    })
    return `{${argumentParts.join(', ')}${functionClosed ? '}' : ''}`
}

function parseXmlParameters(rawArguments, functionClosed) {
    const parameters = []
    var cursor = 0
    while (cursor < rawArguments.length) {
        const parameterBegin = rawArguments.indexOf(PARAMETER_BEGIN, cursor)
        if (parameterBegin === -1) {
            if (rawArguments.slice(cursor).trim()) {
                return null
            }
            break
        }
        if (rawArguments.slice(cursor, parameterBegin).trim()) {
            return null
        }
        const nameStart = parameterBegin + PARAMETER_BEGIN.length
        const nameEnd = rawArguments.indexOf('>', nameStart)
        if (nameEnd === -1) {
            return null
        }
        const valueStart = nameEnd + 1
        const parameterEnd = rawArguments.indexOf(PARAMETER_END, valueStart)
        const nextParameterBegin = rawArguments.indexOf(PARAMETER_BEGIN, valueStart)
        const hasParameterEnd = parameterEnd !== -1 && (
            nextParameterBegin === -1 || parameterEnd < nextParameterBegin
        )
        const valueEnd = hasParameterEnd
            ? parameterEnd
            : nextParameterBegin === -1 ? rawArguments.length : nextParameterBegin
        var value = rawArguments.slice(valueStart, valueEnd)
        if (value.startsWith('\n')) {
            value = value.slice(1)
        }
        const parameterComplete = hasParameterEnd || nextParameterBegin !== -1 || functionClosed
        if (parameterComplete && value.endsWith('\n')) {
            value = value.slice(0, -1)
        }
        parameters.push({
            name: rawArguments.slice(nameStart, nameEnd),
            value,
            complete: parameterComplete,
        })
        cursor = hasParameterEnd ? parameterEnd + PARAMETER_END.length : valueEnd
    }

    if (!parameters.length && rawArguments.trim()) {
        return null
    }
    if (!parameters.length) {
        return functionClosed ? '{}' : ''
    }
    return buildArgumentsPrefix(parameters, functionClosed)
}

function buildToolCall({ name, argumentsText, index } = {}) {
    return {
        id: `functions.${name}:${index}`,
        type: 'function',
        index,
        function: { name, arguments: argumentsText },
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
        const functionBegin = toolCallsText.indexOf(
            FUNCTION_BEGIN,
            toolCallBegin + TOOL_CALL_BEGIN.length,
        )
        if (functionBegin === -1) {
            break
        }
        const nameStart = functionBegin + FUNCTION_BEGIN.length
        const nameEnd = toolCallsText.indexOf('>', nameStart)
        if (nameEnd === -1) {
            break
        }

        const functionEnd = toolCallsText.indexOf(FUNCTION_END, nameEnd + 1)
        const nextToolCallBegin = toolCallsText.indexOf(TOOL_CALL_BEGIN, nameEnd + 1)
        const functionClosed = functionEnd !== -1 && (
            nextToolCallBegin === -1 || functionEnd < nextToolCallBegin
        )
        const rawArgumentsEnd = functionClosed
            ? functionEnd
            : nextToolCallBegin === -1 ? toolCallsText.length : nextToolCallBegin
        const rawArguments = toolCallsText.slice(nameEnd + 1, rawArgumentsEnd)
        const parsedArguments = parseXmlParameters(rawArguments, functionClosed)
        var argumentsText = parsedArguments
        if (argumentsText === null) {
            argumentsText = rawArguments.startsWith('\n') ? rawArguments.slice(1) : rawArguments
            if (functionClosed && argumentsText.endsWith('\n')) {
                argumentsText = argumentsText.slice(0, -1)
            }
        }
        toolCalls.push(buildToolCall({
            name: toolCallsText.slice(nameStart, nameEnd),
            argumentsText,
            index: toolCalls.length,
        }))

        if (nextToolCallBegin !== -1 && (!functionClosed || nextToolCallBegin < functionEnd)) {
            cursor = nextToolCallBegin
            continue
        }
        if (!functionClosed) {
            break
        }
        const toolCallEnd = toolCallsText.indexOf(TOOL_CALL_END, functionEnd + FUNCTION_END.length)
        if (toolCallEnd === -1) {
            break
        }
        cursor = toolCallEnd + TOOL_CALL_END.length
    }
    return toolCalls
}

function parseQwenResponseText(text) {
    const message = { role: 'assistant' }
    var remainingText = text
    var hasAssistantBegin = false
    var hasImEnd = false

    if (remainingText.startsWith(ASSISTANT_BEGIN)) {
        remainingText = remainingText.slice(ASSISTANT_BEGIN.length)
        hasAssistantBegin = true
    }
    if (remainingText.endsWith(`${IM_END}\n`)) {
        remainingText = remainingText.slice(0, -IM_END.length - 1)
        hasImEnd = true
    } else if (remainingText.endsWith(IM_END)) {
        remainingText = remainingText.slice(0, -IM_END.length)
        hasImEnd = true
    }

    var reasoningClosed = false
    if (remainingText.startsWith(THINK_BEGIN)) {
        const reasoningStart = THINK_BEGIN.length + (remainingText[THINK_BEGIN.length] === '\n' ? 1 : 0)
        const reasoningEnd = remainingText.indexOf(THINK_END, reasoningStart)
        if (reasoningEnd === -1) {
            const implicitReasoningEnd = remainingText.indexOf(TOOL_CALL_BEGIN, reasoningStart)
            const reasoning = stripRepeatedThinkBegin(remainingText.slice(
                reasoningStart,
                implicitReasoningEnd === -1 ? remainingText.length : implicitReasoningEnd,
            )).replace(/\n+$/, '')
            if (reasoning) {
                message.reasoning = reasoning
            }
            if (implicitReasoningEnd === -1) {
                return message
            }
            remainingText = remainingText.slice(implicitReasoningEnd)
            reasoningClosed = true
        } else {
            let reasoning = stripRepeatedThinkBegin(remainingText.slice(reasoningStart, reasoningEnd))
            if (reasoning.endsWith('\n')) {
                reasoning = reasoning.slice(0, -1)
            }
            if (reasoning) {
                message.reasoning = reasoning
            }
            remainingText = remainingText.slice(reasoningEnd + THINK_END.length)
            if (remainingText.startsWith('\n\n')) {
                remainingText = remainingText.slice(2)
            }
            reasoningClosed = true
        }
    }

    const toolCallBegin = remainingText.indexOf(TOOL_CALL_BEGIN)
    if (toolCallBegin === -1) {
        message.content = remainingText
    } else {
        const toolCalls = parseToolCalls(remainingText.slice(toolCallBegin))
        if (toolCalls.length) {
            message.content = remainingText.slice(0, toolCallBegin).replace(/\n+$/, '')
            message.tool_calls = toolCalls
        } else {
            message.content = remainingText
        }
    }

    if (hasImEnd) {
        message.finish_reason = message.tool_calls?.length ? 'tool_calls' : 'stop'
    } else if (reasoningClosed && !message.content && !message.tool_calls?.length) {
        message.finish_reason = REASONING_END
    }
    if (hasAssistantBegin && !message.content && !message.reasoning && !message.tool_calls?.length) {
        message.content = ''
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
    var finishReason
    const message = tokens.filter(
        token => !token.pruned
    ).map(token => {
        if (token.finish_reason) {
            finishReason = token.finish_reason
        }
        return token.delta || {}
    }).reduce((delta1, delta2) => {
        const delta = { ...delta1 }
        for (const key in delta2) {
            if (key === 'tool_calls' && delta2.tool_calls?.length) {
                if (delta.finish_reason === REASONING_END) {
                    delete delta.finish_reason
                }
                delta.tool_calls = mergeToolCalls(delta.tool_calls || [], delta2.tool_calls)
                continue
            }
            if (key === 'content' && delta2.content && delta.finish_reason === REASONING_END) {
                delete delta.finish_reason
            }
            if (key === 'sidecar') {
                delta.sidecar = mergeTwoDeltas(delta.sidecar || {}, delta2.sidecar || {})
                continue
            }
            if (key === 'reasoning' && delta1.content?.length && !delta1.reasoning?.length) {
                const parsedPrefix = parseQwenResponseText(delta.content)
                if (parsedPrefix.reasoning || parsedPrefix.tool_calls?.length) {
                    if (parsedPrefix.reasoning) {
                        delta.reasoning = parsedPrefix.reasoning
                    }
                    if (parsedPrefix.content) {
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
    if (finishReason) {
        message.finish_reason = finishReason
        if (message.finish_reason === 'stop' && message.tool_calls?.length) {
            message.finish_reason = 'tool_calls'
        }
    }
    return message
}

function normalizePlainTextInStructuredMessage(message) {
    if (typeof message.content !== 'string') {
        return message
    }
    const hasTemplateText = message.content.includes(THINK_BEGIN) ||
        message.content.includes(TOOL_CALL_BEGIN) ||
        message.content.includes(ASSISTANT_BEGIN)
    if (!hasTemplateText) {
        return message
    }

    const parsedTextMessage = parseQwenResponseText(message.content)
    if (parsedTextMessage.reasoning) {
        message.reasoning = parsedTextMessage.reasoning + (message.reasoning || '')
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
        const structuredToolCalls = message.tool_calls || []
        message.tool_calls = mergeToolCalls(parsedTextMessage.tool_calls, structuredToolCalls)
        for (const structuredToolCall of structuredToolCalls) {
            if (structuredToolCall.id) {
                message.tool_calls[structuredToolCall.index].id = structuredToolCall.id
            }
        }
    }
    if (message.finish_reason === 'stop' && message.tool_calls?.length) {
        message.finish_reason = 'tool_calls'
    }
    return message
}

function normalizeMessageToolCallIndexes(message) {
    if (!message.tool_calls?.length) {
        return message
    }
    message.tool_calls = message.tool_calls.filter(Boolean)
    for (const [toolCallIndex, toolCall] of message.tool_calls.entries()) {
        toolCall.index = toolCallIndex
        if (!toolCall.id) {
            toolCall.id = `functions.${toolCall.function.name}:${toolCallIndex}`
        }
    }
    return message
}

function hasStructuredDelta(tokens = []) {
    return tokens.some(token => token.delta?.role || token.delta?.reasoning || token.delta?.tool_calls?.length)
}

export class Qwen3p5ResponseTemplate {
    static match({ responseTemplateConfig } = {}) {
        return /^Qwen\/Qwen3\.[5-8](-|$)/i.test(responseTemplateConfig?.name_or_path || '')
    }

    constructor({ apiConfig } = {}) {
        this.responseTemplateType = 'plain_text'
        this.configMark = JSON.stringify((apiConfig?.value || apiConfig || {}).response_template ?? null)
    }

    apply(message = {}) {
        const isPartial = !['stop', 'tool_calls'].includes(message.finish_reason)
        const reasoning = message.reasoning ? stripRepeatedThinkBegin(message.reasoning) : ''
        const hasResponseBody = reasoning || message.content || message.tool_calls?.length
        const isPureReasoningPartial = isPartial &&
            message.finish_reason !== REASONING_END &&
            !message.content &&
            !message.tool_calls?.length
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

        if (reasoning || !hasResponseBody && isPartial && message.finish_reason !== REASONING_END) {
            appendRawText(`${THINK_BEGIN}\n`)
            appendMappedText(['reasoning'], reasoning)
            if (!isPureReasoningPartial) {
                appendRawText(`\n${THINK_END}`)
                if (message.content || message.tool_calls?.length) {
                    appendRawText('\n\n')
                }
            }
        }
        appendMappedText(['content'], message.content)

        if (message.tool_calls?.length) {
            if (message.content) {
                appendRawText('\n\n')
            }
            for (const [toolCallPosition, toolCall] of message.tool_calls.entries()) {
                if (toolCallPosition) {
                    appendRawText('\n')
                }
                appendRawText(`${TOOL_CALL_BEGIN}\n${FUNCTION_BEGIN}${toolCall.function.name}>\n`)
                const parsedArguments = parseArgumentsPrefix(toolCall.function.arguments)
                const isLastPartialToolCall = isPartial && toolCallPosition === message.tool_calls.length - 1
                if (parsedArguments) {
                    for (const parameter of parsedArguments.parameters) {
                        appendRawText(`${PARAMETER_BEGIN}${parameter.name}>\n`)
                        appendMappedText(
                            ['tool_calls', toolCallPosition, 'function', 'arguments'],
                            parameter.value,
                        )
                        if (parameter.complete || !isLastPartialToolCall) {
                            appendRawText(`\n${PARAMETER_END}\n`)
                        }
                    }
                } else {
                    appendMappedText(
                        ['tool_calls', toolCallPosition, 'function', 'arguments'],
                        toolCall.function.arguments,
                    )
                }

                const functionComplete = !isLastPartialToolCall || parsedArguments?.complete
                if (functionComplete) {
                    if (!parsedArguments && toolCall.function.arguments) {
                        appendRawText('\n')
                    }
                    appendRawText(FUNCTION_END)
                }
                if (!isLastPartialToolCall) {
                    appendRawText(`\n${TOOL_CALL_END}`)
                }
            }
        }
        return { templatedPrompt, keyPathPromptMapping }
    }

    parse(tokens = []) {
        if (typeof tokens !== 'string' && !tokens.some(token => !token.pruned)) {
            return {}
        }
        if (typeof tokens !== 'string' && hasStructuredDelta(tokens)) {
            return normalizeMessageToolCallIndexes(
                normalizePlainTextInStructuredMessage(parseStructuredTokens(tokens))
            )
        }
        const responseText = tokensToResponseText(tokens)
        if (!responseText) {
            return {}
        }
        const message = parseQwenResponseText(responseText)
        if (typeof tokens !== 'string') {
            const finishReasonToken = tokens.filter(token => !token.pruned && token.finish_reason).at(-1)
            if (finishReasonToken) {
                message.finish_reason = finishReasonToken.finish_reason
                if (message.finish_reason === 'stop' && message.tool_calls?.length) {
                    message.finish_reason = 'tool_calls'
                }
            }
        }
        return normalizeMessageToolCallIndexes(message)
    }
}
