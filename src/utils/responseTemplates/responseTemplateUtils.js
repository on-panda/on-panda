export function normalizeMessageToolCalls({ message, messages = [] } = {}) {
    if (!message.tool_calls?.length || (
        message.tool_calls.length === 1 && !Object.keys(message.tool_calls[0]).length
    )) {
        return message
    }

    message.tool_calls = message.tool_calls.filter(Boolean)
    const usedToolCallIds = new Set()
    var previousToolCallCount = 0
    for (const previousMessage of messages) {
        for (const toolCall of previousMessage.tool_calls || []) {
            if (!toolCall) {
                continue
            }
            previousToolCallCount += 1
            if (toolCall.id) {
                usedToolCallIds.add(toolCall.id)
            }
        }
    }
    for (const toolCall of message.tool_calls) {
        if (toolCall.id) {
            usedToolCallIds.add(toolCall.id)
        }
    }

    for (const [toolCallIndex, toolCall] of message.tool_calls.entries()) {
        toolCall.index = toolCallIndex
        if (toolCall.id) {
            continue
        }
        if (!toolCall.function?.name) {
            continue
        }
        var toolCallIdIndex = previousToolCallCount + toolCallIndex
        var toolCallId = `functions.${toolCall.function.name}:${toolCallIdIndex}`
        while (usedToolCallIds.has(toolCallId)) {
            toolCallIdIndex += 1
            toolCallId = `functions.${toolCall.function.name}:${toolCallIdIndex}`
        }
        toolCall.id = toolCallId
        usedToolCallIds.add(toolCallId)
    }
    return message
}
