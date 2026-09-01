import { tokenToDisplayString } from '../chatUtils.js'
import { deepCopy } from '../commonUtils.js'
import { parsePartialJsonObject } from '../partialJsonUtils.js'
import { normalizeMessageToolCalls } from './responseTemplateUtils.js'
import { testPartialResponseTemplateRoundTrips } from './responseTemplateTestUtils.js'

const xmlMarker = (name, closing = false) => ['<', closing ? '/' : '', name, '>'].join('')
const THINK_BEGIN = xmlMarker('think')
const THINK_END = xmlMarker('think', true)
const TOOL_CALL_BEGIN = xmlMarker('tool_call')
const TOOL_CALL_END = xmlMarker('tool_call', true)
const ARG_KEY_BEGIN = xmlMarker('arg_key')
const ARG_KEY_END = xmlMarker('arg_key', true)
const ARG_VALUE_BEGIN = xmlMarker('arg_value')
const ARG_VALUE_END = xmlMarker('arg_value', true)
const REASONING_END = 'reasoning_end'

function stripRepeatedThinkBegin(text) {
    while (text.startsWith(THINK_BEGIN)) {
        text = text.slice(THINK_BEGIN.length)
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
    return typeof value === 'string' ? value : stringifyJsonForTemplate(value)
}

function parameterValueToJsonText({ value, schema } = {}) {
    const stringValue = JSON.stringify(value)
    if (!schema) {
        return stringValue
    }
    const schemaTypes = Array.isArray(schema.type) ? schema.type : [schema.type]
    if (schemaTypes.length !== 1 || typeof schemaTypes[0] !== 'string') {
        return stringValue
    }
    const schemaType = schemaTypes[0]
    if (schemaType === 'string') {
        return stringValue
    }
    if (schemaType === 'boolean') {
        if (value === 'true' || value === 'True') {
            return 'true'
        }
        if (value === 'false' || value === 'False') {
            return 'false'
        }
        return stringValue
    }
    if (schemaType === 'null') {
        return value === 'null' || value === 'None' ? 'null' : stringValue
    }

    var parsedValue
    try {
        parsedValue = JSON.parse(value)
    } catch {
        return stringValue
    }
    if (schemaType === 'number') {
        return typeof parsedValue === 'number' && Number.isFinite(parsedValue) ? value : stringValue
    }
    if (schemaType === 'integer') {
        return typeof parsedValue === 'number' && Number.isInteger(parsedValue) ? value : stringValue
    }
    if (schemaType === 'array') {
        return Array.isArray(parsedValue) ? value : stringValue
    }
    if (schemaType === 'object') {
        return parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue)
            ? value
            : stringValue
    }
    return stringValue
}

function buildArgumentsPrefix({ parameters, functionClosed, parametersSchema } = {}) {
    const properties = parametersSchema?.properties || {}
    const argumentParts = parameters.map(parameter => {
        if (!parameter.nameComplete) {
            return JSON.stringify(parameter.name).slice(0, -1)
        }
        if (!parameter.valueStarted) {
            return JSON.stringify(parameter.name)
        }
        const valueText = parameter.complete
            ? parameterValueToJsonText({ value: parameter.value, schema: properties[parameter.name] })
            : JSON.stringify(parameter.value).slice(0, -1)
        return `${JSON.stringify(parameter.name)}: ${valueText}`
    })
    const lastParameter = parameters.at(-1)
    const allComplete = parameters.every(parameter =>
        parameter.nameComplete && parameter.valueStarted && parameter.complete
    )
    if (functionClosed && allComplete) {
        return `{${argumentParts.join(', ')}}`
    }
    if (lastParameter?.nameComplete && lastParameter.valueStarted && lastParameter.complete) {
        return `{${argumentParts.join(', ')}, `
    }
    return `{${argumentParts.join(', ')}`
}

function parseXmlParameters({ rawArguments, functionClosed, parametersSchema } = {}) {
    const parameters = []
    var cursor = 0
    while (cursor < rawArguments.length) {
        const parameterBegin = rawArguments.indexOf(ARG_KEY_BEGIN, cursor)
        if (parameterBegin === -1) {
            if (rawArguments.slice(cursor).trim()) {
                return null
            }
            break
        }
        if (rawArguments.slice(cursor, parameterBegin).trim()) {
            return null
        }

        const nameStart = parameterBegin + ARG_KEY_BEGIN.length
        const nameEnd = rawArguments.indexOf(ARG_KEY_END, nameStart)
        if (nameEnd === -1) {
            parameters.push({
                name: rawArguments.slice(nameStart),
                nameComplete: false,
                valueStarted: false,
                complete: false,
            })
            break
        }

        const name = rawArguments.slice(nameStart, nameEnd)
        const valueMarkerStart = nameEnd + ARG_KEY_END.length
        if (!rawArguments.startsWith(ARG_VALUE_BEGIN, valueMarkerStart)) {
            if (rawArguments.slice(valueMarkerStart).trim()) {
                return null
            }
            parameters.push({ name, nameComplete: true, valueStarted: false, complete: false })
            break
        }

        const valueStart = valueMarkerStart + ARG_VALUE_BEGIN.length
        const valueEnd = rawArguments.indexOf(ARG_VALUE_END, valueStart)
        const nextParameterBegin = rawArguments.indexOf(ARG_KEY_BEGIN, valueStart)
        const hasValueEnd = valueEnd !== -1 && (
            nextParameterBegin === -1 || valueEnd < nextParameterBegin
        )
        const valueCursor = hasValueEnd
            ? valueEnd
            : nextParameterBegin === -1 ? rawArguments.length : nextParameterBegin
        const value = rawArguments.slice(valueStart, valueCursor)
        const complete = hasValueEnd || nextParameterBegin !== -1 || functionClosed
        parameters.push({
            name,
            nameComplete: true,
            valueStarted: true,
            value,
            complete,
        })
        cursor = hasValueEnd ? valueEnd + ARG_VALUE_END.length : valueCursor
    }

    if (!parameters.length) {
        return functionClosed
            ? { text: '{}', complete: true }
            : { text: '', complete: false }
    }
    const allComplete = parameters.every(parameter =>
        parameter.nameComplete && parameter.valueStarted && parameter.complete
    )
    return {
        text: buildArgumentsPrefix({ parameters, functionClosed, parametersSchema }),
        complete: functionClosed && allComplete,
    }
}

function buildToolCall({ name, argumentsText, index } = {}) {
    const toolCall = {
        type: 'function',
        index,
        function: { name },
    }
    if (argumentsText !== undefined) {
        // A missing arguments key means the function name is still open.
        toolCall.function.arguments = argumentsText
    }
    return toolCall
}

function hasActualToolCalls(toolCalls = []) {
    return toolCalls.some(toolCall => toolCall?.function?.name)
}

function parseToolCalls(toolCallsText, tools = []) {
    const toolCalls = []
    var cursor = 0
    while (cursor < toolCallsText.length) {
        const toolCallBegin = toolCallsText.indexOf(TOOL_CALL_BEGIN, cursor)
        if (toolCallBegin === -1) {
            break
        }

        const nameStart = toolCallBegin + TOOL_CALL_BEGIN.length
        const nextToolCallBegin = toolCallsText.indexOf(TOOL_CALL_BEGIN, nameStart)
        const argumentBegin = toolCallsText.indexOf(ARG_KEY_BEGIN, nameStart)
        const toolCallEnd = toolCallsText.indexOf(TOOL_CALL_END, nameStart)
        const markerEnd = [nextToolCallBegin, argumentBegin, toolCallEnd]
            .filter(index => index !== -1)
            .sort((index1, index2) => index1 - index2)[0] ?? -1

        if (markerEnd === -1) {
            const name = toolCallsText.slice(nameStart).trim()
            toolCalls.push(name ? buildToolCall({ name, index: toolCalls.length }) : {})
            break
        }

        const name = toolCallsText.slice(nameStart, markerEnd).trim()
        if (!name) {
            toolCalls.push({})
            if (markerEnd === nextToolCallBegin) {
                cursor = nextToolCallBegin
                continue
            }
            break
        }

        if (markerEnd === toolCallEnd) {
            toolCalls.push(buildToolCall({ name, argumentsText: '{}', index: toolCalls.length }))
            cursor = toolCallEnd + TOOL_CALL_END.length
            continue
        }

        const functionClosed = toolCallEnd !== -1 && (
            nextToolCallBegin === -1 || toolCallEnd < nextToolCallBegin
        )
        const argumentsStart = markerEnd
        const argumentsEnd = functionClosed
            ? toolCallEnd
            : nextToolCallBegin === -1 ? toolCallsText.length : nextToolCallBegin
        const rawArguments = toolCallsText.slice(argumentsStart, argumentsEnd)
        const hasXmlArguments = rawArguments.trimStart().startsWith(ARG_KEY_BEGIN)
        if (!hasXmlArguments && !rawArguments.trim()) {
            toolCalls.push(buildToolCall({
                name,
                argumentsText: functionClosed ? '{}' : undefined,
                index: toolCalls.length,
            }))
            if (functionClosed) {
                cursor = toolCallEnd + TOOL_CALL_END.length
            } else if (nextToolCallBegin !== -1) {
                cursor = nextToolCallBegin
            } else {
                break
            }
            continue
        }
        const parsedArguments = hasXmlArguments
            ? parseXmlParameters({
                rawArguments,
                functionClosed,
                parametersSchema: tools.find(tool => tool.function.name === name)?.function.parameters,
            })
            : null
        const argumentsText = parsedArguments ? parsedArguments.text : rawArguments
        toolCalls.push(buildToolCall({
            name,
            argumentsText,
            index: toolCalls.length,
        }))

        if (functionClosed) {
            cursor = toolCallEnd + TOOL_CALL_END.length
        } else if (nextToolCallBegin !== -1) {
            cursor = nextToolCallBegin
        } else {
            break
        }
    }
    return toolCalls
}

function parseGLM5ResponseText(text, tools = []) {
    if (!text) {
        return {}
    }
    const message = { role: 'assistant' }
    var remainingText = text

    var reasoningClosed = false
    if (remainingText.startsWith(THINK_BEGIN)) {
        const reasoningStart = THINK_BEGIN.length
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
            const reasoning = stripRepeatedThinkBegin(
                remainingText.slice(reasoningStart, reasoningEnd)
            ).replace(/\n+$/, '')
            if (reasoning) {
                message.reasoning = reasoning
            }
            remainingText = remainingText.slice(reasoningEnd + THINK_END.length).replace(/^\n+/, '')
            reasoningClosed = true
        }
    } else if (remainingText.startsWith(THINK_END)) {
        remainingText = remainingText.slice(THINK_END.length).replace(/^\n+/, '')
        reasoningClosed = true
    }

    const toolCallBegin = remainingText.indexOf(TOOL_CALL_BEGIN)
    if (toolCallBegin === -1) {
        message.content = remainingText
    } else {
        message.content = remainingText.slice(0, toolCallBegin).replace(/\n+$/, '')
        const toolCalls = parseToolCalls(remainingText.slice(toolCallBegin), tools)
        message.tool_calls = toolCalls.length ? toolCalls : [{}]
    }

    if (reasoningClosed && !message.content && !('tool_calls' in message)) {
        message.finish_reason = REASONING_END
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

function mergeTwoDeltas(delta1 = {}, delta2 = {}, unmergedKeys = []) {
    const merged = { ...delta1 }
    for (const key in delta2) {
        if (!(key in merged)) {
            merged[key] = deepCopy(delta2[key])
            continue
        }
        const value1 = delta1[key]
        const value2 = delta2[key]
        if (unmergedKeys.includes(key)) {
            merged[key] = deepCopy(value1)
        } else if (typeof value1 === 'string' && typeof value2 === 'string') {
            merged[key] = value1 + value2
        } else if (typeof value1 === 'number' && typeof value2 === 'number') {
            console.assert(value1 === value2, `Number mismatch: ${value1} !== ${value2}`)
            merged[key] = value1
        } else if (value1 && value2 && typeof value1 === 'object' && typeof value2 === 'object') {
            merged[key] = mergeTwoDeltas(value1, value2, unmergedKeys)
        }
    }
    return merged
}

function mergeToolCalls(toolCalls1 = [], toolCalls2 = []) {
    const toolCalls = toolCalls1.map(toolCall => deepCopy(toolCall))
    for (const [position, toolCall2] of toolCalls2.entries()) {
        const index = typeof toolCall2.index === 'number' ? toolCall2.index : position
        const incoming = deepCopy(toolCall2)
        if (incoming.index === undefined && Object.keys(incoming).length) {
            incoming.index = index
        }
        if (toolCalls[index]) {
            toolCalls[index] = mergeTwoDeltas(toolCalls[index], incoming, ['type', 'id', 'name'])
        } else {
            toolCalls[index] = incoming
        }
    }
    return toolCalls
}

function parseStructuredTokens(tokens = [], tools = []) {
    var role = null
    var finishReason
    const activeTokens = tokens.filter(token => !token.pruned)
    var hasToolCalls = false
    var toolCallContent = ''
    // Some continuation APIs put post-think text in the reasoning channel.
    var reasoningContinuationIsContent = false
    var finishReasonTokenIndex = -1
    const message = activeTokens.map((token, tokenIndex) => {
        if (token.finish_reason) {
            finishReason = token.finish_reason
            finishReasonTokenIndex = tokenIndex
        }
        return token.delta || {}
    }).reduce((delta1, delta2) => {
        const delta = { ...delta1 }
        const hadToolCalls = hasToolCalls
        const hasToolCallsInDelta = delta2.tool_calls?.length > 0
        for (const key in delta2) {
            if (key === 'content' && delta2.content == null) {
                continue
            }
            if (key === 'tool_calls' && !delta2.tool_calls?.length) {
                continue
            }
            if (key === 'tool_calls' && delta2.tool_calls?.length) {
                hasToolCalls = true
                if (delta.finish_reason === REASONING_END) {
                    delete delta.finish_reason
                }
                delta.tool_calls = mergeToolCalls(delta.tool_calls || [], delta2.tool_calls)
                continue
            }
            const hasTemplatePrefix = typeof delta2.content === 'string' && (
                delta2.content.includes(THINK_BEGIN) ||
                delta2.content.startsWith(THINK_END)
            )
            if (key === 'content' && typeof delta2.content === 'string' && (
                (hadToolCalls && !hasTemplatePrefix) ||
                (hasToolCallsInDelta && hasToolContinuationMarker(delta2.content))
            )) {
                toolCallContent += delta2.content
                continue
            }
            if (key === 'content' && delta2.content && delta.finish_reason === REASONING_END) {
                delete delta.finish_reason
            }
            if (key === 'sidecar') {
                delta.sidecar = mergeTwoDeltas(delta.sidecar || {}, delta2.sidecar || {})
                continue
            }
            if (key === 'reasoning' && !reasoningContinuationIsContent &&
                delta1.content?.length && !delta1.reasoning?.length) {
                const parsedPrefix = parseGLM5ResponseText(delta.content, tools)
                reasoningContinuationIsContent =
                    parsedPrefix.finish_reason === REASONING_END ||
                    delta.content.includes(THINK_END) ||
                    parsedPrefix.tool_calls?.length > 0
                if (parsedPrefix.reasoning || parsedPrefix.tool_calls?.length || reasoningContinuationIsContent) {
                    if (parsedPrefix.reasoning) {
                        delta.reasoning = parsedPrefix.reasoning
                    }
                    if (parsedPrefix.content !== undefined) {
                        delta.content = parsedPrefix.content
                    } else {
                        delete delta.content
                    }
                    if (parsedPrefix.tool_calls?.length) {
                        hasToolCalls = true
                        delta.tool_calls = mergeToolCalls(parsedPrefix.tool_calls, delta.tool_calls || [])
                    }
                } else if (delta.content.startsWith(THINK_BEGIN) ||
                    delta.content.startsWith(THINK_END)) {
                    // Drop template markers when a continuation resumes in the reasoning channel.
                    delete delta.content
                } else {
                    delta.reasoning = stripRepeatedThinkBegin(delta.content)
                    delete delta.content
                }
            }
            if (key === 'reasoning' && reasoningContinuationIsContent) {
                if (delta.tool_calls?.length || hasToolCallsInDelta) {
                    toolCallContent += delta2.reasoning || ''
                } else {
                    delta.content = (delta.content || '') + (delta2.reasoning || '')
                }
                continue
            }
            if (key === 'role' && delta2.role) {
                role = delta2.role
            }
            if (typeof delta2[key] === 'string') {
                delta[key] = (delta[key] || '') + delta2[key]
            } else if (!(key in delta)) {
                delta[key] = deepCopy(delta2[key])
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
    } else if (activeTokens.length) {
        message.role = 'assistant'
    }
    if (role && !message.content && !message.reasoning && !message.tool_calls?.length) {
        message.content = ''
    }
    if (finishReason === REASONING_END && activeTokens.slice(finishReasonTokenIndex + 1).some(token =>
        token.delta?.content || token.delta?.reasoning || token.delta?.tool_calls?.length
    )) {
        finishReason = undefined
    }
    if (finishReason) {
        message.finish_reason = finishReason
        if (message.finish_reason === 'stop' && hasActualToolCalls(message.tool_calls)) {
            message.finish_reason = 'tool_calls'
        }
    }
    return { message, toolCallContent }
}

function normalizePlainTextInStructuredMessage(message, tools = [], toolCallContent = '') {
    if (typeof message.content !== 'string' && !toolCallContent) {
        return message
    }
    const shouldNormalizeToolCallContent = toolCallContent && (
        hasToolProtocolMarker(toolCallContent) || hasOpenToolCallArguments(message)
    )
    var toolContinuationStart = shouldNormalizeToolCallContent ? 0 : findToolContinuationStart(message)
    if (shouldNormalizeToolCallContent) {
        normalizeToolCallContentContinuation({ message, tools, continuation: toolCallContent })
    } else if (toolCallContent) {
        message.content = (message.content || '') + toolCallContent
    }
    if (typeof message.content !== 'string') {
        return message
    }
    const hasTemplateText = message.content.includes(THINK_BEGIN) ||
        message.content.startsWith(THINK_END) ||
        message.content.includes(TOOL_CALL_BEGIN)
    if (!hasTemplateText && toolContinuationStart === -1) {
        return message
    }

    if (hasTemplateText) {
        const parsedTextMessage = parseGLM5ResponseText(message.content, tools)
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
        if (parsedTextMessage.tool_calls) {
            const structuredToolCalls = (message.tool_calls || []).map((structuredToolCall, position) => {
                const toolCallIndex = typeof structuredToolCall.index === 'number'
                    ? structuredToolCall.index
                    : position
                const parsedArguments = parsedTextMessage.tool_calls[toolCallIndex]?.function?.arguments
                const structuredArguments = structuredToolCall.function?.arguments
                if (typeof parsedArguments === 'string' && typeof structuredArguments === 'string' &&
                    parsePartialJsonObject(parsedArguments)?.complete &&
                    !parsePartialJsonObject(structuredArguments)?.complete) {
                    const metadataToolCall = deepCopy(structuredToolCall)
                    delete metadataToolCall.function.arguments
                    return metadataToolCall
                }
                return structuredToolCall
            })
            message.tool_calls = mergeToolCalls(parsedTextMessage.tool_calls, structuredToolCalls)
            for (const structuredToolCall of structuredToolCalls) {
                if (structuredToolCall.id && message.tool_calls[structuredToolCall.index]) {
                    message.tool_calls[structuredToolCall.index].id = structuredToolCall.id
                }
            }
        }
        toolContinuationStart = findToolContinuationStart(message)
    }
    if (toolContinuationStart !== -1 && !toolCallContent && typeof message.content === 'string') {
        normalizeToolCallContentContinuation({ message, tools, contentStart: toolContinuationStart })
    }
    if (message.finish_reason === 'stop' && hasActualToolCalls(message.tool_calls)) {
        message.finish_reason = 'tool_calls'
    }
    return message
}

function hasStructuredDelta(tokens = []) {
    return tokens.some(token => token.delta?.role || token.delta?.reasoning || token.delta?.tool_calls?.length)
}

function findToolContinuationStart(message) {
    if (!hasActualToolCalls(message.tool_calls) || !message.content) {
        return -1
    }
    const markerIndexes = [
        ARG_KEY_BEGIN,
        ARG_KEY_END,
        ARG_VALUE_BEGIN,
        ARG_VALUE_END,
        TOOL_CALL_END,
    ].map(marker => message.content.indexOf(marker)).filter(index => index !== -1)
    if (markerIndexes.length) {
        return Math.min(...markerIndexes)
    }
    return -1
}

function hasToolProtocolMarker(text) {
    return [
        TOOL_CALL_BEGIN,
        TOOL_CALL_END,
        ARG_KEY_BEGIN,
        ARG_KEY_END,
        ARG_VALUE_BEGIN,
        ARG_VALUE_END,
    ].some(marker => text.includes(marker))
}

function hasToolContinuationMarker(text) {
    if (text.includes(THINK_BEGIN) || text.startsWith(THINK_END)) {
        return false
    }
    return [
        ARG_KEY_BEGIN,
        ARG_KEY_END,
        ARG_VALUE_BEGIN,
        ARG_VALUE_END,
        TOOL_CALL_END,
    ].some(marker => text.includes(marker))
}

function hasOpenToolCallArguments(message) {
    if (!message.tool_calls?.length) {
        return false
    }
    const lastToolCall = message.tool_calls?.at(-1)
    const argumentsText = lastToolCall?.function?.arguments
    return argumentsText === undefined || !parsePartialJsonObject(argumentsText)?.complete
}

function normalizeToolCallContentContinuation({ message, tools, contentStart = 0, continuation } = {}) {
    const structuredToolCalls = message.tool_calls
    const contentPrefix = continuation === undefined
        ? message.content?.slice(0, contentStart) || ''
        : message.content || ''
    continuation = continuation ?? message.content.slice(contentStart)
    const prefixPrompt = buildGLM5Prompt({
        role: 'assistant',
        reasoning: message.reasoning,
        content: contentPrefix,
        tool_calls: structuredToolCalls,
    }).templatedPrompt
    const parsedMessage = parseGLM5ResponseText(prefixPrompt + continuation, tools)
    if (!hasActualToolCalls(parsedMessage.tool_calls)) {
        return
    }

    const normalizedToolCalls = structuredToolCalls.map(toolCall => deepCopy(toolCall))
    for (const [position, parsedToolCall] of parsedMessage.tool_calls.entries()) {
        const toolCallIndex = typeof parsedToolCall.index === 'number' ? parsedToolCall.index : position
        const originalToolCall = normalizedToolCalls[toolCallIndex]
        const normalizedToolCall = deepCopy(parsedToolCall)
        if (originalToolCall?.id) {
            normalizedToolCall.id = originalToolCall.id
        }
        if (originalToolCall?.type) {
            normalizedToolCall.type = originalToolCall.type
        }
        if (originalToolCall?.index !== undefined) {
            normalizedToolCall.index = originalToolCall.index
        }
        normalizedToolCalls[toolCallIndex] = normalizedToolCall
    }
    message.content = parsedMessage.content || ''
    message.tool_calls = normalizedToolCalls
}

function buildGLM5Prompt(message = {}) {
    const isPartial = !['stop', 'tool_calls'].includes(message.finish_reason)
    const reasoning = message.reasoning ? stripRepeatedThinkBegin(message.reasoning).trim() : ''
    const content = typeof message.content === 'string' ? message.content.trim() : ''
    const hasToolCallsChannel = message.tool_calls != null
    const hasResponseBody = reasoning || content || hasToolCallsChannel
    if (!message.role && !hasResponseBody) {
        return { templatedPrompt: '', keyPathPromptMapping: [] }
    }

    const isPureReasoningPartial = isPartial &&
        message.finish_reason !== REASONING_END &&
        !content &&
        !hasToolCallsChannel
    // The surrounding chat template supplies the assistant role marker.
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
        keyPathPromptMapping.push({
            keyPath,
            textStart: textCursor,
            textEnd: textCursor + text.length,
        })
        appendRawText(text)
    }

    if (reasoning) {
        appendRawText(THINK_BEGIN)
        appendMappedText(['reasoning'], reasoning)
        if (!isPureReasoningPartial) {
            appendRawText(THINK_END)
        }
    } else if (isPartial && message.finish_reason !== REASONING_END && !content && !hasToolCallsChannel) {
        appendRawText(THINK_BEGIN)
    } else {
        appendRawText(THINK_END)
    }
    appendMappedText(['content'], content)

    if (hasToolCallsChannel) {
        const isOpenToolCallsChannel = message.tool_calls.length === 1 &&
            !Object.keys(message.tool_calls[0]).length
        if (!message.tool_calls.length || isOpenToolCallsChannel) {
            appendRawText(TOOL_CALL_BEGIN)
        }
        for (const [toolCallPosition, toolCall] of (isOpenToolCallsChannel ? [] : message.tool_calls).entries()) {
            const toolCallFunction = toolCall.function || {}
            appendRawText(`${TOOL_CALL_BEGIN}${toolCallFunction.name || ''}`)
            if (toolCallFunction.arguments === undefined) {
                continue
            }

            const parsedArguments = parsePartialJsonObject(toolCallFunction.arguments)
            if (parsedArguments) {
                for (const parameter of parsedArguments.entries) {
                    appendRawText(`${ARG_KEY_BEGIN}${parameter.name}`)
                    if (!parameter.nameComplete) {
                        break
                    }
                    appendRawText(ARG_KEY_END)
                    if (parameter.value === undefined) {
                        break
                    }
                    appendRawText(ARG_VALUE_BEGIN)
                    appendMappedText(
                        ['tool_calls', toolCallPosition, 'function', 'arguments'],
                        parameter.complete ? argumentValueToText(parameter.value) : parameter.value,
                    )
                    if (parameter.complete) {
                        appendRawText(ARG_VALUE_END)
                    }
                }
            } else {
                appendMappedText(
                    ['tool_calls', toolCallPosition, 'function', 'arguments'],
                    toolCallFunction.arguments,
                )
            }

            const isLastPartialToolCall = isPartial && toolCallPosition === message.tool_calls.length - 1
            const functionComplete = !isLastPartialToolCall || parsedArguments?.complete
            if (functionComplete) {
                appendRawText(TOOL_CALL_END)
            }
        }
    }
    return { templatedPrompt, keyPathPromptMapping }
}

export class GLM5ResponseTemplate {
    static match({ responseTemplateConfig } = {}) {
        return /^zai-org\/GLM-5(?:\.[0-4])?(?:-|$)/i.test(responseTemplateConfig?.name_or_path || '')
    }

    constructor({ apiConfig } = {}) {
        this.responseTemplateType = 'plain_text'
        this.configMark = JSON.stringify((apiConfig?.value || apiConfig || {}).response_template ?? null)
    }

    apply(message = {}) {
        return buildGLM5Prompt(message)
    }

    parse({ tokens = [], messages = [], tools = [] } = {}) {
        if (typeof tokens !== 'string' && !tokens.some(token => !token.pruned)) {
            return {}
        }
        if (typeof tokens !== 'string' && hasStructuredDelta(tokens)) {
            const structuredTokens = parseStructuredTokens(tokens, tools)
            return normalizeMessageToolCalls({
                message: normalizePlainTextInStructuredMessage(
                    structuredTokens.message,
                    tools,
                    structuredTokens.toolCallContent,
                ),
                messages,
            })
        }

        const responseText = tokensToResponseText(tokens)
        if (!responseText) {
            return {}
        }
        const message = parseGLM5ResponseText(responseText, tools)
        if (typeof tokens !== 'string') {
            const finishReasonToken = tokens.filter(token => !token.pruned && token.finish_reason).at(-1)
            if (finishReasonToken) {
                message.finish_reason = finishReasonToken.finish_reason
                if (message.finish_reason === 'stop' && hasActualToolCalls(message.tool_calls)) {
                    message.finish_reason = 'tool_calls'
                }
            }
        }
        return normalizeMessageToolCalls({ message, messages })
    }
}

export function testGLM5ResponseTemplate() {
    const template = new GLM5ResponseTemplate()
    const partialMessageTestCount = testPartialResponseTemplateRoundTrips({ template })
    const assertEqual = (actual, expected, label) => {
        if (actual !== expected) {
            throw new Error(`${label}\n  actual  : ${JSON.stringify(actual)}\n  expected: ${JSON.stringify(expected)}`)
        }
    }
    const tools = [{
        type: 'function',
        function: {
            name: 'get_weather',
            parameters: {
                type: 'object',
                properties: {
                    location: { type: 'string' },
                    unit: { type: 'string' },
                    limit: { type: 'integer' },
                    enabled: { type: 'boolean' },
                    options: { type: 'object' },
                },
            },
        },
    }]

    const message = {
        role: 'assistant',
        reasoning: 'Okay, I see the only tool available is get_weather, I will say hi and call tools.',
        content: 'Hi! Let me get the current temperatures for you.',
        tool_calls: [
            {
                id: 'functions.get_weather:0',
                type: 'function',
                index: 0,
                function: {
                    name: 'get_weather',
                    arguments: '{"location": "New York City, NY", "unit": "celsius"}',
                },
            },
            {
                id: 'functions.get_weather:1',
                type: 'function',
                index: 1,
                function: {
                    name: 'get_weather',
                    arguments: '{"location": "San Francisco, CA", "unit": "celsius"}',
                },
            },
        ],
    }
    const expected = `${THINK_BEGIN}${message.reasoning}${THINK_END}${message.content}` +
        `${TOOL_CALL_BEGIN}get_weather${ARG_KEY_BEGIN}location${ARG_KEY_END}${ARG_VALUE_BEGIN}` +
        `New York City, NY${ARG_VALUE_END}${ARG_KEY_BEGIN}unit${ARG_KEY_END}${ARG_VALUE_BEGIN}` +
        `celsius${ARG_VALUE_END}${TOOL_CALL_END}` +
        `${TOOL_CALL_BEGIN}get_weather${ARG_KEY_BEGIN}location${ARG_KEY_END}${ARG_VALUE_BEGIN}` +
        `San Francisco, CA${ARG_VALUE_END}${ARG_KEY_BEGIN}unit${ARG_KEY_END}${ARG_VALUE_BEGIN}` +
        `celsius${ARG_VALUE_END}${TOOL_CALL_END}`
    assertEqual(template.apply(message).templatedPrompt, expected, 'complete response')
    const parsedMessage = template.parse({ tokens: expected, tools })
    assertEqual(template.apply(parsedMessage).templatedPrompt, expected, 'complete response round-trip')

    const partialArgumentsCases = [
        '', '{', '{"', '{"loc', '{"location"', '{"location":', '{"location": "New',
        '{"location": "New York"', '{"limit": 1', '{"limit": 10}',
        '{"enabled": true}', '{"options": {"a": 1}}', 'oops',
    ]
    for (const argumentsText of partialArgumentsCases) {
        const partialMessage = {
            role: 'assistant',
            tool_calls: [{ index: 0, type: 'function', function: { name: 'get_weather', arguments: argumentsText } }],
        }
        const templatedPrompt = template.apply(partialMessage).templatedPrompt
        const parsedPartial = template.parse({ tokens: templatedPrompt, tools })
        assertEqual(
            template.apply(parsedPartial).templatedPrompt,
            templatedPrompt,
            `partial arguments ${JSON.stringify(argumentsText)} round-trip`,
        )
    }

    const openNameText = `${THINK_END}${TOOL_CALL_BEGIN}get_wea`
    const openNameMessage = template.parse({ tokens: openNameText, tools })
    assertEqual(openNameMessage.tool_calls[0].function.name, 'get_wea', 'open function name')
    assertEqual(openNameMessage.tool_calls[0].function.arguments, undefined, 'open function name arguments')
    assertEqual(
        template.apply(openNameMessage).templatedPrompt,
        `${THINK_END}${TOOL_CALL_BEGIN}get_wea`,
        'open function name round-trip',
    )

    const openToolCallsText = `${THINK_END}${TOOL_CALL_BEGIN}`
    const parsedOpenToolCalls = template.parse({ tokens: openToolCallsText })
    assertEqual(parsedOpenToolCalls.tool_calls.length, 1, 'open tool calls channel')
    assertEqual(Object.keys(parsedOpenToolCalls.tool_calls[0]).length, 0, 'empty open tool call')
    assertEqual(
        template.apply(parsedOpenToolCalls).templatedPrompt,
        `${THINK_END}${TOOL_CALL_BEGIN}`,
        'open tool calls round-trip',
    )

    const structuredOpenName = template.parse({
        tokens: [
            { delta: { role: 'assistant', content: '' } },
            { delta: { tool_calls: [{
                id: 'functions.get_weather:0',
                type: 'function',
                index: 0,
                function: { name: 'get_wea' },
            }] } },
            { delta: { content: 'ther', tool_calls: [] } },
        ],
        tools,
    })
    assertEqual(structuredOpenName.content, '', 'structured open name content')
    assertEqual(structuredOpenName.tool_calls[0].function.name, 'get_weather', 'structured open name')
    assertEqual(structuredOpenName.tool_calls[0].function.arguments, undefined, 'structured open name arguments')

    const mixedReasoningPrefix = THINK_BEGIN
    const mixedReasoningMessage = template.parse({
        tokens: [
            { delta: { content: mixedReasoningPrefix } },
            { delta: { reasoning: 'continued reasoning' } },
        ],
    })
    assertEqual(mixedReasoningMessage.reasoning, 'continued reasoning', 'mixed reasoning prefix')
    assertEqual(mixedReasoningMessage.content, undefined, 'mixed reasoning prefix content')
    assertEqual(
        template.apply(mixedReasoningMessage).templatedPrompt,
        `${THINK_BEGIN}continued reasoning`,
        'mixed reasoning prefix round-trip',
    )

    const mixedReasoningWithClosingMarker = template.parse({
        tokens: [
            { delta: { content: mixedReasoningPrefix } },
            { delta: { reasoning: 'continued reasoning' } },
            { delta: { content: `${THINK_END}answer` } },
        ],
    })
    assertEqual(mixedReasoningWithClosingMarker.reasoning, 'continued reasoning', 'mixed reasoning closing marker')
    assertEqual(mixedReasoningWithClosingMarker.content, 'answer', 'mixed reasoning closing content')
    assertEqual(
        template.apply(mixedReasoningWithClosingMarker).templatedPrompt,
        `${THINK_BEGIN}continued reasoning${THINK_END}answer`,
        'mixed reasoning closing marker round-trip',
    )

    const structuredToolContinuation = template.parse({
        tokens: [
            { delta: { role: 'assistant', content: '' } },
            { delta: { reasoning: 'thinking' } },
            { delta: { content: 'I will check.' } },
            { delta: { tool_calls: [{
                id: 'functions.get_weather:0',
                type: 'function',
                index: 0,
                function: { name: 'get_weather', arguments: '{"location": "' },
            }] } },
            { delta: { content: `New York${ARG_VALUE_END}${TOOL_CALL_END}`, tool_calls: [] } },
            { delta: {}, finish_reason: 'stop' },
        ],
        tools,
    })
    assertEqual(
        structuredToolContinuation.content,
        'I will check.',
        'structured tool continuation content',
    )
    assertEqual(
        structuredToolContinuation.tool_calls[0].function.arguments,
        '{"location": "New York"}',
        'structured tool continuation arguments',
    )
    assertEqual(structuredToolContinuation.finish_reason, 'tool_calls', 'structured tool continuation finish reason')

    const structuredOpenToolCalls = template.parse({
        tokens: [
            { delta: { role: 'assistant', content: '' } },
            { delta: { tool_calls: [{}] } },
        ],
    })
    assertEqual(
        JSON.stringify(structuredOpenToolCalls.tool_calls),
        JSON.stringify([{}]),
        'structured open tool calls placeholder',
    )
    assertEqual(
        template.apply(structuredOpenToolCalls).templatedPrompt,
        `${THINK_END}${TOOL_CALL_BEGIN}`,
        'structured open tool calls round-trip',
    )

    const structuredContentToolCalls = template.parse({
        tokens: [
            { delta: {
                role: 'assistant',
                content: `${THINK_END}I will check.` +
                    `${TOOL_CALL_BEGIN}get_weather${ARG_KEY_BEGIN}location${ARG_KEY_END}` +
                    `${ARG_VALUE_BEGIN}New York${ARG_VALUE_END}${TOOL_CALL_END}`,
            } },
            { delta: { tool_calls: [{
                id: 'functions.get_weather:0',
                type: 'function',
                index: 0,
                function: { name: 'get_weather' },
            }] } },
        ],
        tools,
    })
    assertEqual(structuredContentToolCalls.content, 'I will check.', 'structured content tool calls content')
    assertEqual(
        structuredContentToolCalls.tool_calls[0].function.arguments,
        '{"location": "New York"}',
        'structured content tool calls arguments',
    )
    assertEqual(
        template.apply(structuredContentToolCalls).templatedPrompt,
        `${THINK_END}I will check.${TOOL_CALL_BEGIN}get_weather` +
            `${ARG_KEY_BEGIN}location${ARG_KEY_END}${ARG_VALUE_BEGIN}New York${ARG_VALUE_END}${TOOL_CALL_END}`,
        'structured content tool calls round-trip',
    )

    const structuredToolCallsBeforeContent = template.parse({
        tokens: [
            { delta: {
                tool_calls: [{
                    id: 'functions.get_weather:0',
                    type: 'function',
                    index: 0,
                    function: { name: 'get_weather' },
                }],
                content: `${THINK_END}I will check.` +
                    `${TOOL_CALL_BEGIN}get_weather${ARG_KEY_BEGIN}location${ARG_KEY_END}` +
                    `${ARG_VALUE_BEGIN}New York${ARG_VALUE_END}${TOOL_CALL_END}`,
            } },
        ],
        tools,
    })
    assertEqual(
        structuredToolCallsBeforeContent.content,
        'I will check.',
        'structured tool calls before content',
    )
    assertEqual(
        structuredToolCallsBeforeContent.tool_calls[0].function.arguments,
        '{"location": "New York"}',
        'structured tool calls before content arguments',
    )

    const structuredSuffixBeforeToolCalls = template.parse({
        tokens: [
            { delta: { role: 'assistant', content: '' } },
            { delta: {
                content: `New York${ARG_VALUE_END}${TOOL_CALL_END}`,
                tool_calls: [{
                    id: 'functions.get_weather:0',
                    type: 'function',
                    index: 0,
                    function: { name: 'get_weather', arguments: '{"location": "' },
                }],
            } },
        ],
        tools,
    })
    assertEqual(
        structuredSuffixBeforeToolCalls.tool_calls[0].function.arguments,
        '{"location": "New York"}',
        'structured suffix before tool calls arguments',
    )

    const resumedAfterReasoningEnd = template.parse({
        tokens: [
            { delta: { content: `${THINK_BEGIN}old${THINK_END}answer` }, finish_reason: REASONING_END },
            { delta: { reasoning: '' } },
            { delta: { reasoning: 'continued' } },
            { delta: { reasoning: ' more' } },
        ],
    })
    assertEqual(resumedAfterReasoningEnd.reasoning, 'old', 'resume after reasoning end')
    assertEqual(resumedAfterReasoningEnd.content, 'answercontinued more', 'resume content after reasoning end')
    assertEqual(
        template.apply(resumedAfterReasoningEnd).templatedPrompt,
        `${THINK_BEGIN}old${THINK_END}answercontinued more`,
        'resume content after reasoning end round-trip',
    )
    assertEqual(resumedAfterReasoningEnd.finish_reason, undefined, 'resume clears reasoning end')

    const resumedWithoutReasoning = template.parse({
        tokens: [
            { delta: { content: THINK_END }, finish_reason: REASONING_END },
            { delta: { reasoning: '' } },
            { delta: { reasoning: 'continued' } },
            { delta: { reasoning: ' more' } },
        ],
    })
    assertEqual(resumedWithoutReasoning.reasoning, undefined, 'resume without reasoning')
    assertEqual(resumedWithoutReasoning.content, 'continued more', 'resume without reasoning content')

    const toolContinuationPrefix = template.apply({
        role: 'assistant',
        reasoning: 'old',
        content: 'Sure!',
        tool_calls: [{
            index: 0,
            type: 'function',
            function: { name: 'get_weather', arguments: '{"location": "San' },
        }],
    }).templatedPrompt
    const resumedToolCall = template.parse({
        tokens: [
            { delta: { content: toolContinuationPrefix }, finish_reason: REASONING_END },
            { delta: { reasoning: '' } },
            { delta: { reasoning: ' Francisco' } },
            { delta: { reasoning: `${ARG_VALUE_END}${TOOL_CALL_END}` } },
            { delta: {}, finish_reason: 'tool_calls' },
        ],
        tools,
    })
    assertEqual(resumedToolCall.reasoning, 'old', 'resume tool call reasoning')
    assertEqual(resumedToolCall.content, 'Sure!', 'resume tool call content')
    assertEqual(
        resumedToolCall.tool_calls[0].function.arguments,
        '{"location": "San Francisco"}',
        'resume tool call arguments',
    )
    assertEqual(
        template.apply(resumedToolCall).templatedPrompt,
        toolContinuationPrefix + ` Francisco${ARG_VALUE_END}${TOOL_CALL_END}`,
        'resume tool call round-trip',
    )

    const emptyStructuredToolCallsMessage = template.parse({
        tokens: [
            { delta: { role: 'assistant', content: '' } },
            { delta: { reasoning: 'no tool is needed' } },
            { delta: { content: 'Done.', tool_calls: [] } },
        ],
    })
    assertEqual(emptyStructuredToolCallsMessage.tool_calls, undefined, 'empty structured tool calls')
    assertEqual(
        template.apply(emptyStructuredToolCallsMessage).templatedPrompt,
        `${THINK_BEGIN}no tool is needed${THINK_END}Done.`,
        'empty structured tool calls prompt',
    )

    const openToolCallWithStop = template.parse({
        tokens: [{ delta: { content: `${THINK_END}${TOOL_CALL_BEGIN}` }, finish_reason: 'stop' }],
    })
    assertEqual(openToolCallWithStop.finish_reason, 'stop', 'open tool call stop reason')

    for (const name of ['GLM-5', 'GLM-5.1', 'GLM-5.2-FP8', 'GLM-5.3-Flash', 'GLM-5.4']) {
        assertEqual(GLM5ResponseTemplate.match({
            responseTemplateConfig: { name_or_path: `zai-org/${name}` },
        }), true, `${name} match`)
    }
    assertEqual(GLM5ResponseTemplate.match({
        responseTemplateConfig: { name_or_path: 'zai-org/GLM-5.5' },
    }), false, 'GLM-5.5 mismatch')
    assertEqual(GLM5ResponseTemplate.match({
        responseTemplateConfig: { name_or_path: 'glm5p2-b300-dp8-1m-self' },
    }), false, 'internal checkpoint mismatch')
    return partialMessageTestCount + partialArgumentsCases.length + 23
}
