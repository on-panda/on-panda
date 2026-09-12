import { tokenToDisplayString } from '../chatUtils.js'
import { deepCopy } from '../commonUtils.js'
import { parsePartialJsonObject } from '../partialJsonUtils.js'
import { normalizeMessageToolCalls } from './responseTemplateUtils.js'
import { testPartialResponseTemplateRoundTrips } from './responseTemplateTestUtils.js'

const specialMarker = (name) => ['<｜', name, '｜>'].join('')
const xmlMarker = (name, closing = false) => ['<', closing ? '/' : '', name, '>'].join('')
const dsmlToken = ['｜', 'DSML', '｜'].join('')
const dsmlMarker = (name, closing = false) => ['<', closing ? '/' : '', dsmlToken, name, '>'].join('')
const dsmlTagPrefix = (name) => ['<', dsmlToken, name].join('')
const dsmlInvokePrefix = (name) => ['<', dsmlToken, name, ' name="'].join('')
const dsmlParameterPrefix = (name) => ['<', dsmlToken, name, ' name="'].join('')

const THINK_BEGIN = xmlMarker('think')
const THINK_END = xmlMarker('think', true)
const EOS = specialMarker('end▁of▁sentence')
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

function overlayToolCalls(parsedToolCalls = [], structuredToolCalls = []) {
    const toolCalls = mergeToolCalls(parsedToolCalls, structuredToolCalls)
    for (const [position, parsedToolCall] of parsedToolCalls.entries()) {
        const index = typeof parsedToolCall.index === 'number' ? parsedToolCall.index : position
        const parsedArguments = parsedToolCall.function?.arguments
        if (typeof parsedArguments === 'string' && toolCalls[index]?.function) {
            toolCalls[index].function.arguments = parsedArguments
        }
    }
    return toolCalls
}

function mergeTextAndStructuredToolCalls({
    textToolCalls = [], structuredToolCalls = [], text, template, structuredWithTemplateText = false,
} = {}) {
    if (!structuredToolCalls.length) {
        return textToolCalls
    }
    const invokePrefix = dsmlInvokePrefix(template.toolCallTagName)
    const invokeEnd = dsmlMarker(template.toolCallTagName, true)
    const hasCompleteTextCall = text.lastIndexOf(invokeEnd) > text.lastIndexOf(invokePrefix)
    const hasOpenTextCall = text.lastIndexOf(invokePrefix) > text.lastIndexOf(invokeEnd)
    const remappedToolCalls = structuredToolCalls.map((toolCall, position) => ({
        ...deepCopy(toolCall),
        index: !structuredWithTemplateText && hasCompleteTextCall && !hasOpenTextCall
            ? textToolCalls[position]?.function?.name === toolCall.function?.name &&
                (!toolCall.function?.arguments ||
                    toolCall.function.arguments === textToolCalls[position].function?.arguments)
                ? position
                : textToolCalls.length + position
            : typeof toolCall.index === 'number' ? toolCall.index : position,
    }))
    return overlayToolCalls(textToolCalls, remappedToolCalls)
}

function hasActualToolCalls(toolCalls = []) {
    return toolCalls.some(toolCall => toolCall?.function?.name)
}

function buildToolCall({ name, argumentsText, index } = {}) {
    const toolCall = {
        type: 'function',
        index,
        function: { name },
    }
    if (argumentsText !== undefined) {
        toolCall.function.arguments = argumentsText
    }
    return toolCall
}

function inferStringParameter({ argumentsText, parameter } = {}) {
    if (parameter.complete) {
        return typeof parameter.value === 'string'
    }
    if (parameter.value === undefined) {
        return true
    }
    const keyText = JSON.stringify(parameter.name)
    const keyStart = argumentsText.indexOf(keyText)
    if (keyStart === -1) {
        return true
    }
    const colon = argumentsText.indexOf(':', keyStart + keyText.length)
    if (colon === -1) {
        return true
    }
    const valueStart = argumentsText.slice(colon + 1).search(/\S/)
    return valueStart === -1 || argumentsText[colon + 1 + valueStart] === '"'
}

function parameterValueToText({ parameter, argumentsText } = {}) {
    const isString = inferStringParameter({ argumentsText, parameter })
    if (parameter.complete) {
        return {
            isString,
            value: isString ? String(parameter.value) : stringifyJsonForTemplate(parameter.value),
        }
    }
    const value = parameter.value ?? ''
    return {
        isString,
        value: String(value),
    }
}

function buildArgumentsPrefix({ parameters, functionClosed } = {}) {
    if (!parameters.length) {
        return functionClosed ? '{}' : ''
    }
    const parts = parameters.map(parameter => {
        if (!parameter.nameComplete) {
            return JSON.stringify(parameter.name).slice(0, -1)
        }
        if (!parameter.markerComplete || !parameter.valueStarted) {
            return JSON.stringify(parameter.name)
        }
        const value = parameter.string
            ? JSON.stringify(parameter.value ?? '').slice(1, -1)
            : String(parameter.value ?? '')
        const valueText = parameter.complete
            ? parameter.string ? JSON.stringify(parameter.value) : value
            : parameter.string ? JSON.stringify(parameter.value ?? '').slice(0, -1) : value
        return `${JSON.stringify(parameter.name)}: ${valueText}`
    })
    const allComplete = parameters.every(parameter =>
        parameter.nameComplete && parameter.markerComplete && parameter.valueStarted && parameter.complete
    )
    if (functionClosed && allComplete) {
        return `{${parts.join(', ')}}`
    }
    const lastParameter = parameters.at(-1)
    if (
        lastParameter.nameComplete && lastParameter.markerComplete &&
        lastParameter.valueStarted && lastParameter.complete
    ) {
        return `{${parts.join(', ')}, `
    }
    return `{${parts.join(', ')}`
}

function parseDsmlParameters({ rawArguments, parameterName, functionClosed } = {}) {
    const parameterBeginPrefix = dsmlParameterPrefix(parameterName)
    const parameterEndToken = dsmlMarker(parameterName, true)
    const parameters = []
    var cursor = 0
    while (cursor < rawArguments.length) {
        const parameterBegin = rawArguments.indexOf(parameterBeginPrefix, cursor)
        if (parameterBegin === -1) {
            if (rawArguments.slice(cursor).trim()) {
                return null
            }
            break
        }
        if (rawArguments.slice(cursor, parameterBegin).trim()) {
            return null
        }

        const nameStart = parameterBegin + parameterBeginPrefix.length
        const nameEnd = rawArguments.indexOf('"', nameStart)
        if (nameEnd === -1) {
            parameters.push({ name: rawArguments.slice(nameStart), nameComplete: false })
            break
        }
        const name = rawArguments.slice(nameStart, nameEnd)
        const markerEnd = rawArguments.indexOf('>', nameEnd)
        if (markerEnd === -1) {
            parameters.push({ name, nameComplete: true, markerComplete: false, valueStarted: false, complete: false })
            break
        }
        const markerText = rawArguments.slice(nameEnd + 1, markerEnd)
        const stringMatch = markerText.match(/^\s+string="(true|false)"$/)
        if (!stringMatch) {
            parameters.push({ name, nameComplete: true, markerComplete: false, valueStarted: false, complete: false })
            break
        }
        const string = stringMatch[1] === 'true'
        const valueStart = markerEnd + 1
        const nextParameterBegin = rawArguments.indexOf(parameterBeginPrefix, valueStart)
        const parameterClose = rawArguments.indexOf(parameterEndToken, valueStart)
        const hasParameterClose = parameterClose !== -1 && (
            nextParameterBegin === -1 || parameterClose < nextParameterBegin
        )
        const valueEnd = hasParameterClose
            ? parameterClose
            : nextParameterBegin === -1 ? rawArguments.length : nextParameterBegin
        const value = rawArguments.slice(valueStart, valueEnd)
        parameters.push({
            name,
            nameComplete: true,
            markerComplete: true,
            valueStarted: true,
            string,
            value,
            complete: hasParameterClose || nextParameterBegin !== -1 || functionClosed,
        })
        cursor = hasParameterClose ? parameterClose + parameterEndToken.length : valueEnd
    }
    if (!parameters.length && rawArguments.trim()) {
        return null
    }
    return buildArgumentsPrefix({ parameters, functionClosed })
}

function parseDsmlToolCalls(text, template) {
    const toolCalls = []
    const invokePrefix = dsmlInvokePrefix(template.toolCallTagName)
    const invokeEnd = dsmlMarker(template.toolCallTagName, true)
    const callsEnd = dsmlMarker(template.toolCallsBlockName, true)
    var cursor = 0
    while (cursor < text.length) {
        const invokeStart = text.indexOf(invokePrefix, cursor)
        if (invokeStart === -1) {
            break
        }
        const nameStart = invokeStart + invokePrefix.length
        const nameEnd = text.indexOf('"', nameStart)
        if (nameEnd === -1) {
            const name = text.slice(nameStart).replace(/\s+$/, '')
            toolCalls.push(name ? buildToolCall({ name, index: toolCalls.length }) : {})
            break
        }
        const name = text.slice(nameStart, nameEnd)
        if (text[nameEnd + 1] !== '>') {
            toolCalls.push(buildToolCall({ name, index: toolCalls.length }))
            break
        }
        const bodyStart = nameEnd + 2 + (text[nameEnd + 2] === '\n' ? 1 : 0)
        const nextInvoke = text.indexOf(invokePrefix, bodyStart)
        const invokeClose = text.indexOf(invokeEnd, bodyStart)
        const sectionClose = text.indexOf(callsEnd, bodyStart)
        const bodyEndCandidates = [nextInvoke, invokeClose, sectionClose, text.length]
            .filter(index => index !== -1)
        const bodyEnd = Math.min(...bodyEndCandidates)
        const functionClosed = invokeClose !== -1 && invokeClose === bodyEnd
        var rawArguments = text.slice(bodyStart, bodyEnd).replace(/^\n/, '')
        if (functionClosed) {
            rawArguments = rawArguments.replace(/\n$/, '')
        }
        var argumentsText = parseDsmlParameters({
            rawArguments,
            parameterName: template.parameterTagName,
            functionClosed,
        })
        if (argumentsText === null) {
            argumentsText = rawArguments
        }
        toolCalls.push(buildToolCall({ name, argumentsText, index: toolCalls.length }))
        if (nextInvoke !== -1 && nextInvoke === bodyEnd) {
            cursor = nextInvoke
        } else if (functionClosed) {
            cursor = invokeClose + invokeEnd.length
        } else {
            break
        }
    }
    return toolCalls
}

function parseDeepSeekResponseText(text, template) {
    if (!text) {
        return {}
    }
    var remainingText = text
    var hasEos = false
    if (remainingText.endsWith(`${EOS}\n`)) {
        remainingText = remainingText.slice(0, -1)
    }
    if (remainingText.endsWith(EOS)) {
        remainingText = remainingText.slice(0, -EOS.length)
        hasEos = true
    }
    const message = { role: 'assistant' }
    var reasoningClosed = false
    if (remainingText.startsWith(THINK_BEGIN)) {
        const reasoningStart = THINK_BEGIN.length
        const reasoningEnd = remainingText.indexOf(THINK_END, reasoningStart)
        const toolCallsStart = remainingText.indexOf(template.toolCallsBegin, reasoningStart)
        if (reasoningEnd === -1 && toolCallsStart === -1) {
            const reasoning = stripRepeatedThinkBegin(remainingText.slice(reasoningStart))
            if (reasoning) {
                message.reasoning = reasoning
            }
            return message
        }
        const end = reasoningEnd === -1 ? toolCallsStart : reasoningEnd
        const reasoning = stripRepeatedThinkBegin(remainingText.slice(reasoningStart, end)).replace(/\n+$/, '')
        if (reasoning) {
            message.reasoning = reasoning
        }
        remainingText = remainingText.slice(end + (reasoningEnd === -1 ? 0 : THINK_END.length))
        reasoningClosed = true
    } else if (remainingText.startsWith(THINK_END)) {
        remainingText = remainingText.slice(THINK_END.length)
        reasoningClosed = true
    } else {
        const implicitReasoningEnd = remainingText.indexOf(THINK_END)
        if (implicitReasoningEnd !== -1) {
            const reasoning = remainingText.slice(0, implicitReasoningEnd)
            if (reasoning) {
                message.reasoning = reasoning
            }
            remainingText = remainingText.slice(implicitReasoningEnd + THINK_END.length)
            reasoningClosed = true
        }
    }

    const toolCallsStart = remainingText.indexOf(template.toolCallsBegin)
    if (toolCallsStart === -1) {
        message.content = remainingText
    } else {
        message.content = remainingText.slice(0, toolCallsStart).replace(/\n+$/, '')
        const sectionContentStart = toolCallsStart + template.toolCallsBegin.length
        const sectionEnd = remainingText.indexOf(template.toolCallsEnd, sectionContentStart)
        const toolCallsText = remainingText.slice(
            sectionContentStart + (remainingText[sectionContentStart] === '\n' ? 1 : 0),
            sectionEnd === -1 ? remainingText.length : sectionEnd,
        )
        const toolCalls = parseDsmlToolCalls(toolCallsText, template)
        message.tool_calls = toolCalls.length ? toolCalls : [{}]
    }
    if (hasEos) {
        const hasToolCalls = hasActualToolCalls(message.tool_calls)
        message.finish_reason = hasToolCalls ? 'tool_calls' : 'stop'
    } else if (reasoningClosed && !message.content && !('tool_calls' in message)) {
        message.finish_reason = REASONING_END
    }
    return message
}

function tokensToResponseText(tokens = []) {
    if (typeof tokens === 'string') {
        return tokens
    }
    return tokens.filter(token => !token.pruned).map(token => tokenToDisplayString(token, tokens)).join('')
}

function hasStructuredDelta(tokens = []) {
    return tokens.some(token => token.delta?.role || token.delta?.reasoning || token.delta?.tool_calls?.length)
}

function hasToolProtocolMarker(text, template) {
    return [
        template.toolCallsBegin,
        template.toolCallsEnd,
        dsmlTagPrefix(template.toolCallTagName),
        dsmlTagPrefix(template.parameterTagName),
        dsmlMarker(template.toolCallTagName, true),
        dsmlMarker(template.parameterTagName, true),
    ].some(marker => text.includes(marker))
}

function parseStructuredTokens(tokens = [], template) {
    var role = null
    var finishReason
    var reasoningContinuationIsContent = false
    var text = ''
    var reasoning = ''
    var toolCalls = []
    var sidecar
    var toolCallContinuationText = ''
    var hasStructuredToolCalls = false
    var structuredWithTemplateText = false
    for (const token of tokens.filter(token => !token.pruned)) {
        if (token.finish_reason) {
            finishReason = token.finish_reason
        }
        const delta = token.delta || {}
        if (!token.finish_reason && finishReason === REASONING_END &&
            (delta.content || delta.reasoning || delta.tool_calls?.length)) {
            finishReason = undefined
        }
        if (delta.role) {
            role = delta.role
        }
        if (delta.sidecar) {
            sidecar = mergeTwoDeltas(sidecar || {}, delta.sidecar)
        }
        const hadStructuredToolCalls = hasStructuredToolCalls
        if (typeof delta.content === 'string') {
            if (hadStructuredToolCalls && hasToolProtocolMarker(delta.content, template)) {
                toolCallContinuationText += delta.content
            } else {
                text += delta.content
            }
        }
        if (delta.tool_calls?.length) {
            if (typeof delta.content === 'string' && hasToolProtocolMarker(delta.content, template)) {
                structuredWithTemplateText = true
            }
            hasStructuredToolCalls = true
            toolCalls = mergeToolCalls(toolCalls, delta.tool_calls)
        }
        if (typeof delta.reasoning === 'string') {
            if (!reasoningContinuationIsContent && text && !reasoning) {
                const parsedPrefix = parseDeepSeekResponseText(text, template)
                if (parsedPrefix.reasoning || parsedPrefix.finish_reason === REASONING_END ||
                    text.includes(THINK_END) || parsedPrefix.tool_calls?.length) {
                    if (parsedPrefix.reasoning) {
                        reasoning = parsedPrefix.reasoning
                    }
                    if (parsedPrefix.content !== undefined) {
                        text = parsedPrefix.content
                    } else {
                        text = ''
                    }
                    if (parsedPrefix.tool_calls?.length) {
                        toolCalls = overlayToolCalls(parsedPrefix.tool_calls, toolCalls)
                    }
                    reasoningContinuationIsContent = parsedPrefix.finish_reason === REASONING_END ||
                        Boolean(parsedPrefix.content) || Boolean(parsedPrefix.tool_calls?.length)
                } else {
                    reasoning += delta.reasoning
                    continue
                }
            }
            if (reasoningContinuationIsContent) {
                text += delta.reasoning
            } else {
                reasoning += delta.reasoning
            }
        }
    }

    var message
    if (text.includes(THINK_BEGIN) || text.includes(THINK_END) || text.includes(template.toolCallsBegin)) {
        message = parseDeepSeekResponseText(text, template)
        if (reasoning) {
            message.reasoning = (message.reasoning || '') + reasoning
        }
        if (toolCalls.length) {
            const parsedToolCalls = message.tool_calls || []
            message.tool_calls = mergeTextAndStructuredToolCalls({
                textToolCalls: parsedToolCalls,
                structuredToolCalls: toolCalls,
                text,
                template,
                structuredWithTemplateText,
            })
        }
    } else {
        message = { role: role || 'assistant' }
        if (reasoning) {
            message.reasoning = reasoning
        }
        if (text) {
            message.content = text
        }
        if (toolCalls.length) {
            message.tool_calls = toolCalls
        }
    }
    if (toolCallContinuationText && toolCalls.length) {
        const continuationPrefix = buildDeepSeekPrompt({
            role: message.role || role || 'assistant',
            reasoning: message.reasoning,
            content: message.content,
            tool_calls: toolCalls,
        }, template).templatedPrompt
        const parsedContinuation = parseDeepSeekResponseText(
            continuationPrefix + toolCallContinuationText,
            template,
        )
        if (parsedContinuation.tool_calls?.length) {
            message.content = parsedContinuation.content
            message.tool_calls = overlayToolCalls(parsedContinuation.tool_calls, toolCalls)
        }
    }
    if (role) {
        message.role = role
    }
    if (finishReason) {
        message.finish_reason = finishReason
    }
    if (sidecar) {
        message.sidecar = sidecar
    }
    if (message.finish_reason === 'stop' && hasActualToolCalls(message.tool_calls)) {
        message.finish_reason = 'tool_calls'
    }
    if (role && !message.content && !message.reasoning && !message.tool_calls?.length) {
        message.content = ''
    }
    return message
}

function buildDeepSeekPrompt(message = {}, template) {
    const isPartial = !['stop', 'tool_calls'].includes(message.finish_reason)
    const reasoning = message.reasoning ? stripRepeatedThinkBegin(message.reasoning) : ''
    const content = typeof message.content === 'string' ? message.content : ''
    const hasToolCallsChannel = message.tool_calls != null
    const hasResponseBody = reasoning || content || hasToolCallsChannel
    if (!message.role && !hasResponseBody) {
        return { templatedPrompt: '', keyPathPromptMapping: [] }
    }
    const isPureReasoningPartial = isPartial && message.finish_reason !== REASONING_END &&
        !content && !hasToolCallsChannel
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

    if (reasoning || isPureReasoningPartial) {
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
        appendRawText('\n\n')
        appendRawText(template.toolCallsBegin)
        const isOpenToolCallsChannel = message.tool_calls.length === 1 && !Object.keys(message.tool_calls[0]).length
        if (message.tool_calls.length && !isOpenToolCallsChannel) {
            appendRawText('\n')
        }
        for (const [toolCallPosition, toolCall] of (isOpenToolCallsChannel ? [] : message.tool_calls).entries()) {
            const toolCallFunction = toolCall.function || {}
            appendRawText(dsmlInvokePrefix(template.toolCallTagName) + (toolCallFunction.name || ''))
            if (toolCallFunction.arguments === undefined) {
                continue
            }
            appendRawText('">\n')
            const parsedArguments = parsePartialJsonObject(toolCallFunction.arguments)
            if (parsedArguments) {
                for (const [parameterIndex, parameter] of parsedArguments.entries.entries()) {
                    if (parameterIndex) {
                        appendRawText('\n')
                    }
                    appendRawText(dsmlParameterPrefix(template.parameterTagName) + parameter.name)
                    if (!parameter.nameComplete) {
                        break
                    }
                    if (parameter.value === undefined) {
                        appendRawText('"')
                        break
                    }
                    const parameterText = parameterValueToText({
                        argumentsText: toolCallFunction.arguments,
                        parameter,
                    })
                    appendRawText(`" string="${parameterText.isString ? 'true' : 'false'}">`)
                    appendMappedText(
                        ['tool_calls', toolCallPosition, 'function', 'arguments'],
                        parameterText.value,
                    )
                    if (parameter.complete) {
                        appendRawText(dsmlMarker(template.parameterTagName, true))
                    } else {
                        break
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
                if (!parsedArguments && toolCallFunction.arguments) {
                    appendRawText('\n')
                }
                appendRawText(`\n${dsmlMarker(template.toolCallTagName, true)}`)
            }
            if (!isLastPartialToolCall && toolCallPosition < message.tool_calls.length - 1) {
                appendRawText('\n')
            }
        }
        const allToolCallsComplete = !isPartial
        if (allToolCallsComplete && !isOpenToolCallsChannel) {
            appendRawText(`\n${template.toolCallsEnd}`)
        }
    }
    return { templatedPrompt, keyPathPromptMapping }
}

export class DeepSeekV4ResponseTemplate {
    static match({ responseTemplateConfig } = {}) {
        return /^deepseek-ai\/DeepSeek-V4(?:-Flash(?:-|$)|$)/i.test(responseTemplateConfig?.name_or_path || '')
    }

    constructor({ apiConfig } = {}) {
        this.responseTemplateType = 'plain_text'
        this.configMark = JSON.stringify((apiConfig?.value || apiConfig || {}).response_template ?? null)
        this.toolCallsBlockName = 'tool_calls'
        this.toolCallTagName = 'invoke'
        this.parameterTagName = 'parameter'
        this.toolCallsBegin = dsmlMarker(this.toolCallsBlockName)
        this.toolCallsEnd = dsmlMarker(this.toolCallsBlockName, true)
    }

    apply(message = {}) {
        return buildDeepSeekPrompt(message, this)
    }

    parse({ tokens = [], messages = [] } = {}) {
        if (typeof tokens !== 'string' && !tokens.some(token => !token.pruned)) {
            return {}
        }
        const hasStructured = typeof tokens !== 'string' && hasStructuredDelta(tokens)
        const responseText = hasStructured ? '' : tokensToResponseText(tokens)
        if (!hasStructured && !responseText) {
            return {}
        }
        const message = hasStructured
            ? parseStructuredTokens(tokens, this)
            : parseDeepSeekResponseText(responseText, this)
        if (!hasStructured && typeof tokens !== 'string') {
            const finishReasonToken = tokens.filter(token => !token.pruned && token.finish_reason).at(-1)
            if (finishReasonToken) {
                message.finish_reason = finishReasonToken.finish_reason
            }
        }
        if (message.finish_reason === 'stop' && hasActualToolCalls(message.tool_calls)) {
            message.finish_reason = 'tool_calls'
        }
        return normalizeMessageToolCalls({ message, messages })
    }
}

export function testDeepSeekV4ResponseTemplate() {
    const template = new DeepSeekV4ResponseTemplate()
    const partialMessageTestCount = testPartialResponseTemplateRoundTrips({ template })
    const assertEqual = (actual, expected, label) => {
        if (actual !== expected) {
            throw new Error(`${label}\n  actual  : ${JSON.stringify(actual)}\n  expected: ${JSON.stringify(expected)}`)
        }
    }
    const message = {
        role: 'assistant',
        reasoning: 'Okay, I see the only tool available is get_weather, I will say hi and call tools.',
        content: 'Hi! Let me get the current temperatures for you.',
        tool_calls: [
            {
                id: 'functions.get_weather:0',
                type: 'function',
                index: 0,
                function: { name: 'get_weather', arguments: '{"location": "New York City, NY", "unit": "celsius"}' },
            },
            {
                id: 'functions.get_weather:1',
                type: 'function',
                index: 1,
                function: { name: 'get_weather', arguments: '{"location": "San Francisco, CA", "unit": "celsius"}' },
            },
        ],
        finish_reason: 'tool_calls',
    }
    const expected = `${THINK_BEGIN}${message.reasoning}${THINK_END}${message.content}\n\n` +
        `${template.toolCallsBegin}\n` +
        `${dsmlInvokePrefix('invoke')}get_weather">\n` +
        `${dsmlParameterPrefix('parameter')}location" string="true">New York City, NY` +
        `${dsmlMarker('parameter', true)}\n` +
        `${dsmlParameterPrefix('parameter')}unit" string="true">celsius${dsmlMarker('parameter', true)}\n` +
        `${dsmlMarker('invoke', true)}\n` +
        `${dsmlInvokePrefix('invoke')}get_weather">\n` +
        `${dsmlParameterPrefix('parameter')}location" string="true">San Francisco, CA` +
        `${dsmlMarker('parameter', true)}\n` +
        `${dsmlParameterPrefix('parameter')}unit" string="true">celsius${dsmlMarker('parameter', true)}\n` +
        `${dsmlMarker('invoke', true)}\n${template.toolCallsEnd}`
    assertEqual(template.apply(message).templatedPrompt, expected, 'complete response')
    const parsedMessage = template.parse({ tokens: expected })
    parsedMessage.finish_reason = 'tool_calls'
    assertEqual(template.apply(parsedMessage).templatedPrompt, expected, 'complete response round-trip')
    assertEqual(DeepSeekV4ResponseTemplate.match({
        responseTemplateConfig: { name_or_path: 'deepseek-ai/DeepSeek-V4-Flash' },
    }), true, 'V4-Flash match')
    assertEqual(DeepSeekV4ResponseTemplate.match({
        responseTemplateConfig: { name_or_path: 'deepseek-ai/DeepSeek-V4' },
    }), true, 'V4 match')
    assertEqual(DeepSeekV4ResponseTemplate.match({
        responseTemplateConfig: { name_or_path: 'deepseek-ai/DeepSeek-V4-Flash-FP8' },
    }), true, 'V4-Flash variant match')
    assertEqual(DeepSeekV4ResponseTemplate.match({
        responseTemplateConfig: { name_or_path: 'deepseek-ai/DeepSeek-V4-Pro' },
    }), false, 'V4-Pro mismatch')
    assertEqual(DeepSeekV4ResponseTemplate.match({
        responseTemplateConfig: { name_or_path: 'deepseek-ai/DeepSeek-V4.1-Flash' },
    }), false, 'V4.1 mismatch')
    return partialMessageTestCount + 5
}
