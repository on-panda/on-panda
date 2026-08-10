const JSON_SPACES = ' \t\n\r'

function skipJsonSpaces(text, cursor) {
    while (cursor < text.length && JSON_SPACES.includes(text[cursor])) {
        cursor += 1
    }
    return cursor
}

function findJsonStringEnd(text, quoteStart) {
    // Index of the closing quote, -1 when the string is still open.
    for (var cursor = quoteStart + 1; cursor < text.length; cursor += 1) {
        if (text[cursor] === '\\') {
            cursor += 1
        } else if (text[cursor] === '"') {
            return cursor
        }
    }
    return -1
}

function findJsonValueEnd(text, valueStart) {
    // Index right after the value, -1 when the value is still growing.
    if (text[valueStart] === '"') {
        const stringEnd = findJsonStringEnd(text, valueStart)
        return stringEnd === -1 ? -1 : stringEnd + 1
    }
    if (text[valueStart] === '[' || text[valueStart] === '{') {
        var depth = 0
        for (var cursor = valueStart; cursor < text.length; cursor += 1) {
            if (text[cursor] === '"') {
                const stringEnd = findJsonStringEnd(text, cursor)
                if (stringEnd === -1) {
                    return -1
                }
                cursor = stringEnd
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
    // A number prefix such as '1' can still grow into '10', while a spelled out literal cannot grow.
    return ['true', 'false', 'null'].includes(text.slice(valueStart)) ? text.length : -1
}

function decodeJsonStringPrefix(rawText) {
    // A prefix can stop inside an escape such as '\u12', which is not decodable yet.
    const danglingEscape = rawText.match(/(?:^|[^\\])(?:\\\\)*(\\(?:u[0-9a-fA-F]{0,3})?)$/)
    try {
        return JSON.parse(`"${danglingEscape ? rawText.slice(0, -danglingEscape[1].length) : rawText}"`)
    } catch {
        return null
    }
}

export function parsePartialJsonObject(text = '') {
    // Scan a JSON object prefix, such as tool call arguments a model is still writing.
    // entry.value is undefined before the value starts, the partial value text while the value grows,
    // and the parsed JSON value once entry.complete is true.
    // Returns null when the text cannot be a prefix of a JSON object.
    const entries = []
    var cursor = skipJsonSpaces(text, 0)
    if (cursor === text.length) {
        return { entries, complete: false }
    }
    if (text[cursor] !== '{') {
        return null
    }
    cursor = skipJsonSpaces(text, cursor + 1)
    while (cursor < text.length) {
        if (text[cursor] === '}') {
            return skipJsonSpaces(text, cursor + 1) === text.length ? { entries, complete: true } : null
        }
        if (text[cursor] !== '"') {
            return null
        }
        const nameEnd = findJsonStringEnd(text, cursor)
        const name = decodeJsonStringPrefix(text.slice(cursor + 1, nameEnd === -1 ? text.length : nameEnd))
        if (name === null) {
            return null
        }
        const entry = { name, nameComplete: nameEnd !== -1, complete: false }
        entries.push(entry)
        if (nameEnd === -1) {
            return { entries, complete: false }
        }
        cursor = skipJsonSpaces(text, nameEnd + 1)
        if (cursor === text.length) {
            return { entries, complete: false }
        }
        if (text[cursor] !== ':') {
            return null
        }
        cursor = skipJsonSpaces(text, cursor + 1)
        if (cursor === text.length) {
            return { entries, complete: false }
        }
        const valueEnd = findJsonValueEnd(text, cursor)
        if (valueEnd === -1) {
            const partialValue = text[cursor] === '"'
                ? decodeJsonStringPrefix(text.slice(cursor + 1))
                : text.slice(cursor)
            if (partialValue === null) {
                return null
            }
            entry.value = partialValue
            return { entries, complete: false }
        }
        try {
            entry.value = JSON.parse(text.slice(cursor, valueEnd))
        } catch {
            return null
        }
        entry.complete = true
        cursor = skipJsonSpaces(text, valueEnd)
        if (cursor === text.length) {
            return { entries, complete: false }
        }
        if (text[cursor] === '}') {
            return skipJsonSpaces(text, cursor + 1) === text.length ? { entries, complete: true } : null
        }
        if (text[cursor] !== ',') {
            return null
        }
        cursor = skipJsonSpaces(text, cursor + 1)
    }
    return { entries, complete: false }
}
