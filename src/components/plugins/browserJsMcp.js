const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor
const MAX_TEXT_LENGTH = 256 * 1024

const instructions = `You are an agent running in a browser. The current webpage is a Vite + Vue3-based LLM chat UI, through which the user communicates with you. This webpage contains all of your information and context; if the webpage is closed, your session is interrupted, and all information will be lost, just like variables in the webpage. You can read and modify the interface through JavaScript. You should remember that you are operating in a browser environment and make corresponding adaptations and adjustments.

## Skills
A skill is a set of instructions to follow that is stored in a \`SKILL.md\` file. Below is the list of skills that can be used. Each entry includes a name, description, and skillUrl so you can open the source for full instructions when using a specific skill.
### Available skills
- cors-internet: Browser JS agent patterns for web search and information retrieval under CORS. Use when the you needs to access the internet for any information acquisition. ([skillUrl](https://raw.githubusercontent.com/on-panda/browser-agent-skills/main/skills/cors-internet/SKILL.md))
- browser-screenshot: Browser screenshot patterns, used when taking screenshots or streaming. ([skillUrl](https://raw.githubusercontent.com/on-panda/browser-agent-skills/main/skills/browser-screenshot/SKILL.md))
### How to load skills
If the task clearly matches a skill's description shown above, using tool "run_browser_js" with this pattern code to load the skill:
\`\`\`js
await fetch(skillUrl).then(res => res.text()).then(console.log)
\`\`\``

const runBrowserJsTool = {
    name: 'run_browser_js',
    description: 'Run JavaScript in the current browser runtime and returns strings within `console.log`. Each call uses a fresh local scope, so local variables do not persist across calls, but shared globals like window and document do persist. You can access the internet under CORS restrictions. The current web page is where users interact with you, so do not replace the entire document.body.',
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

function stringifyLogArgs(args = []) {
    return args.map(arg => String(arg)).join(' ')
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

async function runBrowserJs(code = '') {
    const logs = []
    const errors = []
    const startTime = performance.now()
    const customConsole = {
        ...console,
        log(...args) {
            const s = stringifyLogArgs(args)
            logs.push(s)
            console.log('[run_browser_js.log]:', s)
        },
        error(...args) {
            const s = stringifyLogArgs(args)
            errors.push(buildJsErrorText(s))
            console.log('[run_browser_js.error]:', s)
        },
    }

    try {
        await new AsyncFunction('console', code)(customConsole)
    } catch (error) {
        const s = String(error)
        errors.push(buildJsErrorText(s))
        console.log('[run_browser_js.error]:', s)
    }

    const executionTimeMs = Math.round(performance.now() - startTime)

    return truncateLongText([
        `<|execution_info_start|>
Code execution time: ${executionTimeMs} ms
<|execution_info_end|>`,
        ...(logs.length ? logs : ['<|no_js_log|>']),
        ...errors,
    ].join('\n'))
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

async function handleJsonRpcMessage(message = {}) {
    if (message.method === 'initialize') {
        return buildJsonResultResponse(message.id, {
            protocolVersion: message.params.protocolVersion,
            capabilities: {
                tools: {},
            },
            serverInfo: {
                name: 'browser-js-mcp',
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
            const output = await runBrowserJs(message.params.arguments?.code || '')
            return buildJsonResultResponse(message.id, {
                content: output ? [{ type: 'text', text: output }] : [],
            })
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

export async function localFetch(_input, init = {}) {
    if ((init.method || 'GET') !== 'POST') {
        return new Response(null, { status: 405 })
    }
    return await handleJsonRpcMessage(JSON.parse(init.body || '{}'))
}
