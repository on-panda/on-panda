import { tokenToDisplayString } from '../chatUtils.js'
import { deepCopy } from '../commonUtils.js'
import { parsePartialJsonObject } from '../partialJsonUtils.js'
import { normalizeMessageToolCalls } from './responseTemplateUtils.js'
import { testPartialResponseTemplateRoundTrips } from './responseTemplateTestUtils.js'

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
        if (value === 'True' || value === 'true') {
            return 'true'
        }
        if (value === 'False' || value === 'false') {
            return 'false'
        }
        return stringValue
    }
    if (schemaType === 'null') {
        return value === 'None' || value === 'null' ? 'null' : stringValue
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
            // The parameter name is still open, so the JSON key quote stays open too.
            return JSON.stringify(parameter.name).slice(0, -1)
        }
        // An unclosed value may still grow, so its type is only known from the schema once closed.
        const valueText = parameter.complete
            ? parameterValueToJsonText({ value: parameter.value, schema: properties[parameter.name] })
            : JSON.stringify(parameter.value).slice(0, -1)
        return `${JSON.stringify(parameter.name)}: ${valueText}`
    })
    if (functionClosed) {
        return `{${argumentParts.join(', ')}}`
    }
    // An open function keeps the separator after a closed value, otherwise a trailing number would read as still growing.
    return `{${argumentParts.join(', ')}${parameters[parameters.length - 1].complete ? ', ' : ''}`
}

function parseXmlParameters({ rawArguments, functionClosed, parametersSchema } = {}) {
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
            parameters.push({ name: rawArguments.slice(nameStart), nameComplete: false })
            break
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
            nameComplete: true,
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
    return buildArgumentsPrefix({ parameters, functionClosed, parametersSchema })
}

function buildToolCall({ name, argumentsText, index } = {}) {
    const toolCall = {
        type: 'function',
        index,
        function: { name },
    }
    if (argumentsText !== undefined) {
        // A missing arguments key means the arguments channel has not started: the function name is still open.
        toolCall.function.arguments = argumentsText
    }
    return toolCall
}

function parseToolCalls(toolCallsText, tools = []) {
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
        const nextToolCallBegin = toolCallsText.indexOf(TOOL_CALL_BEGIN, toolCallBegin + TOOL_CALL_BEGIN.length)
        if (
            functionBegin === -1 ||
            (nextToolCallBegin !== -1 && nextToolCallBegin < functionBegin)
        ) {
            toolCalls.push({})
            if (nextToolCallBegin === -1) {
                break
            }
            cursor = nextToolCallBegin
            continue
        }
        const nameStart = functionBegin + FUNCTION_BEGIN.length
        const nameEnd = toolCallsText.indexOf('>', nameStart)
        if (nameEnd === -1) {
            toolCalls.push(buildToolCall({
                name: toolCallsText.slice(nameStart),
                index: toolCalls.length,
            }))
            break
        }

        const functionName = toolCallsText.slice(nameStart, nameEnd)
        const tool = tools.find(tool => tool.function.name === functionName)
        const functionEnd = toolCallsText.indexOf(FUNCTION_END, nameEnd + 1)
        const nextToolCallBeginAfterName = toolCallsText.indexOf(TOOL_CALL_BEGIN, nameEnd + 1)
        const functionClosed = functionEnd !== -1 && (
            nextToolCallBeginAfterName === -1 || functionEnd < nextToolCallBeginAfterName
        )
        const rawArgumentsEnd = functionClosed
            ? functionEnd
            : nextToolCallBeginAfterName === -1 ? toolCallsText.length : nextToolCallBeginAfterName
        const rawArguments = toolCallsText.slice(nameEnd + 1, rawArgumentsEnd)
        const parsedArguments = parseXmlParameters({
            rawArguments,
            functionClosed,
            parametersSchema: tool ? tool.function.parameters : null,
        })
        var argumentsText = parsedArguments
        if (argumentsText === null) {
            argumentsText = rawArguments.startsWith('\n') ? rawArguments.slice(1) : rawArguments
            if (functionClosed && argumentsText.endsWith('\n')) {
                argumentsText = argumentsText.slice(0, -1)
            }
        }
        toolCalls.push(buildToolCall({
            name: functionName,
            argumentsText,
            index: toolCalls.length,
        }))

        if (nextToolCallBeginAfterName !== -1 && (!functionClosed || nextToolCallBeginAfterName < functionEnd)) {
            cursor = nextToolCallBeginAfterName
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

function parseQwenResponseText(text, tools = [], reasoningContentSeparator = '\n\n') {
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
            if (remainingText.startsWith(reasoningContentSeparator)) {
                remainingText = remainingText.slice(reasoningContentSeparator.length)
            }
            reasoningClosed = true
        }
    }

    const toolCallBegin = remainingText.indexOf(TOOL_CALL_BEGIN)
    if (toolCallBegin === -1) {
        message.content = remainingText
    } else {
        const toolCalls = parseToolCalls(remainingText.slice(toolCallBegin), tools)
        message.content = remainingText.slice(0, toolCallBegin).replace(/\n+$/, '')
        message.tool_calls = toolCalls.length ? toolCalls : [{}]
    }

    if (hasImEnd) {
        const hasToolCall = message.tool_calls?.length &&
            !(message.tool_calls.length === 1 && !Object.keys(message.tool_calls[0]).length)
        message.finish_reason = hasToolCall
            ? 'tool_calls'
            : 'stop'
    } else if (reasoningClosed && !message.content && !('tool_calls' in message)) {
        message.finish_reason = REASONING_END
    }
    if (hasAssistantBegin && !message.content && !message.reasoning && !('tool_calls' in message)) {
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

function isOpenToolCall(toolCall = {}) {
    return !toolCall.type && !toolCall.id && !toolCall.function
}

function hasOpenToolCallText(text = '') {
    return text.lastIndexOf(TOOL_CALL_BEGIN) > text.lastIndexOf(TOOL_CALL_END)
}

function hasTextToolCallBoundary(tokens = []) {
    var text = ''
    for (const token of tokens.filter(token => !token.pruned)) {
        const delta = token.delta || {}
        const deltaText = [delta.content, delta.reasoning]
            .filter(text => typeof text === 'string')
            .join('')
        const logprobsText = (token.logprobs?.content || [])
            .map(logprob => logprob.token || '')
            .join('')
        text += deltaText
        const hasAdditionalMarker = (
            logprobsText.includes(TOOL_CALL_BEGIN) && !deltaText.includes(TOOL_CALL_BEGIN)
        ) || (
            logprobsText.includes(TOOL_CALL_END) && !deltaText.includes(TOOL_CALL_END)
        )
        if (!deltaText || hasAdditionalMarker) {
            text += logprobsText
        }
        if (delta.tool_calls?.length) {
            break
        }
    }
    const firstToolCallEnd = text.indexOf(TOOL_CALL_END)
    return firstToolCallEnd !== -1 &&
        text.indexOf(TOOL_CALL_BEGIN, firstToolCallEnd + TOOL_CALL_END.length) !== -1
}

// Some providers restart structured tool-call indexes after text-form calls.
function mergeTextAndStructuredToolCalls({
    textToolCalls = [],
    structuredToolCalls = [],
    text = '',
    structuredToolCallsFollowText = false,
} = {}) {
    const toolCalls = textToolCalls.map(toolCall => deepCopy(toolCall))
    if (!structuredToolCalls.length) {
        return toolCalls
    }

    const lastToolCall = toolCalls.at(-1)
    const hasOpenTextSlot = hasOpenToolCallText(text) ||
        lastToolCall && isOpenToolCall(lastToolCall)
    const firstStructuredIndex = structuredToolCallsFollowText
        ? hasOpenTextSlot ? Math.max(0, toolCalls.length - 1) : toolCalls.length
        : hasOpenTextSlot ? Math.max(0, toolCalls.length - 1) : null
    const remappedToolCalls = structuredToolCalls.map((toolCall, position) => ({
        ...deepCopy(toolCall),
        index: firstStructuredIndex === null ? toolCall.index : firstStructuredIndex + position,
    }))
    const mergedToolCalls = mergeToolCalls(toolCalls, remappedToolCalls)
    for (const toolCall of remappedToolCalls) {
        if (toolCall.id && mergedToolCalls[toolCall.index]) {
            mergedToolCalls[toolCall.index].id = toolCall.id
        }
    }
    return mergedToolCalls
}

function parseStructuredTokens({
    tokens = [],
    tools = [],
    reasoningContentSeparator = '\n\n',
    structuredToolCallsFollowText = false,
} = {}) {
    var role = null
    var finishReason
    var reasoningContinuationIsContent = false
    var parsedTextToolCalls
    var parsedTextContent
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
            if (key === 'tool_calls' && !delta2.tool_calls?.length) {
                continue
            }
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
            if (key === 'reasoning' && !reasoningContinuationIsContent && !delta1.reasoning?.length &&
                (delta1.content?.length || delta1.tool_calls?.length)) {
                if (delta1.content?.length) {
                    const structuredContent = delta.content
                    const parsedPrefix = parseQwenResponseText(structuredContent, tools, reasoningContentSeparator)
                    reasoningContinuationIsContent =
                        parsedPrefix.finish_reason === REASONING_END ||
                        structuredContent.includes(THINK_END) ||
                        parsedPrefix.tool_calls?.length > 0 ||
                        !parsedPrefix.reasoning
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
                            parsedTextToolCalls = parsedPrefix.tool_calls
                            parsedTextContent = structuredContent
                        }
                    }
                } else {
                    reasoningContinuationIsContent = true
                }
            }
            if (key === 'reasoning' && reasoningContinuationIsContent) {
                delta.content = (delta.content || '') + (delta2.reasoning || '')
                continue
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
    if (parsedTextToolCalls) {
        message.tool_calls = mergeTextAndStructuredToolCalls({
            textToolCalls: parsedTextToolCalls,
            structuredToolCalls: message.tool_calls || [],
            text: parsedTextContent,
            structuredToolCallsFollowText,
        })
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

function normalizePlainTextInStructuredMessage({
    message,
    tools = [],
    reasoningContentSeparator = '\n\n',
    structuredToolCallsFollowText = false,
} = {}) {
    if (typeof message.content !== 'string') {
        return message
    }
    const hasTemplateText = message.content.includes(THINK_BEGIN) ||
        message.content.includes(TOOL_CALL_BEGIN) ||
        message.content.includes(ASSISTANT_BEGIN)
    if (!hasTemplateText) {
        return message
    }

    const structuredContent = message.content
    const parsedTextMessage = parseQwenResponseText(structuredContent, tools, reasoningContentSeparator)
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
        const structuredToolCalls = message.tool_calls || []
        message.tool_calls = mergeTextAndStructuredToolCalls({
            textToolCalls: parsedTextMessage.tool_calls,
            structuredToolCalls,
            text: structuredContent,
            structuredToolCallsFollowText,
        })
    }
    if (message.finish_reason === 'stop' && message.tool_calls?.length) {
        message.finish_reason = 'tool_calls'
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
        this.reasoningContentSeparator = '\n\n'
        this.contentToolCallsSeparator = '\n\n'
        this.toolCallSeparator = '\n'
    }

    apply(message = {}) {
        const isPartial = !['stop', 'tool_calls'].includes(message.finish_reason)
        const reasoning = message.reasoning ? stripRepeatedThinkBegin(message.reasoning) : ''
        const hasToolCallsChannel = message.tool_calls != null
        const hasResponseBody = reasoning || message.content || hasToolCallsChannel
        const isPureReasoningPartial = isPartial &&
            message.finish_reason !== REASONING_END &&
            !message.content &&
            !hasToolCallsChannel
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
                if (message.content || hasToolCallsChannel) {
                    appendRawText(this.reasoningContentSeparator)
                }
            }
        }
        appendMappedText(['content'], message.content)

        if (hasToolCallsChannel) {
            if (message.content) {
                appendRawText(this.contentToolCallsSeparator)
            }
            if (!message.tool_calls.length) {
                appendRawText(TOOL_CALL_BEGIN)
            }
            for (const [toolCallPosition, toolCall] of message.tool_calls.entries()) {
                if (toolCallPosition) {
                    appendRawText(this.toolCallSeparator)
                }
                if (isOpenToolCall(toolCall)) {
                    appendRawText(TOOL_CALL_BEGIN)
                    continue
                }
                const toolCallFunction = toolCall.function || {}
                appendRawText(`${TOOL_CALL_BEGIN}\n${FUNCTION_BEGIN}${toolCallFunction.name || ''}`)
                if (toolCallFunction.arguments === undefined) {
                    continue
                }
                appendRawText('>\n')
                const parsedArguments = parsePartialJsonObject(toolCallFunction.arguments)
                const isLastPartialToolCall = isPartial && toolCallPosition === message.tool_calls.length - 1
                if (parsedArguments) {
                    for (const parameter of parsedArguments.entries) {
                        appendRawText(`${PARAMETER_BEGIN}${parameter.name}`)
                        if (!parameter.nameComplete) {
                            break
                        }
                        appendRawText('>\n')
                        if (parameter.value === undefined) {
                            break
                        }
                        appendMappedText(
                            ['tool_calls', toolCallPosition, 'function', 'arguments'],
                            parameter.complete ? argumentValueToText(parameter.value) : parameter.value,
                        )
                        if (parameter.complete) {
                            appendRawText(`\n${PARAMETER_END}\n`)
                        }
                    }
                } else {
                    appendMappedText(
                        ['tool_calls', toolCallPosition, 'function', 'arguments'],
                        toolCallFunction.arguments,
                    )
                }

                const functionComplete = !isLastPartialToolCall || parsedArguments?.complete
                if (functionComplete) {
                    if (!parsedArguments && toolCallFunction.arguments) {
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

    parse({ tokens = [], messages = [], tools = [] } = {}) {
        if (typeof tokens !== 'string' && !tokens.some(token => !token.pruned)) {
            return {}
        }
        if (typeof tokens !== 'string' && hasStructuredDelta(tokens)) {
            const structuredToolCallsFollowText = hasTextToolCallBoundary(tokens)
            return normalizeMessageToolCalls({
                message: normalizePlainTextInStructuredMessage(
                    {
                        message: parseStructuredTokens({
                            tokens,
                            tools,
                            reasoningContentSeparator: this.reasoningContentSeparator,
                            structuredToolCallsFollowText,
                        }),
                        tools,
                        reasoningContentSeparator: this.reasoningContentSeparator,
                        structuredToolCallsFollowText,
                    },
                ),
                messages,
            })
        }
        const responseText = tokensToResponseText(tokens)
        if (!responseText) {
            return {}
        }
        const message = parseQwenResponseText(responseText, tools, this.reasoningContentSeparator)
        if (typeof tokens !== 'string') {
            const finishReasonToken = tokens.filter(token => !token.pruned && token.finish_reason).at(-1)
            if (finishReasonToken) {
                message.finish_reason = finishReasonToken.finish_reason
                if (message.finish_reason === 'stop' && message.tool_calls?.length) {
                    message.finish_reason = 'tool_calls'
                }
            }
        }
        return normalizeMessageToolCalls({ message, messages })
    }
}

export function testQwen3p5ResponseTemplate() {
    const template = new Qwen3p5ResponseTemplate()
    const partialMessageTestCount = testPartialResponseTemplateRoundTrips({ template })
    const tools = [{
        type: 'function',
        function: {
            name: 'read_file',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string' },
                    text: { type: 'string' },
                    limit: { type: 'integer' },
                    flag: { type: 'boolean' },
                    list: { type: 'array' },
                    obj: { type: 'object' },
                },
            },
        },
    }]
    const assertEqual = (actual, expected, label) => {
        if (actual !== expected) {
            throw new Error(`${label}\n  actual  : ${JSON.stringify(actual)}\n  expected: ${JSON.stringify(expected)}`)
        }
    }

    // [partial arguments, parameters text following the function name, arguments parsed back from the templated prompt]
    // An unclosed value stays a JSON string prefix, because only the schema of a closed value tells its real type.
    const partialArgumentsCases = [
        ['', '', ''],
        ['{', '', ''],
        ['{"', `${PARAMETER_BEGIN}`, '{"'],
        ['{"pa', `${PARAMETER_BEGIN}pa`, '{"pa'],
        ['{"path"', `${PARAMETER_BEGIN}path>\n`, '{"path": "'],
        ['{"path":', `${PARAMETER_BEGIN}path>\n`, '{"path": "'],
        ['{"path": "', `${PARAMETER_BEGIN}path>\n`, '{"path": "'],
        ['{"path": "/tm', `${PARAMETER_BEGIN}path>\n/tm`, '{"path": "/tm'],
        ['{"path": "/tmp"', `${PARAMETER_BEGIN}path>\n/tmp\n${PARAMETER_END}\n`, '{"path": "/tmp", '],
        ['{"path": "/tmp",', `${PARAMETER_BEGIN}path>\n/tmp\n${PARAMETER_END}\n`, '{"path": "/tmp", '],
        [
            '{"path": "/tmp", "',
            `${PARAMETER_BEGIN}path>\n/tmp\n${PARAMETER_END}\n${PARAMETER_BEGIN}`,
            '{"path": "/tmp", "',
        ],
        [
            '{"path": "/tmp", "limit": 1',
            `${PARAMETER_BEGIN}path>\n/tmp\n${PARAMETER_END}\n${PARAMETER_BEGIN}limit>\n1`,
            '{"path": "/tmp", "limit": "1',
        ],
        // A trailing number may still grow, so it stays unclosed while true, false and null cannot grow.
        ['{"limit": 10', `${PARAMETER_BEGIN}limit>\n10`, '{"limit": "10'],
        ['{"flag": tr', `${PARAMETER_BEGIN}flag>\ntr`, '{"flag": "tr'],
        ['{"flag": true', `${PARAMETER_BEGIN}flag>\nTrue\n${PARAMETER_END}\n`, '{"flag": true, '],
        ['{"list": [1, 2', `${PARAMETER_BEGIN}list>\n[1, 2`, '{"list": "[1, 2'],
        ['{"list": [1, 2]', `${PARAMETER_BEGIN}list>\n[1, 2]\n${PARAMETER_END}\n`, '{"list": [1, 2], '],
        ['{"obj": {"a"', `${PARAMETER_BEGIN}obj>\n{"a"`, '{"obj": "{\\"a\\"'],
        ['{"obj": {"a": 1}', `${PARAMETER_BEGIN}obj>\n{"a": 1}\n${PARAMETER_END}\n`, '{"obj": {"a": 1}, '],
        ['{"text": "say \\"hi', `${PARAMETER_BEGIN}text>\nsay "hi`, '{"text": "say \\"hi'],
        ['{"text": "line1\\n', `${PARAMETER_BEGIN}text>\nline1\n`, '{"text": "line1\\n'],
        ['{"text": "a\\\\', `${PARAMETER_BEGIN}text>\na\\`, '{"text": "a\\\\'],
        ['{"limit": 10}', `${PARAMETER_BEGIN}limit>\n10\n${PARAMETER_END}\n${FUNCTION_END}`, '{"limit": 10}'],
        ['{}', FUNCTION_END, '{}'],
        // Arguments that are not a JSON object prefix stay verbatim in the function body.
        ['{"text": "raw\nnewline', '{"text": "raw\nnewline', '{"text": "raw\nnewline'],
        ['oops', 'oops', 'oops'],
    ]
    const toolCallPrefix = `${TOOL_CALL_BEGIN}\n${FUNCTION_BEGIN}read_file>\n`
    for (const [argumentsText, parametersText, parsedArgumentsText] of partialArgumentsCases) {
        const message = {
            role: 'assistant',
            tool_calls: [{ index: 0, type: 'function', function: { name: 'read_file', arguments: argumentsText } }],
        }
        const templatedPrompt = template.apply(message).templatedPrompt
        const caseLabel = `partial arguments ${JSON.stringify(argumentsText)}`
        assertEqual(templatedPrompt, toolCallPrefix + parametersText, `apply ${caseLabel}`)
        const parsedMessage = template.parse({ tokens: templatedPrompt, tools })
        assertEqual(parsedMessage.tool_calls[0].function.arguments, parsedArgumentsText, `parse ${caseLabel}`)
        assertEqual(template.apply(parsedMessage).templatedPrompt, templatedPrompt, `re-apply ${caseLabel}`)
    }

    // An unterminated function name means the arguments channel has not started yet.
    const openNameText = `${TOOL_CALL_BEGIN}\n${FUNCTION_BEGIN}read_fi`
    const openNameMessage = template.parse({ tokens: openNameText, tools })
    assertEqual(openNameMessage.tool_calls[0].function.name, 'read_fi', 'open function name')
    assertEqual(openNameMessage.tool_calls[0].function.arguments, undefined, 'open function name arguments')
    assertEqual(template.apply(openNameMessage).templatedPrompt, openNameText, 're-apply open function name')

    const emptyToolCallsMessage = { role: 'assistant', content: '', tool_calls: [] }
    assertEqual(template.apply(emptyToolCallsMessage).templatedPrompt, TOOL_CALL_BEGIN, 'open tool calls channel')
    const parsedEmptyToolCalls = template.parse({ tokens: TOOL_CALL_BEGIN })
    assertEqual(parsedEmptyToolCalls.tool_calls.length, 1, 'parse open tool calls channel')
    assertEqual(Object.keys(parsedEmptyToolCalls.tool_calls[0]).length, 0, 'empty open tool call')
    assertEqual(template.apply(parsedEmptyToolCalls).templatedPrompt, TOOL_CALL_BEGIN, 're-apply open tool calls channel')

    const reasoningOpenToolCallsText = `${THINK_BEGIN}\nthinking\n${THINK_END}\n\n${TOOL_CALL_BEGIN}`
    const parsedReasoningOpenToolCalls = template.parse({ tokens: reasoningOpenToolCallsText })
    assertEqual(parsedReasoningOpenToolCalls.finish_reason, undefined, 'open tool calls finish reason')
    assertEqual(
        template.apply(parsedReasoningOpenToolCalls).templatedPrompt,
        reasoningOpenToolCallsText,
        're-apply reasoning and open tool calls',
    )

    const openToolCallText = `${TOOL_CALL_BEGIN}\n${FUNCTION_BEGIN}`
    const openToolCallMessage = { role: 'assistant', content: '', tool_calls: [{ index: 0, type: 'function' }] }
    assertEqual(template.apply(openToolCallMessage).templatedPrompt, openToolCallText, 'open tool call')
    assertEqual(
        template.apply(template.parse({ tokens: openToolCallText })).templatedPrompt,
        openToolCallText,
        're-apply open tool call',
    )

    const completeText = `${THINK_BEGIN}\nthinking\n${THINK_END}\n\nSome content\n\n` +
        `${TOOL_CALL_BEGIN}\n${FUNCTION_BEGIN}read_file>\n${PARAMETER_BEGIN}path>\n/tmp/a.txt\n${PARAMETER_END}\n` +
        `${PARAMETER_BEGIN}limit>\n10\n${PARAMETER_END}\n${FUNCTION_END}\n${TOOL_CALL_END}`
    const completeMessage = template.parse({
        tokens: [{ delta: { content: completeText }, finish_reason: 'tool_calls' }],
        tools,
    })
    assertEqual(
        completeMessage.tool_calls[0].function.arguments,
        '{"path": "/tmp/a.txt", "limit": 10}',
        'complete arguments',
    )
    assertEqual(template.apply(completeMessage).templatedPrompt, completeText, 're-apply complete response')

    const resumedAfterReasoningEnd = template.parse({
        tokens: [
            { delta: { content: `${THINK_BEGIN}\nold\n${THINK_END}\n\nanswer` } },
            { delta: { reasoning: '' } },
            { delta: { reasoning: 'continued' } },
            { delta: { reasoning: ' more' } },
        ],
    })
    assertEqual(resumedAfterReasoningEnd.reasoning, 'old', 'resume reasoning continuation reasoning')
    assertEqual(resumedAfterReasoningEnd.content, 'answercontinued more', 'resume reasoning continuation content')
    assertEqual(
        template.apply(resumedAfterReasoningEnd).templatedPrompt,
        `${THINK_BEGIN}\nold\n${THINK_END}\n\nanswercontinued more`,
        'resume reasoning continuation round-trip',
    )

    const completeToolText = `${TOOL_CALL_BEGIN}\n${FUNCTION_BEGIN}read_file>\n` +
        `${PARAMETER_BEGIN}path>\n/tmp/a.txt\n${PARAMETER_END}\n${FUNCTION_END}\n${TOOL_CALL_END}`
    const parsedTrailingToolCall = template.parse({
        tokens: `${completeToolText}\n${TOOL_CALL_BEGIN}`,
        tools,
    })
    assertEqual(parsedTrailingToolCall.tool_calls.length, 2, 'trailing open tool call')
    assertEqual(
        parsedTrailingToolCall.tool_calls[0].function.arguments,
        '{"path": "/tmp/a.txt"}',
        'trailing open tool call first arguments',
    )
    assertEqual(parsedTrailingToolCall.tool_calls[1].function, undefined, 'trailing open tool call placeholder')
    assertEqual(
        template.apply(parsedTrailingToolCall).templatedPrompt,
        `${completeToolText}\n${TOOL_CALL_BEGIN}`,
        're-apply trailing open tool call',
    )

    const secondToolArguments = '{"path": "/tmp/b.txt"}'
    const mixedToolTokens = [
        { delta: { role: 'assistant', content: '' } },
        { delta: { content: `${completeToolText}\n`, tool_calls: [] } },
        // Together can emit the next XML marker only in logprobs before switching to tool_calls.
        { delta: { content: '' }, logprobs: { content: [{ token: TOOL_CALL_BEGIN }] } },
        { delta: { content: '\n' } },
        { delta: { tool_calls: [{
            id: 'together-tool-1',
            type: 'function',
            index: 0,
            function: { name: 'read_file' },
        }] } },
        { delta: { tool_calls: [{ index: 0, function: { arguments: secondToolArguments } }] } },
        { delta: {}, finish_reason: 'tool_calls' },
    ]
    const mixedToolMessage = template.parse({ tokens: mixedToolTokens, tools })
    assertEqual(mixedToolMessage.tool_calls.length, 2, 'mixed tool call count')
    assertEqual(
        mixedToolMessage.tool_calls[0].function.arguments,
        '{"path": "/tmp/a.txt"}',
        'mixed first tool arguments',
    )
    assertEqual(
        mixedToolMessage.tool_calls[1].function.arguments,
        secondToolArguments,
        'mixed second tool arguments',
    )
    assertEqual(mixedToolMessage.tool_calls[1].id, 'together-tool-1', 'mixed second tool id')
    JSON.parse(mixedToolMessage.tool_calls[0].function.arguments)
    JSON.parse(mixedToolMessage.tool_calls[1].function.arguments)
    assertEqual(
        template.apply(mixedToolMessage).templatedPrompt,
        `${completeToolText}\n${TOOL_CALL_BEGIN}\n${FUNCTION_BEGIN}read_file>\n` +
            `${PARAMETER_BEGIN}path>\n/tmp/b.txt\n${PARAMETER_END}\n${FUNCTION_END}\n${TOOL_CALL_END}`,
        're-apply mixed tool calls',
    )
    assertEqual(Qwen3p5ResponseTemplate.match({
        responseTemplateConfig: { name_or_path: 'Qwen/Qwen3.8-2.4T-A95B' },
    }), true, 'Qwen3.8 template match')
    return partialMessageTestCount + partialArgumentsCases.length + 9
}
