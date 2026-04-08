const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor
const MAX_TEXT_LENGTH = 256 * 1024

const runBrowserJsTool = {
    name: 'run_browser_js',
    description: 'Run JavaScript in the current browser runtime. Each call uses a fresh local scope, so local variables do not persist across calls, but shared globals like window and document do persist. console.log and console.error arguments are converted with String(...), so objects become [object Object].',
    inputSchema: {
        type: 'object',
        properties: {
            code: {
                type: 'string',
                description: 'JavaScript code to run in the current browser runtime.',
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
    const customConsole = {
        ...console,
        log(...args) {
            logs.push(stringifyLogArgs(args))
        },
        error(...args) {
            errors.push(buildJsErrorText(stringifyLogArgs(args)))
        },
    }

    try {
        await new AsyncFunction('console', code)(customConsole)
    } catch (error) {
        errors.push(buildJsErrorText(String(error)))
    }

    return truncateLongText((logs.length ? logs : ['<|no_js_log|>']).concat(errors).join('\n'))
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
                name: 'javascript-environment-mcp',
                version: '0.1.0',
            },
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
