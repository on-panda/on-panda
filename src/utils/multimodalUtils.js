import { base64ToBlob } from "./commonUtils.js"

// Some APIs require an explicit mimeType for a media URL, and it also tells which multimodal chunk type a URL is.
const MIME_TYPE_BY_FILE_EXTENSION = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
    wav: 'audio/wav',
    mp3: 'audio/mp3',
    aiff: 'audio/aiff',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
    mp4: 'video/mp4',
    mpeg: 'video/mpeg',
    mpg: 'video/mpg',
    mov: 'video/mov',
    avi: 'video/avi',
    flv: 'video/x-flv',
    webm: 'video/webm',
    wmv: 'video/wmv',
    '3gpp': 'video/3gpp',
}

export function multimodalUrlToMimeType(url) {
    const mimeType = MIME_TYPE_BY_FILE_EXTENSION[new URL(url).pathname.split('.').pop().toLowerCase()]
    if (!mimeType) {
        throw new Error(`Can not infer the mimeType from the file extension of URL: ${url}`)
    }
    return mimeType
}

export function multimodalChunkStringToObject(objStr, chunkCache, strict = true) {
    // `[image_url_1](blob:...)` reads the chunk from the cache, while `[video_url](https://...)` and
    // `[](https://xxx.mp4)` keep the URL editable, the latter infers the type from the file extension.
    const m = objStr.match(/^\[([A-Za-z0-9-_]*)\]\((.*)\)$/)
    if (m) {
        const label = m[1]
        const url = m[2]
        if (/_\d+$/.test(label)) {
            var obj = chunkCache[label]
            if (!obj) {
                console.error('Chunk not found in cache:', label);
            }
        } else {
            const type = label || `${multimodalUrlToMimeType(url).split('/')[0]}_url`
            var obj = { type: type, [type]: { url: url } }
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