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