import { tokenToDisplayString } from '../chatUtils.js'
import { deepCopy } from '../commonUtils.js'
import { parsePartialJsonObject } from '../partialJsonUtils.js'
import { normalizeMessageToolCalls } from './responseTemplateUtils.js'
import { testPartialResponseTemplateRoundTrips } from './responseTemplateTestUtils.js'

const specialMarker = (name) => ['<|', name, '|>'].join('')
const OPEN = specialMarker('open')
const CLOSE = specialMarker('close')
const SEP = specialMarker('sep')
const END_OF_MSG = specialMarker('end_of_msg')
const THINK_BEGIN = `${OPEN}think${SEP}`
const THINK_END = `${CLOSE}think${SEP}`
const RESPONSE_BEGIN = `${OPEN}response${SEP}`
const RESPONSE_END = `${CLOSE}response${SEP}`
const TOOLS_BEGIN = `${OPEN}tools${SEP}`
const TOOLS_END = `${CLOSE}tools${SEP}`
const CALL_BEGIN = `${OPEN}call`
const CALL_END = `${CLOSE}call${SEP}`
const ARGUMENT_BEGIN = `${OPEN}argument`
const ARGUMENT_END = `${CLOSE}argument${SEP}`
const JSON_BEGIN = `${OPEN}json`
const JSON_END = `${CLOSE}json${SEP}`
const MESSAGE_END = `${CLOSE}message${SEP}`
const REASONING_END = 'reasoning_end'

function stripRepeatedThinkBegin(text) {
    while (text.startsWith(THINK_BEGIN)) {
        text = text.slice(THINK_BEGIN.length)
    }
    return text
}

function escapeAttribute(value) {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function unescapeAttribute(value) {
    return value.replace(/&quot;/g, '"').replace(/&amp;/g, '&')
}

function openTag(name, attributes = []) {
    return `${OPEN}${name}${attributes.map(([key, value]) => ` ${key}="${escapeAttribute(value)}"`).join('')}${SEP}`
}

function parseAttributes(text) {
    const attributes = {}
    const attributePattern = /\s+([\w-]+)="((?:&[^;]+;|[^"])*)"/g
    var match
    while ((match = attributePattern.exec(text))) {
        attributes[match[1]] = unescapeAttribute(match[2])
    }
    return attributes
}

function inferArgumentType({ argumentsText, parameter } = {}) {
    if (parameter.value === undefined) {
        return 'string'
    }
    if (parameter.complete) {
        if (parameter.value === null) {
            return 'null'
        }
        if (Array.isArray(parameter.value)) {
            return 'array'
        }
        if (typeof parameter.value === 'object') {
            return 'object'
        }
        return typeof parameter.value
    }
    const keyText = JSON.stringify(parameter.name)
    const keyStart = argumentsText.indexOf(keyText)
    const colon = keyStart === -1 ? -1 : argumentsText.indexOf(':', keyStart + keyText.length)
    const valueStart = colon === -1 ? -1 : colon + 1 + argumentsText.slice(colon + 1).search(/\S/)
    const valuePrefix = valueStart === -1 ? '' : argumentsText[valueStart]
    if (valuePrefix === '"') {
        return 'string'
    }
    if (valuePrefix === '[') {
        return 'array'
    }
    if (valuePrefix === '{') {
        return 'object'
    }
    if (valuePrefix === 't' || valuePrefix === 'f') {
        return 'boolean'
    }
    if (valuePrefix === 'n') {
        return 'null'
    }
    return 'number'
}

function hasArgumentColon(argumentsText, parameter) {
    const keyText = JSON.stringify(parameter.name)
    const keyStart = argumentsText.indexOf(keyText)
    if (keyStart === -1) {
        return false
    }
    const afterKey = argumentsText.slice(keyStart + keyText.length).search(/\S/)
    return afterKey !== -1 && argumentsText[keyStart + keyText.length + afterKey] === ':'
}

function findJsonValueEnd(text, valueStart) {
    if (text[valueStart] === '"') {
        for (let cursor = valueStart + 1; cursor < text.length; cursor += 1) {
            if (text[cursor] === '\\') {
                cursor += 1
            } else if (text[cursor] === '"') {
                return cursor + 1
            }
        }
        return -1
    }
    if (text[valueStart] === '[' || text[valueStart] === '{') {
        var depth = 0
        for (let cursor = valueStart; cursor < text.length; cursor += 1) {
            if (text[cursor] === '"') {
                const stringEnd = findJsonValueEnd(text, cursor)
                if (stringEnd === -1) {
                    return -1
                }
                cursor = stringEnd - 1
            } else if (text[cursor] === '[' || text[cursor] === '{') {
                depth += 1
            } else if (text[cursor] === ']' || text[cursor] === '}') {
                depth -= 1
                if (depth === 0) {
                    return cursor + 1
                }
            }
        }
        return -1
    }
    const literalEnd = text.slice(valueStart).search(/[\s,\]}]/)
    if (literalEnd !== -1) {
        return valueStart + literalEnd
    }
    return ['true', 'false', 'null'].includes(text.slice(valueStart)) ? text.length : -1
}

function getRawArgumentValues(argumentsText, parameters) {
    const values = []
    var cursor = argumentsText.indexOf('{') + 1
    for (const parameter of parameters) {
        const keyStart = argumentsText.indexOf(JSON.stringify(parameter.name), cursor)
        const colon = keyStart === -1 ? -1 : argumentsText.indexOf(':', keyStart + JSON.stringify(parameter.name).length)
        const valueStart = colon === -1 ? -1 : colon + 1 + argumentsText.slice(colon + 1).search(/\S/)
        if (valueStart === -1) {
            values.push('')
            continue
        }
        const valueEnd = findJsonValueEnd(argumentsText, valueStart)
        values.push(argumentsText.slice(valueStart, valueEnd === -1 ? argumentsText.length : valueEnd))
        cursor = valueEnd === -1 ? argumentsText.length : valueEnd
    }
    return values
}

function argumentValueText({ parameter, rawValue, type } = {}) {
    if (parameter.complete) {
        return type === 'string' ? String(parameter.value) : rawValue
    }
    if (type === 'string') {
        return String(parameter.value ?? '')
    }
    return rawValue
}

function parseToolArguments(argumentsText) {
    const parsed = parsePartialJsonObject(argumentsText)
    if (!parsed) {
        return { jsonBlock: argumentsText }
    }
    const rawValues = getRawArgumentValues(argumentsText, parsed.entries)
    return {
        parameters: parsed.entries.map((parameter, index) => {
            const type = inferArgumentType({ argumentsText, parameter })
            return {
                ...parameter,
                type,
                hasColon: hasArgumentColon(argumentsText, parameter),
                rawValue: rawValues[index],
                valueText: argumentValueText({ parameter, rawValue: rawValues[index], type }),
            }
        }),
        complete: parsed.complete,
    }
}

function buildArgumentsFromParameters(parameters, functionClosed) {
    if (!parameters.length) {
        return functionClosed ? '{}' : ''
    }
    const parts = parameters.map(parameter => {
        if (!parameter.nameComplete) {
            return JSON.stringify(parameter.name).slice(0, -1)
        }
        if (!parameter.valueStarted) {
            return JSON.stringify(parameter.name)
        }
        var value = parameter.type === 'string'
            ? JSON.stringify(parameter.valueText ?? '')
            : parameter.valueText ?? ''
        if (!parameter.complete && parameter.type === 'string') {
            value = value.slice(0, -1)
        }
        return `${JSON.stringify(parameter.name)}: ${value}`
    })
    const text = `{${parts.join(', ')}`
    return functionClosed && parameters.every(parameter => parameter.nameComplete && parameter.complete)
        ? `${text}}`
        : text
}

function buildToolCallFromParsed({ name, argumentsText, index } = {}) {
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

function parseArgumentBlocks(text, functionClosed) {
    const parameters = []
    var cursor = 0
    while (cursor < text.length) {
        const argumentStart = text.indexOf(ARGUMENT_BEGIN, cursor)
        const jsonStart = text.indexOf(JSON_BEGIN, cursor)
        if (argumentStart === -1 && jsonStart === -1) {
            break
        }
        if (jsonStart !== -1 && (argumentStart === -1 || jsonStart < argumentStart)) {
            const headerEnd = text.indexOf(SEP, jsonStart + JSON_BEGIN.length)
            if (headerEnd === -1) {
                return { jsonBlock: text.slice(jsonStart + JSON_BEGIN.length) }
            }
            const valueStart = headerEnd + SEP.length
            const jsonEnd = text.indexOf(JSON_END, valueStart)
            return {
                jsonBlock: text.slice(valueStart, jsonEnd === -1 ? text.length : jsonEnd),
            }
        }
        const headerEnd = text.indexOf(SEP, argumentStart + ARGUMENT_BEGIN.length)
        if (headerEnd === -1) {
            const header = text.slice(argumentStart + ARGUMENT_BEGIN.length)
            const keyStart = header.indexOf(' key="')
            if (keyStart !== -1) {
                const nameStart = keyStart + ' key="'.length
                const nameEnd = header.indexOf('"', nameStart)
                parameters.push({
                    name: nameEnd === -1 ? header.slice(nameStart) : header.slice(nameStart, nameEnd),
                    nameComplete: nameEnd !== -1,
                    valueStarted: false,
                    complete: false,
                })
            }
            break
        }
        const attributes = parseAttributes(text.slice(argumentStart + ARGUMENT_BEGIN.length, headerEnd))
        const valueStart = headerEnd + SEP.length
        const valueEnd = text.indexOf(ARGUMENT_END, valueStart)
        const nextArgument = text.indexOf(ARGUMENT_BEGIN, valueStart)
        const nextJson = text.indexOf(JSON_BEGIN, valueStart)
        const nextBoundary = [valueEnd, nextArgument, nextJson].filter(index => index !== -1).sort((a, b) => a - b)[0]
        const value = text.slice(valueStart, nextBoundary === undefined ? text.length : nextBoundary)
        const complete = valueEnd !== -1 && (nextBoundary === valueEnd || nextBoundary === undefined)
        parameters.push({
            name: attributes.key || '',
            type: attributes.type || 'string',
            valueText: value,
            nameComplete: true,
            valueStarted: true,
            complete: complete || nextArgument !== -1 || functionClosed,
        })
        cursor = valueEnd === -1 ? text.length : valueEnd + ARGUMENT_END.length
    }
    return { parameters }
}

function parseToolCalls(text) {
    const toolCalls = []
    var cursor = 0
    while (cursor < text.length) {
        const callStart = text.indexOf(CALL_BEGIN, cursor)
        if (callStart === -1) {
            break
        }
        const headerEnd = text.indexOf(SEP, callStart + CALL_BEGIN.length)
        if (headerEnd === -1) {
            const header = text.slice(callStart + CALL_BEGIN.length)
            const attributes = parseAttributes(header)
            toolCalls.push(Object.keys(attributes).length
                ? buildToolCallFromParsed({ name: attributes.tool, index: toolCalls.length })
                : {})
            break
        }
        const attributes = parseAttributes(text.slice(callStart + CALL_BEGIN.length, headerEnd))
        const bodyStart = headerEnd + SEP.length
        const callEnd = text.indexOf(CALL_END, bodyStart)
        const nextCall = text.indexOf(CALL_BEGIN, bodyStart)
        const bodyEnd = [callEnd, nextCall].filter(index => index !== -1).sort((a, b) => a - b)[0]
        const body = text.slice(bodyStart, bodyEnd === undefined ? text.length : bodyEnd)
        const parsedArguments = parseArgumentBlocks(body, callEnd !== -1 && (nextCall === -1 || callEnd < nextCall))
        var argumentsText
        if (parsedArguments.jsonBlock !== undefined) {
            argumentsText = parsedArguments.jsonBlock
        } else if (parsedArguments.parameters?.length || (callEnd !== -1 && !body.trim())) {
            argumentsText = buildArgumentsFromParameters(
                parsedArguments.parameters || [],
                callEnd !== -1 && (nextCall === -1 || callEnd < nextCall),
            )
        }
        toolCalls.push(buildToolCallFromParsed({
            name: attributes.tool,
            argumentsText,
            index: toolCalls.length,
        }))
        if (bodyEnd === undefined || nextCall !== -1 && nextCall < callEnd) {
            break
        }
        cursor = callEnd + CALL_END.length
    }
    return toolCalls
}

function stripMessageWrapper(text) {
    const messageBegin = `${OPEN}message`
    if (text.startsWith(messageBegin)) {
        const separator = text.indexOf(SEP, messageBegin.length)
        if (separator !== -1) {
            text = text.slice(separator + SEP.length)
        }
    }
    if (text.endsWith(END_OF_MSG)) {
        text = text.slice(0, -END_OF_MSG.length)
    }
    if (text.endsWith(MESSAGE_END)) {
        text = text.slice(0, -MESSAGE_END.length)
    }
    return text
}

function parseKimiK3ResponseText(text) {
    if (!text) {
        return {}
    }
    const message = { role: 'assistant' }
    var remainingText = stripMessageWrapper(text)
    var reasoningClosed = false

    if (remainingText.startsWith(THINK_BEGIN)) {
        const reasoningStart = THINK_BEGIN.length
        const thinkEnd = remainingText.indexOf(THINK_END, reasoningStart)
        const responseStart = remainingText.indexOf(RESPONSE_BEGIN, reasoningStart)
        const toolsStart = remainingText.indexOf(TOOLS_BEGIN, reasoningStart)
        const implicitEnd = [responseStart, toolsStart].filter(index => index !== -1).sort((a, b) => a - b)[0]
        if (thinkEnd === -1 && implicitEnd === undefined) {
            const reasoning = stripRepeatedThinkBegin(remainingText.slice(reasoningStart))
            if (reasoning) {
                message.reasoning = reasoning
            }
            return message
        }
        const end = thinkEnd === -1 ? implicitEnd : thinkEnd
        const reasoning = stripRepeatedThinkBegin(remainingText.slice(reasoningStart, end))
        if (reasoning) {
            message.reasoning = reasoning
        }
        remainingText = remainingText.slice(end + (thinkEnd === -1 ? 0 : THINK_END.length))
        reasoningClosed = true
    } else if (remainingText.startsWith(THINK_END)) {
        remainingText = remainingText.slice(THINK_END.length)
        reasoningClosed = true
    }

    const toolsStart = remainingText.indexOf(TOOLS_BEGIN)
    const responseStart = remainingText.indexOf(RESPONSE_BEGIN)
    if (responseStart !== -1 && (toolsStart === -1 || responseStart < toolsStart)) {
        const responseBodyStart = responseStart + RESPONSE_BEGIN.length
        const responseEnd = remainingText.indexOf(RESPONSE_END, responseBodyStart)
        const implicitResponseEnd = remainingText.indexOf(TOOLS_BEGIN, responseBodyStart)
        const end = responseEnd === -1 ? implicitResponseEnd : responseEnd
        message.content = remainingText.slice(responseBodyStart, end === -1 ? remainingText.length : end)
        if (end !== -1) {
            remainingText = remainingText.slice(end + (responseEnd === -1 ? 0 : RESPONSE_END.length))
        } else {
            return message
        }
    } else if (toolsStart === -1) {
        message.content = remainingText
        if (reasoningClosed && !message.content) {
            message.finish_reason = REASONING_END
        }
        return message
    } else {
        message.content = remainingText.slice(0, toolsStart)
        remainingText = remainingText.slice(toolsStart)
    }

    const actualToolsStart = remainingText.indexOf(TOOLS_BEGIN)
    if (actualToolsStart !== -1) {
        const toolsBodyStart = actualToolsStart + TOOLS_BEGIN.length
        const toolsEnd = remainingText.indexOf(TOOLS_END, toolsBodyStart)
        const toolsText = remainingText.slice(toolsBodyStart, toolsEnd === -1 ? remainingText.length : toolsEnd)
        message.tool_calls = parseToolCalls(toolsText)
        if (!message.tool_calls.length) {
            message.tool_calls = []
        }
        if (toolsEnd !== -1 && toolsEnd + TOOLS_END.length < remainingText.length) {
            remainingText = remainingText.slice(toolsEnd + TOOLS_END.length)
        }
    }

    if (text.endsWith(END_OF_MSG)) {
        message.finish_reason = message.tool_calls?.length
            ? 'tool_calls'
            : 'stop'
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

function mergeTwoDeltas(delta1 = {}, delta2 = {}, unmergedKeys = []) {
    const merged = { ...delta1 }
    for (const key in delta2) {
        if (!(key in merged)) {
            merged[key] = deepCopy(delta2[key])
        } else if (unmergedKeys.includes(key)) {
            merged[key] = deepCopy(merged[key])
        } else if (typeof merged[key] === 'string' && typeof delta2[key] === 'string') {
            merged[key] += delta2[key]
        } else if (typeof merged[key] === 'number' && typeof delta2[key] === 'number') {
            console.assert(merged[key] === delta2[key], `Number mismatch: ${merged[key]} !== ${delta2[key]}`)
        } else if (merged[key] && delta2[key] && typeof merged[key] === 'object' && typeof delta2[key] === 'object') {
            merged[key] = mergeTwoDeltas(merged[key], delta2[key], unmergedKeys)
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
        if (parsedArguments !== undefined && toolCalls[index]?.function) {
            toolCalls[index].function.arguments = parsedArguments
        }
    }
    return toolCalls
}

function hasStructuredDelta(tokens = []) {
    return tokens.some(token => token.delta?.role || token.delta?.reasoning || token.delta?.tool_calls?.length)
}

function hasProtocolMarker(text) {
    return text.includes(THINK_BEGIN) || text.includes(THINK_END) ||
        text.includes(RESPONSE_BEGIN) || text.includes(TOOLS_BEGIN) || text.includes(CALL_BEGIN)
}

function reasoningContinuationTarget(text) {
    if (!text || !hasProtocolMarker(text)) {
        return null
    }
    if (text.startsWith(THINK_BEGIN) && !text.includes(THINK_END) &&
        !text.includes(RESPONSE_BEGIN) && !text.includes(TOOLS_BEGIN)) {
        return 'reasoning'
    }
    return 'protocol'
}

function parseStructuredTokens(tokens = []) {
    var role = null
    var finishReason
    var sidecar
    var text = ''
    var reasoning = ''
    var toolCalls = []
    var continuationTarget
    for (const token of tokens.filter(token => !token.pruned)) {
        if (token.finish_reason) {
            finishReason = token.finish_reason
        }
        const delta = token.delta || {}
        if (delta.role) {
            role = delta.role
        }
        if (delta.sidecar) {
            sidecar = mergeTwoDeltas(sidecar || {}, delta.sidecar)
        }
        if (typeof delta.content === 'string') {
            if (delta.content && continuationTarget === 'reasoning' &&
                text.startsWith(THINK_BEGIN) && !text.includes(THINK_END) && !hasProtocolMarker(delta.content)) {
                text += THINK_END + RESPONSE_BEGIN
                continuationTarget = 'protocol'
            }
            if (finishReason === REASONING_END && delta.content) {
                finishReason = undefined
            }
            text += delta.content
        }
        if (delta.tool_calls?.length) {
            if (finishReason === REASONING_END) {
                finishReason = undefined
            }
            toolCalls = mergeToolCalls(toolCalls, delta.tool_calls)
        }
        if (typeof delta.reasoning === 'string') {
            if (!continuationTarget) {
                continuationTarget = reasoningContinuationTarget(text)
                if (!text && hasProtocolMarker(delta.reasoning)) {
                    continuationTarget = 'protocol'
                }
            }
            if (continuationTarget === 'protocol') {
                if (finishReason === REASONING_END) {
                    finishReason = undefined
                }
                text += delta.reasoning
            } else if (continuationTarget === 'reasoning' && delta.reasoning.includes(THINK_END)) {
                const thinkEnd = delta.reasoning.indexOf(THINK_END)
                reasoning += delta.reasoning.slice(0, thinkEnd)
                text += THINK_END + delta.reasoning.slice(thinkEnd + THINK_END.length)
                continuationTarget = 'protocol'
            } else {
                reasoning += delta.reasoning
            }
        }
    }

    const parsed = hasProtocolMarker(text) ? parseKimiK3ResponseText(text) : {}
    const message = hasProtocolMarker(text)
        ? parsed
        : { role: role || 'assistant', ...(reasoning ? { reasoning } : {}), ...(text ? { content: text } : {}) }
    if (reasoning && hasProtocolMarker(text)) {
        message.reasoning = message.reasoning ? `${message.reasoning}${reasoning}` : reasoning
    }
    if (toolCalls.length) {
        message.tool_calls = overlayToolCalls(message.tool_calls || [], toolCalls)
    }
    if (role) {
        message.role = role
    } else if (tokens.some(token => !token.pruned)) {
        message.role = 'assistant'
    }
    if (sidecar) {
        message.sidecar = sidecar
    }
    if (finishReason) {
        message.finish_reason = finishReason
    }
    if (message.finish_reason === 'stop' && message.tool_calls?.length) {
        message.finish_reason = 'tool_calls'
    }
    if (role && !message.content && !message.reasoning && !message.tool_calls?.length) {
        message.content = ''
    }
    return message
}

function appendMappedText(state, keyPath, text) {
    if (!text) {
        return
    }
    state.keyPathPromptMapping.push({
        keyPath,
        textStart: state.templatedPrompt.length,
        textEnd: state.templatedPrompt.length + text.length,
    })
    state.templatedPrompt += text
}

function buildKimiK3Prompt(message = {}) {
    const isPartial = !['stop', 'tool_calls'].includes(message.finish_reason)
    const reasoning = message.reasoning ? stripRepeatedThinkBegin(message.reasoning) : ''
    const content = typeof message.content === 'string' ? message.content : ''
    const hasContentChannel = 'content' in message
    const hasToolCallsChannel = message.tool_calls != null
    const isReasoningEnd = message.finish_reason === REASONING_END
    if (!message.role && !reasoning && !hasContentChannel && !hasToolCallsChannel && !message.finish_reason) {
        return { templatedPrompt: '', keyPathPromptMapping: [] }
    }
    const isPureReasoningPartial = isPartial && !isReasoningEnd && !hasContentChannel && !hasToolCallsChannel
    const state = { templatedPrompt: '', keyPathPromptMapping: [] }
    const appendRaw = text => { state.templatedPrompt += text }

    if (reasoning || isPureReasoningPartial) {
        appendRaw(THINK_BEGIN)
        appendMappedText(state, ['reasoning'], reasoning)
        if (!isPureReasoningPartial) {
            appendRaw(THINK_END)
        }
    } else {
        appendRaw(THINK_END)
    }

    const shouldRenderResponse = !isReasoningEnd && (
        hasContentChannel || hasToolCallsChannel || !isPartial
    )
    if (shouldRenderResponse) {
        appendRaw(RESPONSE_BEGIN)
        appendMappedText(state, ['content'], content)
        const responseIsComplete = !isPartial || hasToolCallsChannel
        if (responseIsComplete) {
            appendRaw(RESPONSE_END)
        }
    }

    if (hasToolCallsChannel) {
        appendRaw(TOOLS_BEGIN)
        const toolCalls = message.tool_calls
        for (const [toolCallPosition, toolCall] of toolCalls.entries()) {
            if (!toolCall.function?.name) {
                appendRaw(CALL_BEGIN)
                continue
            }
            const callName = toolCall.function.name
            appendRaw(`${openTag('call', [['tool', callName], ['index', toolCallPosition + 1]])}`)
            if (toolCall.function.arguments === undefined) {
                if (!isPartial || toolCallPosition < toolCalls.length - 1) {
                    appendRaw(CALL_END)
                }
                continue
            }
            const parsedArguments = parseToolArguments(toolCall.function.arguments)
            if (parsedArguments.jsonBlock !== undefined) {
                appendRaw(openTag('json', [['type', 'object']]))
                appendMappedText(
                    state,
                    ['tool_calls', toolCallPosition, 'function', 'arguments'],
                    parsedArguments.jsonBlock,
                )
                if (!isPartial || toolCallPosition < toolCalls.length - 1) {
                    appendRaw(JSON_END)
                }
            } else {
                for (const [parameterIndex, parameter] of parsedArguments.parameters.entries()) {
                    if (!parameter.nameComplete) {
                        appendRaw(`${OPEN}argument key="${escapeAttribute(parameter.name)}`)
                        break
                    }
                    if (!parameter.hasColon) {
                        appendRaw(`${OPEN}argument key="${escapeAttribute(parameter.name)}"`)
                        break
                    }
                    appendRaw(openTag('argument', [['key', parameter.name], ['type', parameter.type]]))
                    appendMappedText(
                        state,
                        ['tool_calls', toolCallPosition, 'function', 'arguments'],
                        parameter.valueText,
                    )
                    if (parameter.complete) {
                        appendRaw(ARGUMENT_END)
                    }
                    if (!parameter.nameComplete) {
                        break
                    }
                    if (parameterIndex === parsedArguments.parameters.length - 1 && !parameter.complete) {
                        break
                    }
                }
            }
            const callIsComplete = !isPartial || parsedArguments.complete
            if (callIsComplete) {
                appendRaw(CALL_END)
            }
        }
        if (!isPartial) {
            appendRaw(TOOLS_END)
        }
    }

    if (!isPartial && !isReasoningEnd) {
        appendRaw(MESSAGE_END)
        appendRaw(END_OF_MSG)
    }
    return state
}

export class KimiK3ResponseTemplate {
    static match({ responseTemplateConfig } = {}) {
        return /^moonshotai\/kimi-k3(?:\.[0-9]+)?(?:-|$)/i.test(responseTemplateConfig?.name_or_path || '')
    }

    constructor({ apiConfig } = {}) {
        this.responseTemplateType = 'plain_text'
        this.configMark = JSON.stringify((apiConfig?.value || apiConfig || {}).response_template ?? null)
    }

    apply(message = {}) {
        return buildKimiK3Prompt(message)
    }

    parse({ tokens = [], messages = [] } = {}) {
        if (typeof tokens !== 'string' && !tokens.some(token => !token.pruned)) {
            return {}
        }
        if (typeof tokens !== 'string' && hasStructuredDelta(tokens)) {
            return normalizeMessageToolCalls({
                message: parseStructuredTokens(tokens),
                messages,
            })
        }
        const responseText = tokensToResponseText(tokens)
        if (!responseText) {
            return {}
        }
        const message = parseKimiK3ResponseText(responseText)
        if (typeof tokens !== 'string') {
            const finishReasonToken = tokens.filter(token => !token.pruned && token.finish_reason).at(-1)
            if (finishReasonToken) {
                message.finish_reason = finishReasonToken.finish_reason
            }
        }
        if (message.finish_reason === 'stop' && message.tool_calls?.length) {
            message.finish_reason = 'tool_calls'
        }
        return normalizeMessageToolCalls({ message, messages })
    }
}

export function testKimiK3ResponseTemplate() {
    const template = new KimiK3ResponseTemplate()
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
    const expected = `${THINK_BEGIN}${message.reasoning}${THINK_END}${RESPONSE_BEGIN}${message.content}${RESPONSE_END}` +
        `${TOOLS_BEGIN}${openTag('call', [['tool', 'get_weather'], ['index', 1]])}` +
        `${openTag('argument', [['key', 'location'], ['type', 'string']])}New York City, NY${ARGUMENT_END}` +
        `${openTag('argument', [['key', 'unit'], ['type', 'string']])}celsius${ARGUMENT_END}${CALL_END}` +
        `${openTag('call', [['tool', 'get_weather'], ['index', 2]])}` +
        `${openTag('argument', [['key', 'location'], ['type', 'string']])}San Francisco, CA${ARGUMENT_END}` +
        `${openTag('argument', [['key', 'unit'], ['type', 'string']])}celsius${ARGUMENT_END}${CALL_END}` +
        `${TOOLS_END}${MESSAGE_END}${END_OF_MSG}`
    assertEqual(template.apply(message).templatedPrompt, expected, 'complete response')
    const parsed = template.parse({ tokens: expected })
    assertEqual(parsed.reasoning, message.reasoning, 'reasoning parse')
    assertEqual(parsed.content, message.content, 'content parse')
    assertEqual(parsed.tool_calls.length, 2, 'tool call count')
    assertEqual(parsed.tool_calls[0].function.arguments, message.tool_calls[0].function.arguments, 'arguments parse')
    parsed.finish_reason = 'tool_calls'
    assertEqual(template.apply(parsed).templatedPrompt, expected, 'complete response round-trip')

    const resumed = template.parse({
        tokens: [
            { delta: { content: `${THINK_BEGIN}old${THINK_END}${RESPONSE_BEGIN}answer` } },
            { delta: { reasoning: 'continued' } },
        ],
    })
    assertEqual(resumed.reasoning, 'old', 'reasoning continuation')
    assertEqual(resumed.content, 'answercontinued', 'content continuation')
    assertEqual(
        template.apply(resumed).templatedPrompt,
        `${THINK_BEGIN}old${THINK_END}${RESPONSE_BEGIN}answercontinued`,
        'content continuation round-trip',
    )
    const structuredMessage = template.parse({
        tokens: [
            { delta: { role: 'assistant', content: '' } },
            { delta: { reasoning: 'think' } },
            { delta: { content: 'answer' } },
            { delta: { tool_calls: [{ index: 0, type: 'function', function: {
                name: 'read_file',
                arguments: '{"path":"/tmp/a.txt"}',
            } }] } },
            { delta: {}, finish_reason: 'tool_calls' },
        ],
    })
    assertEqual(structuredMessage.reasoning, 'think', 'structured reasoning is not duplicated')
    const reasoningPrefill = template.apply({ role: 'assistant', reasoning: 'old' }).templatedPrompt
    const reasoningPrefillMessage = template.parse({
        tokens: [
            { delta: { role: 'assistant', content: reasoningPrefill } },
            { delta: { reasoning: ' continued' } },
            { delta: { content: 'answer' } },
        ],
    })
    assertEqual(reasoningPrefillMessage.reasoning, 'old continued', 'reasoning prefill continuation')
    assertEqual(reasoningPrefillMessage.content, 'answer', 'reasoning prefill content')
    assertEqual(KimiK3ResponseTemplate.match({
        responseTemplateConfig: { name_or_path: 'moonshotai/Kimi-K3' },
    }), true, 'K3 match')
    assertEqual(KimiK3ResponseTemplate.match({
        responseTemplateConfig: { name_or_path: 'moonshotai/Kimi-K3.1-FP8' },
    }), true, 'K3.x match')
    assertEqual(KimiK3ResponseTemplate.match({
        responseTemplateConfig: { name_or_path: 'moonshotai/Kimi-K2' },
    }), false, 'K2 mismatch')
    return partialMessageTestCount + 11
}
