const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor
const MAX_TEXT_LENGTH = 256 * 1024
const MEMORY_MAX_LINES = 200
const MEMORY_MAX_CHARS = 60000
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
    description: 'Run JavaScript in the current browser runtime and return logs from `console.log`. `console.log` accepts `Blob` arguments of MCP-supported image, audio, and video types, returned as inline media in your context. Each tool call uses a fresh local scope, so local variables do not persist across calls, but shared globals like window and document do persist. Your JavaScript local scope includes a `browserAgent` variable. For content that should be reused across tool calls, prefer storing it on the `browserAgent.local` object. You can access the internet under CORS restrictions. Do not refresh or switch the current webpage, as this will reset the JavaScript runtime and your context lost.',
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

async function ensureBrowserAgentMemory() {
    const root = await navigator.storage.getDirectory()
    const browserAgentDir = await root.getDirectoryHandle('browser-agent', { create: true })
    const memoryDir = await browserAgentDir.getDirectoryHandle('memory', { create: true })
    const memoryFile = await memoryDir.getFileHandle('MEMORY.md', { create: true })
    return await (await memoryFile.getFile()).text()
}

function truncateBrowserAgentMemory(memoryText = '') {
    const lines = memoryText.split('\n')
    const reasons = []
    let text = lines.length > MEMORY_MAX_LINES
        ? lines.slice(0, MEMORY_MAX_LINES).join('\n')
        : memoryText

    if (lines.length > MEMORY_MAX_LINES) {
        reasons.push(`original ${lines.length} lines exceeded ${MEMORY_MAX_LINES} lines`)
    }
    if (memoryText.length > MEMORY_MAX_CHARS) {
        reasons.push(`original ${memoryText.length} characters exceeded ${MEMORY_MAX_CHARS} characters`)
    }
    if (text.length > MEMORY_MAX_CHARS) {
        text = text.slice(0, MEMORY_MAX_CHARS)
    }

    return {
        text,
        truncationReason: reasons.length
            ? `Truncated: ${reasons.join('; ')}. So, find an opportunity to organize the memory: clean up or archive outdated or unimportant information, move less important content out of the MEMORY.md into other files or folders under \`browser-agent/memory/\`, and keep only brief descriptions and references in the MEMORY.md so you can read the archived content later when needed.`
            : '',
    }
}

async function buildBrowserAgentMemoryInstructions() {
    const overview = `## Persistent memory
Persistent memory is stored in files or folders under \`browser-agent/memory/\` in the current origin's OPFS. Use \`run_browser_js\` and \`navigator.storage.getDirectory()\` to record, modify, and query memory when needed. \`browser-agent/memory/MEMORY.md\` is always loaded into your conversation context. Keep it concise; it is truncated after ${MEMORY_MAX_LINES} lines or ${MEMORY_MAX_CHARS} characters.`
    const memoryText = await ensureBrowserAgentMemory()
    if (!memoryText.trim()) {
        return `${overview}
The current \`browser-agent/memory/MEMORY.md\` is empty.`
    }

    const { text, truncationReason } = truncateBrowserAgentMemory(memoryText)

    return `${overview}
### the MEMORY.md
<|browser_agent_memory_start|>
${text}
<|browser_agent_memory_end|>${truncationReason ? `\n${truncationReason}` : ''}`
}

async function runBrowserJs(code = '', buildBrowserAgent) {
    // entries preserve temporal order across console.log / console.error / terminal exception
    // - { kind: 'log', row: Array<string | { type, mimeType, data }> }: log row, items joined by ' ', rows by '\n'
    // - { kind: 'error', text: string }: a single wrapped error block, rendered as its own text segment
    const entries = []
    const pendingBlobs = []
    const startTime = performance.now()
    const customConsole = {
        ...console,
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
    const browserAgent = buildBrowserAgent({ callScope: { console: customConsole } })

    try {
        await new AsyncFunction('console', 'browserAgent', code)(customConsole, browserAgent)
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

async function handleJsonRpcMessage({ message = {}, instructions = '', buildBrowserAgent } = {}) {
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
            const content = await runBrowserJs(message.params.arguments?.code || '', buildBrowserAgent)
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

async function buildBrowserAgentMcpInstructions({ proxyPath = '' } = {}) {
    const corsInternetSupplement = proxyPath
        ? `\n    - Fallback: for critical resources that even cors-internet cannot reach, use the server-side proxy at \`${proxyPath}/{url}\`.`
        : ''

    return `You are an agent running in a browser. You are operating in the JavaScript runtime of the current webpage, where the user interacts with you. Please make the appropriate adjustments for this browser JavaScript environment.

## Skills
A skill is a set of instructions to follow that is stored in a \`SKILL.md\` file. Below is the list of skills that can be used. Each entry includes a name, description, and skillUrl so you can open the source for full instructions when using a specific skill.
### Available skills
- \`cors-internet\`: Skill for web search and information retrieval under CORS. Use when you need to access the internet. ([skillUrl](https://raw.githubusercontent.com/on-panda/browser-agent-skills/main/skills/cors-internet/SKILL.md))${corsInternetSupplement}
- \`interactive-webpage\`: Use when you need to create webpages or interactive artifacts, or modify the current UI. ([skillUrl](https://raw.githubusercontent.com/on-panda/browser-agent-skills/main/skills/interactive-webpage/SKILL.md))
- \`user-local-files\`: Use when the user shares local files, indicated by \`<|user_local_files\` in the context. Includes local filesystem read/write guidelines and common tools. ([skillUrl](https://raw.githubusercontent.com/on-panda/browser-agent-skills/main/skills/user-local-files/SKILL.md))
### How to load skills
If the task clearly matches a skill's description shown above, using tool "run_browser_js" with this pattern code to load the skill:
\`\`\`js
await fetch(skillUrl).then(res => res.text()).then(console.log)
\`\`\`

${await buildBrowserAgentMemoryInstructions()}`
}

export function BrowserAgentMcpClosure({ buildBrowserAgent, proxyPath = '' } = {}) {
    return {
        localFetch: async function localFetch(_input, init = {}) {
            if ((init.method || 'GET') !== 'POST') {
                return new Response(null, { status: 405 })
            }
            const message = JSON.parse(init.body || '{}')
            return await handleJsonRpcMessage({
                message,
                instructions: message.method === 'initialize' ? await buildBrowserAgentMcpInstructions({ proxyPath }) : '',
                buildBrowserAgent,
            })
        },
    }
}
