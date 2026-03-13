import JSON5 from 'json5'

import { base64ToBlob } from './commonUtils.js'
import { multimodalChunkStringToObject, multimodalChunkObjectToBase64 } from './multimodalUtils.js'

export const MESSAGE_KEYS_IN_CONTEXT = ['name', 'reasoning', 'content', 'tool_calls', 'tool_call_id']
export const MESSAGE_META_KEYS = ['name', 'tool_call_id']
export const MESSAGE_CONTEXT_SECTION_MARKERS = {
    message_meta: '<|ON_PANDA_MESSAGE_META|>',
    reasoning: '<|ON_PANDA_REASONING|>',
    content: '<|ON_PANDA_CONTENT|>',
    tool_calls: '<|ON_PANDA_TOOL_CALLS|>',
}

export function multimodalChunkObjectToMarkdown(chunk, { blobUrlToBase64Cache = {} } = {}) {
    var type = chunk['type']
    if (!blobUrlToBase64Cache[type]) {
        blobUrlToBase64Cache[type] = {}
    }

    var hashToObjectString = blobUrlToBase64Cache[type]
    var hash = JSON.stringify(chunk[type])
    if (!(hash in hashToObjectString)) {
        var typeNumInCache = Object.keys(hashToObjectString).length
        var cacheIndex = `${type}_${typeNumInCache + 1}`
        var base64Object = multimodalChunkObjectToBase64(chunk)
        if (base64Object) {
            blobUrlToBase64Cache[base64Object.blob_url] = base64Object.base64_url
        }
        var blob_url = base64Object?.blob_url || "NotImplemented"
        blobUrlToBase64Cache[cacheIndex] = chunk
        var objectString = `[${cacheIndex}](${blob_url})`
        hashToObjectString[hash] = objectString
    }
    return hashToObjectString[hash]
}

export function formatContentAsText(content, codecContext = {}) {
    const { blobUrlToBase64Cache = {}, multimodalPlugins = {} } = codecContext
    if (typeof content === 'string') {
        return content
    }
    var str = ''
    if (Array.isArray(content)) {
        for (let i = 0; i < content.length; i++) {
            const chunk = content[i]
            if (chunk['type'] === 'text') {
                str += chunk['text']
            } else if (chunk['type'] === 'image_url') {
                var imageUrlShow = chunk['image_url']['url']
                if (chunk['image_url']['url'].startsWith('data:')) {
                    if (!blobUrlToBase64Cache[chunk['blob_url']]) {
                        chunk['blob_url'] = base64ToBlob(chunk['image_url']['url'])
                        blobUrlToBase64Cache[chunk['blob_url']] = chunk['image_url']['url']
                    }
                    imageUrlShow = chunk['blob_url']
                }
                str += `![<|ON_PANDA_IMAGE|>](${imageUrlShow})`
            } else if (Object.keys(multimodalPlugins).includes(chunk['type'])) {
                str += '<|ON_PANDA_OBJECT_START|>' + multimodalChunkObjectToMarkdown(chunk, codecContext) + '<|ON_PANDA_OBJECT_END|>'
            } else {
                str += '<|ON_PANDA_OBJECT_START|>' + JSON.stringify(chunk) + '<|ON_PANDA_OBJECT_END|>'
            }
        }
    }
    return str
}

export function formatSimpleContentAsText(content) {
    if (typeof content === 'string') {
        return content
    }
    if (Array.isArray(content)) {
        return content.map(chunk => JSON.stringify(chunk)).join('\n')
    }
    return ''
}

export function parseContentAsText(value, { blobUrlToBase64Cache = {} } = {}) {
    if (value.includes('![<|ON_PANDA_IMAGE|>](') || value.includes('<|ON_PANDA_OBJECT_START|>')) {
        const content = []
        const regex = /(<\|ON_PANDA_OBJECT_START\|>(.*?)<\|ON_PANDA_OBJECT_END\|>)|(!\[<\|ON_PANDA_IMAGE\|>\]\((.*?)\))/gs
        let lastIndex = 0
        let match

        while ((match = regex.exec(value)) !== null) {
            if (match.index > lastIndex) {
                const textSegment = value.substring(lastIndex, match.index)
                content.push({ type: 'text', text: textSegment })
            }

            if (match[1]) {
                const objStr = match[2]
                const obj = multimodalChunkStringToObject(objStr, blobUrlToBase64Cache)
                content.push(obj)
            } else if (match[3]) {
                var imageUrl = match[4]
                const image = { type: 'image_url', image_url: { url: imageUrl } }
                if (imageUrl.startsWith('blob:')) {
                    image.blob_url = imageUrl
                    image.image_url.url = blobUrlToBase64Cache[imageUrl]
                    console.assert(image.image_url.url, 'blobUrl not found in blobUrlToBase64Cache')
                }
                content.push(image)
            }

            lastIndex = regex.lastIndex
        }

        if (lastIndex < value.length) {
            const remainingText = value.substring(lastIndex)
            content.push({ type: 'text', text: remainingText })
        }

        return content
    }
    return value
}

function serializeMessageSection(marker, text, { isJson = false } = {}) {
    if (!text) {
        return ''
    }
    if (isJson) {
        return `### ${marker}\n\`\`\`JavaScript\n${text}\n\`\`\``
    }
    return `### ${marker}\n${text}`
}

function splitMessageSections(value) {
    const sectionHeaderRegex = /^###\s+(<\|ON_PANDA_[A-Z_]+\|>)\s*$/gm
    const matches = Array.from(value.matchAll(sectionHeaderRegex))
    if (!matches.length) {
        return null
    }

    const knownMarkers = Object.values(MESSAGE_CONTEXT_SECTION_MARKERS)
    const sections = {}
    for (let i = 0; i < matches.length; i++) {
        const match = matches[i]
        const marker = match[1]
        if (!knownMarkers.includes(marker)) {
            throw new Error(`Unsupported message section: ${marker}`)
        }
        if (sections[marker] != null) {
            throw new Error(`Duplicated message section: ${marker}`)
        }
        let contentStart = match.index + match[0].length
        if (value.startsWith('\r\n', contentStart)) {
            contentStart += 2
        } else if (value[contentStart] === '\n') {
            contentStart += 1
        }

        let contentEnd = i + 1 < matches.length ? matches[i + 1].index : value.length
        if (i + 1 < matches.length) {
            if (value.slice(contentEnd - 2, contentEnd) === '\r\n') {
                contentEnd -= 2
            } else if (value[contentEnd - 1] === '\n') {
                contentEnd -= 1
            }
        }
        sections[marker] = value.slice(contentStart, contentEnd)
    }
    return sections
}

function stripJsonCodeFence(value) {
    const trimmed = value.trim()
    const matched = trimmed.match(/^```(?:javascript|js|json)?\s*\n([\s\S]*?)\n```$/i)
    return matched ? matched[1] : trimmed
}

function formatJsonSectionParseError(sectionMarker, error) {
    return `${sectionMarker} should be JSON. JSON5 parse error: ${error.message}`
}

function parseJsonSection(sectionMarker, value) {
    try {
        return JSON5.parse(stripJsonCodeFence(value))
    } catch (error) {
        throw new Error(formatJsonSectionParseError(sectionMarker, error))
    }
}

export function replaceMessageContext(message, messageDelta) {
    for (const key of MESSAGE_KEYS_IN_CONTEXT) {
        delete message[key]
    }
    for (const key of MESSAGE_KEYS_IN_CONTEXT) {
        const value = messageDelta[key]
        if (value == null) {
            continue
        }
        if (key !== 'content' && value === '') {
            continue
        }
        if (Array.isArray(value) && value.length === 0) {
            continue
        }
        message[key] = value
    }
    if (!('content' in message)) {
        message.content = ''
    }
}

export function formatMessageAsText(message, { formatContentAsText = formatSimpleContentAsText } = {}) {
    message = message || {}
    const sections = []

    const messageMeta = {}
    for (const key of MESSAGE_META_KEYS) {
        if (message[key]) {
            messageMeta[key] = message[key]
        }
    }
    if (Object.keys(messageMeta).length > 0) {
        sections.push({
            key: 'message_meta',
            text: serializeMessageSection(
                MESSAGE_CONTEXT_SECTION_MARKERS.message_meta,
                JSON.stringify(messageMeta, null, 2),
                { isJson: true },
            )
        })
    }

    if (message.reasoning) {
        sections.push({
            key: 'reasoning',
            text: serializeMessageSection(MESSAGE_CONTEXT_SECTION_MARKERS.reasoning, message.reasoning),
        })
    }

    const contentText = formatContentAsText(message.content)
    if (contentText) {
        sections.push({
            key: 'content',
            text: serializeMessageSection(MESSAGE_CONTEXT_SECTION_MARKERS.content, contentText),
            rawText: contentText,
        })
    }

    if (message.tool_calls?.length) {
        sections.push({
            key: 'tool_calls',
            text: serializeMessageSection(
                MESSAGE_CONTEXT_SECTION_MARKERS.tool_calls,
                JSON.stringify(message.tool_calls, null, 2),
                { isJson: true },
            )
        })
    }

    if (sections.length === 1 && sections[0].key === 'content') {
        return sections[0].rawText
    }
    return sections.map(section => section.text).filter(Boolean).join('\n')
}

export function parseMessageAsText(value, { parseContentAsText = x => x } = {}) {
    const nextMessage = Object.fromEntries(MESSAGE_KEYS_IN_CONTEXT.map(key => [key, undefined]))
    const sections = splitMessageSections(value)

    if (!sections) {
        nextMessage.content = parseContentAsText(value)
        return nextMessage
    }

    if (MESSAGE_CONTEXT_SECTION_MARKERS.message_meta in sections) {
        const messageMeta = parseJsonSection(
            MESSAGE_CONTEXT_SECTION_MARKERS.message_meta,
            sections[MESSAGE_CONTEXT_SECTION_MARKERS.message_meta],
        )
        if (Array.isArray(messageMeta) || typeof messageMeta !== 'object' || messageMeta == null) {
            throw new Error(`${MESSAGE_CONTEXT_SECTION_MARKERS.message_meta} should be a JSON object.`)
        }
        const unsupportedKeys = Object.keys(messageMeta).filter(key => !MESSAGE_META_KEYS.includes(key))
        if (unsupportedKeys.length > 0) {
            throw new Error(`Unsupported keys in MESSAGE_META: ${unsupportedKeys.join(', ')}`)
        }
        for (const key of MESSAGE_META_KEYS) {
            if (messageMeta[key]) {
                nextMessage[key] = messageMeta[key]
            }
        }
    }

    if (MESSAGE_CONTEXT_SECTION_MARKERS.reasoning in sections) {
        const reasoning = sections[MESSAGE_CONTEXT_SECTION_MARKERS.reasoning]
        if (reasoning) {
            nextMessage.reasoning = reasoning
        }
    }

    if (MESSAGE_CONTEXT_SECTION_MARKERS.content in sections) {
        nextMessage.content = parseContentAsText(sections[MESSAGE_CONTEXT_SECTION_MARKERS.content])
    }

    if (MESSAGE_CONTEXT_SECTION_MARKERS.tool_calls in sections) {
        const toolCalls = parseJsonSection(
            MESSAGE_CONTEXT_SECTION_MARKERS.tool_calls,
            sections[MESSAGE_CONTEXT_SECTION_MARKERS.tool_calls],
        )
        if (!Array.isArray(toolCalls)) {
            throw new Error(`${MESSAGE_CONTEXT_SECTION_MARKERS.tool_calls} should be a JSON array.`)
        }
        if (toolCalls.length > 0) {
            nextMessage.tool_calls = toolCalls
        }
    }

    return nextMessage
}
