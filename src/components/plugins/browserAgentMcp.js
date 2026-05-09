const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor
const MAX_TEXT_LENGTH = 256 * 1024
const SUPPORTED_BLOB_CHUNK_TYPES = {
    'image/png': 'image',
    'image/jpeg': 'image',
    'image/gif': 'image',
    'image/webp': 'image',
    'audio/wav': 'audio',
    'audio/mp3': 'audio',
    'audio/mpeg': 'audio',
    'video/mp4': 'video',
    'video/webm': 'video',
    'video/quicktime': 'video',
}

const runBrowserJsTool = {
    name: 'run_browser_js',
    description: 'Run JavaScript in the current browser runtime and returns logs from `console.log`. `console.log` accepts `Blob` arguments of MCP-supported image, audio, and video types, returned as inline media in your context. Each call uses a fresh local scope, so local variables do not persist across calls, but shared globals like window and document do persist. You can access the internet under CORS restrictions.',
    inputSchema: {
        type: 'object',
        properties: {
            code: {
                type: 'string',
                description: 'If your code starts any async work, such as fetch, promises, or async functions, await it with top-level await or await the returned promise; otherwise the tool may return before later logs run. Do not rely on un-awaited .then() callbacks for console.log output.',
            },
        },
    },
}

const renderSvgTool = {
    name: 'render_svg',
    description: 'Render an SVG string into a bitmap PNG image. The tool uses the SVG width/height, or falls back to viewBox.',
    inputSchema: {
        type: 'object',
        properties: {
            svg: {
                type: 'string',
                description: 'SVG markup to render. It must start with `<svg` and end with `</svg>`.',
            },
        },
    },
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
            const result = reader.result
            resolve(result.slice(result.indexOf(',') + 1))
        }
        reader.onerror = reject
        reader.readAsDataURL(blob)
    })
}

function buildJsErrorText(message = '') {
    return `<|js_error_start|>\n${message}\n<|js_error_end|>`
}

function truncateLongText(text = '', maxTextLength = MAX_TEXT_LENGTH) {
    if (text.length <= maxTextLength) {
        return text
    }

    const prefixLength = Math.ceil(maxTextLength / 2)
    const suffixLength = maxTextLength - prefixLength
    const omittedLength = text.length - maxTextLength

    return `(Total length: ${text.length} characters. Showing ${maxTextLength} characters after truncating the middle.)
${text.slice(0, prefixLength)}
<|truncate_long_text|>
{Output exceeded ${maxTextLength} characters. Omitted ${omittedLength} characters from the middle.} ......
<|truncate_long_text|>
${text.slice(text.length - suffixLength)}`
}

async function runBrowserJs(code = '', browserAgentRuntime) {
    // entries preserve temporal order across console.log / console.error / terminal exception
    // - { kind: 'log', row: Array<string | { type, mimeType, data }> }: log row, items joined by ' ', rows by '\n'
    // - { kind: 'error', text: string }: a single wrapped error block, rendered as its own text segment
    const entries = []
    const pendingBlobs = []
    const startTime = performance.now()
    const customConsole = {
        ...console,
        browserAgentRuntime,
        log(...args) {
            const row = args.map(arg => {
                const chunkType = arg instanceof Blob ? SUPPORTED_BLOB_CHUNK_TYPES[arg.type] : null
                if (chunkType) {
                    const chunk = { type: chunkType, mimeType: arg.type, data: '' }
                    pendingBlobs.push(blobToBase64(arg).then(b64 => { chunk.data = b64 }))
                    return chunk
                }
                return String(arg)
            })
            entries.push({ kind: 'log', row })
            console.log('[run_browser_js.log]:', ...args)
        },
        error(...args) {
            const s = args.map(arg => String(arg)).join(' ')
            entries.push({ kind: 'error', text: buildJsErrorText(s) })
            console.log('[run_browser_js.error]:', s)
        },
    }

    try {
        await new AsyncFunction('console', 'browserAgentRuntime', code)(customConsole, browserAgentRuntime)
    } catch (error) {
        const s = String(error)
        entries.push({ kind: 'error', text: buildJsErrorText(s) })
        console.log('[run_browser_js.error]:', s)
    }

    await Promise.all(pendingBlobs)

    const executionTimeMs = Math.round(performance.now() - startTime)
    const content = [{
        type: 'text',
        text: `<|execution_info_start|>\nCode execution time: ${executionTimeMs} ms\n<|execution_info_end|>`,
    }]
    if (!entries.some(e => e.kind === 'log')) {
        content.push({ type: 'text', text: '<|no_js_log|>' })
    }

    let textBuf = ''
    const flushText = () => {
        if (textBuf) {
            content.push({ type: 'text', text: truncateLongText(textBuf) })
            textBuf = ''
        }
    }
    entries.forEach(entry => {
        if (entry.kind === 'log') {
            entry.row.forEach((item, itemIdx) => {
                if (typeof item === 'string') {
                    if (textBuf) textBuf += (itemIdx === 0 ? '\n' : ' ')
                    textBuf += item
                } else {
                    flushText()
                    content.push(item)
                }
            })
        } else {
            flushText()
            content.push({ type: 'text', text: truncateLongText(entry.text) })
        }
    })
    flushText()

    return content
}

async function renderSvg(svg = '') {
    const objectUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    try {
        const image = await new Promise((resolve, reject) => {
            const nextImage = new Image()
            nextImage.onload = () => resolve(nextImage)
            nextImage.onerror = reject
            nextImage.src = objectUrl
        })
        const svgElement = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement
        const width = Number.parseFloat(svgElement.getAttribute('width'))
        const height = Number.parseFloat(svgElement.getAttribute('height'))
        const viewBoxValues = (svgElement.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number)
        const canvas = document.createElement('canvas')
        canvas.width = Number.isFinite(width) && Number.isFinite(height)
            ? width
            : (viewBoxValues.length === 4 ? viewBoxValues[2] : image.naturalWidth)
        canvas.height = Number.isFinite(width) && Number.isFinite(height)
            ? height
            : (viewBoxValues.length === 4 ? viewBoxValues[3] : image.naturalHeight)
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
        return canvas.toDataURL('image/png').slice('data:image/png;base64,'.length)
    } finally {
        URL.revokeObjectURL(objectUrl)
    }
}

function buildJsonResponse(body, init = {}) {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: {
            'content-type': 'application/json',
        },
        ...init,
    })
}

function buildJsonResultResponse(id, result) {
    return buildJsonResponse({
        jsonrpc: '2.0',
        id,
        result,
    })
}

function buildJsonErrorResponse(id, code, message) {
    return buildJsonResponse({
        jsonrpc: '2.0',
        id,
        error: {
            code,
            message,
        },
    })
}

async function handleJsonRpcMessage({ message = {}, instructions = '', browserAgentRuntime } = {}) {
    if (message.method === 'initialize') {
        return buildJsonResultResponse(message.id, {
            protocolVersion: message.params.protocolVersion,
            capabilities: {
                tools: {},
            },
            serverInfo: {
                name: 'browser-agent-mcp',
                version: '0.1.0',
            },
            instructions: instructions
        })
    }

    if (message.method === 'ping') {
        return buildJsonResultResponse(message.id, {})
    }

    if (message.method === 'tools/list') {
        return buildJsonResultResponse(message.id, {
            tools: [runBrowserJsTool, renderSvgTool],
        })
    }

    if (message.method === 'tools/call') {
        if (message.params.name === 'run_browser_js') {
            const content = await runBrowserJs(message.params.arguments?.code || '', browserAgentRuntime)
            return buildJsonResultResponse(message.id, { content })
        }
        if (message.params.name === 'render_svg') {
            const output = await renderSvg(message.params.arguments?.svg || '')
            return buildJsonResultResponse(message.id, {
                content: [{ type: 'image', mimeType: 'image/png', data: output }],
            })
        }
        return buildJsonErrorResponse(message.id, -32601, `Tool not found: ${message.params.name}`)
    }

    if (message.id == null) {
        return new Response(null, { status: 204 })
    }

    return buildJsonErrorResponse(message.id, -32601, `Method not found: ${message.method}`)
}

export function BrowserAgentMcpClosure({ browserAgentRuntime, proxyPath = '' } = {}) {
    const corsInternetSupplement = proxyPath
        ? `\n    - Fallback: for critical resources that even cors-internet cannot reach, use the server-side proxy at \`${proxyPath}/{url}\`.`
        : ''

    const instructions = `You are an agent running in a browser. You are operating in the JavaScript runtime of the current webpage, where the user interacts with you. So, make corresponding adaptations and adjustments for this browser JavaScript environment.

## Skills
A skill is a set of instructions to follow that is stored in a \`SKILL.md\` file. Below is the list of skills that can be used. Each entry includes a name, description, and skillUrl so you can open the source for full instructions when using a specific skill.
### Available skills
- cors-internet: Browser JS agent patterns for web search and information retrieval under CORS. Use when you need to access the internet for any information acquisition. ([skillUrl](https://raw.githubusercontent.com/on-panda/browser-agent-skills/main/skills/cors-internet/SKILL.md))${corsInternetSupplement}
- browser-screenshot: Browser screenshot patterns, used when taking screenshots or streaming. ([skillUrl](https://raw.githubusercontent.com/on-panda/browser-agent-skills/main/skills/browser-screenshot/SKILL.md))
### How to load skills
If the task clearly matches a skill's description shown above, using tool "run_browser_js" with this pattern code to load the skill:
\`\`\`js
await fetch(skillUrl).then(res => res.text()).then(console.log)
\`\`\``

    return {
        localFetch: async function localFetch(_input, init = {}) {
            if ((init.method || 'GET') !== 'POST') {
                return new Response(null, { status: 405 })
            }
            return await handleJsonRpcMessage({
                message: JSON.parse(init.body || '{}'),
                instructions,
                browserAgentRuntime,
            })
        },
    }
}
