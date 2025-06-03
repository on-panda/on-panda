import { base64ToBlob } from "./commonUtils.js"

export function multimodalChunkStringToObject(objStr, chunkCache, strict = true) {
    const m = objStr.match(/^\[([A-Za-z0-9-_]+)_(\d+)\]\(.*\)$/)
    if (m) {
        const type = m[1]
        const index = m[2]
        const cacheIndex = `${type}_${index}`
        var obj = chunkCache[cacheIndex]
        if (!obj) {
            console.error('Chunk not found in cache:', cacheIndex);
        }
    } else {
        try {
            var obj = JSON.parse(objStr);
        } catch (e) {
            if (strict) {
                console.error(`Failed to parse JSON object: ${objStr}`, e);
            } else {
                var obj = { type: 'text', content: objStr }
            }
        }
    }
    return obj
}

export function multimodalChunkObjectToBase64(chunk) {
    const type = chunk.type
    var blob_url, base64_url
    if (typeof chunk[type] === 'object') {
        if (typeof chunk[type]['url'] === 'string' && chunk[type]['url'].startsWith('data:')) {
            blob_url = base64ToBlob(chunk[type]['url'])
            base64_url = chunk[type]['url']
        }
        if (type.startsWith("input_") && typeof chunk[type]['data'] === 'string' && typeof chunk[type]['format'] === 'string') {
            base64_url = `data:${type.slice(6)}/${chunk[type]['format']};base64,${chunk[type]['data']}`
            blob_url = base64ToBlob(base64_url)
        }
        return {
            base64_url: base64_url, blob_url: blob_url,
            //modal_type: 
        }
    }

}