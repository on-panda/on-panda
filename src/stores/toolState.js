import { deepCopy } from '../utils/commonUtils.js'

function contentItemToText(item) {
    if (item.type === 'text') {
        return item.text
    }
    if (item.type === 'resource') {
        return JSON.stringify(item.resource, null, 2)
    }
    return JSON.stringify(item, null, 2)
}

function contentItemToMessageContent(item) {
    if (item.type === 'text') {
        return [{ type: 'text', text: item.text }]
    }
    if (item.type === 'image') {
        return [{
            type: 'image_url',
            image_url: {
                url: `data:${item.mimeType};base64,${item.data}`,
            },
        }]
    }
    if (item.type === 'audio') {
        return [{
            type: 'audio_url',
            audio_url: {
                url: `data:${item.mimeType};base64,${item.data}`,
            },
        }]
    }
    return [{ type: 'text', text: contentItemToText(item) }]
}

function mcpToolResultToContent(result) {
    if (result.content?.length) {
        return result.content.flatMap((item, index) => (
            (index === 0 ? [] : [{ type: 'text', text: '\n' }]).concat(contentItemToMessageContent(item))
        ))
    }
    if (result.structuredContent !== undefined) {
        return JSON.stringify(result.structuredContent, null, 2)
    }
    if (result.toolResult !== undefined) {
        return JSON.stringify(result.toolResult, null, 2)
    }
    return ''
}

export function ToolStateClosure({ toolConfigs = [] } = {}) {
    let tools = []
    const toolNameToCall = {}
    let closers = []
    let initPromise = null

    async function init() {
        if (!initPromise) {
            initPromise = (async () => {
                const nextTools = []
                const toolNameToSource = {}
                const nextToolNameToCall = {}
                const nextClosers = []
                try {
                    const registerTool = (tool, source) => {
                        const toolName = tool.function.name
                        if (toolName in toolNameToSource) {
                            throw new Error(`Duplicated tool name "${toolName}" from ${toolNameToSource[toolName]} and ${source}.`)
                        }
                        toolNameToSource[toolName] = source
                        nextTools.push(tool)
                    }

                    for (const toolConfig of toolConfigs) {
                        if (toolConfig.type === 'function') {
                            registerTool(deepCopy(toolConfig), 'function tool config')
                            continue
                        }
                        if (toolConfig.type === 'mcp') {
                            const [{ Client }, { StreamableHTTPClientTransport }] = await Promise.all([
                                import('@modelcontextprotocol/sdk/client/index.js'),
                                import('@modelcontextprotocol/sdk/client/streamableHttp.js'),
                            ])
                            const transport = new StreamableHTTPClientTransport(new URL(toolConfig.server_url))
                            const client = new Client({
                                name: 'frontend-agent',
                                version: '0.1.0',
                            })
                            client.onerror = (error) => {
                                console.error('[OnPandaWeb MCP] Client error.', error)
                            }
                            await client.connect(transport)
                            nextClosers.push(() => transport.close())
                            const { tools: mcpTools } = await client.listTools()
                            for (const mcpTool of mcpTools) {
                                registerTool({
                                    type: 'function',
                                    function: {
                                        name: mcpTool.name,
                                        description: mcpTool.description,
                                        parameters: mcpTool.inputSchema,
                                    },
                                }, toolConfig.server_url)
                                nextToolNameToCall[mcpTool.name] = async (toolCall) => {
                                    const result = await client.callTool({
                                        name: mcpTool.name,
                                        arguments: JSON.parse(toolCall.function.arguments || '{}'),
                                    })
                                    return mcpToolResultToContent(result)
                                }
                            }
                            continue
                        }
                        throw new Error(`Unsupported tool config type: ${toolConfig.type}`)
                    }

                    tools = nextTools
                    for (const toolName in toolNameToCall) {
                        delete toolNameToCall[toolName]
                    }
                    Object.assign(toolNameToCall, nextToolNameToCall)
                    closers = nextClosers
                    return nextTools
                } catch (error) {
                    await Promise.allSettled(nextClosers.map(closeClient => closeClient()))
                    throw error
                }
            })()
            initPromise = initPromise.catch((error) => {
                initPromise = null
                throw error
            })
        }
        return initPromise
    }

    function isCallReady(toolCalls = []) {
        const isReadys = toolCalls.map(toolCall => toolCall.function?.name in toolNameToCall)
        return {
            isReadys,
            allReady: isReadys.every(Boolean),
        }
    }

    async function call(toolCalls = []) {
        await init()
        return await Promise.all(toolCalls.map(async (toolCall) => ({
            role: 'tool',
            content: await toolNameToCall[toolCall.function.name](toolCall),
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
        })))
    }

    async function close() {
        await Promise.all(closers.map(closeClient => closeClient()))
    }

    return {
        get tools() {
            return tools
        },
        init,
        isCallReady,
        call,
        toolNameToCall,
        close,
    }
}
