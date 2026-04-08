const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor

const runBrowserJsDescription = 'Run JavaScript in the current browser runtime. Each call uses a fresh local scope, so local variables do not persist across calls, but shared globals like window and document do persist. console.log and console.error arguments are converted with String(...), so objects become [object Object].'

const runBrowserJsTool = {
    name: 'run_browser_js',
    description: runBrowserJsDescription,
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

function stringifyLogArgs(args = []) {
    return args.map(arg => String(arg)).join(' ')
}

function buildJsErrorText(message = '') {
    return `<|js_error_start|>\n${message}\n<|js_error_end|>`
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

    return logs.concat(errors).join('\n')
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
            tools: [runBrowserJsTool],
        })
    }

    if (message.method === 'tools/call') {
        if (message.params.name !== 'run_browser_js') {
            return buildJsonErrorResponse(message.id, -32601, `Tool not found: ${message.params.name}`)
        }
        const output = await runBrowserJs(message.params.arguments?.code || '')
        return buildJsonResultResponse(message.id, {
            content: output ? [{ type: 'text', text: output }] : [],
        })
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
