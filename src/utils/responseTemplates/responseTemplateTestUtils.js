const TOOL_REASONING = 'The user wants /tmp/a.txt, so I should read /tmp/a.txt with limit 10.'
const TOOL_ID = 'functions.read_file:0'
const READ_FILE_ARGUMENTS = '{"path": "/tmp/a.txt", "limit": 10}'

export const RESPONSE_TEMPLATE_TEST_TOOLS = [{
    type: 'function',
    function: {
        name: 'read_file',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string' },
                limit: { type: 'integer' },
            },
        },
    },
}]

export const PARTIAL_RESPONSE_TEMPLATE_TEST_CASES = [
    {
        name: 'stop_reasoning',
        message: {
            role: 'assistant',
            reasoning: '2 × 5 + 4 = 10 + 4 = 14.',
            content: '',
            finish_reason: 'reasoning_end',
        },
    },
    {
        name: 'resume_reasoning',
        message: {
            role: 'assistant',
            reasoning: '2 × 5 + 4 = 10 + 4 = 14',
        },
    },
    {
        name: 'stop_content',
        message: {
            role: 'assistant',
            reasoning: '2 × 5 + 4 = 10 + 4 = 14.',
            content: 'The answer is 14.',
            finish_reason: 'stop',
        },
    },
    {
        name: 'resume_content',
        message: {
            role: 'assistant',
            reasoning: '2 × 5 + 4 = 10 + 4 = 14.',
            content: 'The answer is 14',
        },
    },
    {
        name: 'bad_reasoning',
        message: {
            role: 'assistant',
            reasoning: 'The user wants /tmp/a.txt, so I should read /tmp/a.txt',
        },
    },
    {
        name: 'bad_content',
        message: {
            role: 'assistant',
            reasoning: TOOL_REASONING,
            content: 'I will call read_file tool to read `/tmp/a.txt`',
        },
    },
    {
        name: 'call_name',
        message: {
            role: 'assistant',
            reasoning: TOOL_REASONING,
            content: '',
            tool_calls: [{
                index: 0,
                type: 'function',
                id: TOOL_ID,
                function: { name: 'read_file' },
            }],
        },
    },
    {
        name: 'bad_argument_value',
        message: {
            role: 'assistant',
            reasoning: TOOL_REASONING,
            content: '',
            tool_calls: [{
                index: 0,
                type: 'function',
                id: TOOL_ID,
                function: { name: 'read_file', arguments: '{"path": "/tmp/a.txt' },
            }],
        },
    },
    {
        name: 'bad_argument_key',
        message: {
            role: 'assistant',
            reasoning: TOOL_REASONING,
            content: '',
            tool_calls: [{
                index: 0,
                type: 'function',
                id: TOOL_ID,
                function: { name: 'read_file', arguments: '{"path"' },
            }],
        },
    },
    {
        name: 'bad_argument_num',
        message: {
            role: 'assistant',
            reasoning: TOOL_REASONING,
            content: '',
            tool_calls: [{
                index: 0,
                type: 'function',
                id: TOOL_ID,
                function: { name: 'read_file', arguments: '{"path": "/tmp/a.txt", "limit"' },
            }],
        },
    },
    {
        name: 'bad_argument_arg2',
        message: {
            role: 'assistant',
            reasoning: TOOL_REASONING,
            content: '',
            tool_calls: [{
                index: 0,
                type: 'function',
                id: TOOL_ID,
                function: { name: 'read_file', arguments: '{"path": "/tmp/a.txt", "limit": 10' },
            }],
        },
    },
    {
        name: 'bad_argument_json',
        message: {
            role: 'assistant',
            reasoning: TOOL_REASONING,
            content: '',
            tool_calls: [{
                index: 0,
                type: 'function',
                id: TOOL_ID,
                function: { name: 'read_file', arguments: '{"path": "/tmp/a.txt"' },
            }],
        },
    },
    {
        name: 'no_call',
        message: {
            role: 'assistant',
            reasoning: TOOL_REASONING,
            content: 'I will call read_file tool to read `/tmp/a.txt` with limit 10.',
            tool_calls: [{}],
        },
    },
    {
        name: 'redundant_call',
        message: {
            role: 'assistant',
            reasoning: TOOL_REASONING,
            content: '',
            tool_calls: [{
                index: 0,
                type: 'function',
                id: TOOL_ID,
                function: { name: 'read_file', arguments: READ_FILE_ARGUMENTS },
            }],
            finish_reason: 'tool_calls',
        },
    },
]

function assertEqual(actual, expected, label) {
    if (actual !== expected) {
        throw new Error(`${label}\n  actual  : ${JSON.stringify(actual)}\n  expected: ${JSON.stringify(expected)}`)
    }
}

export function testPartialResponseTemplateRoundTrips({
    template,
    tools = RESPONSE_TEMPLATE_TEST_TOOLS,
} = {}) {
    for (const { name, message } of PARTIAL_RESPONSE_TEMPLATE_TEST_CASES) {
        const templatedPrompt = template.apply(message).templatedPrompt
        // Preserve completion markers while exercising the string parser.
        const tokens = message.finish_reason
            ? [{ delta: { content: templatedPrompt }, finish_reason: message.finish_reason }]
            : templatedPrompt
        const parsedMessage = template.parse({ tokens, tools })
        if (name === 'no_call') {
            assertEqual(
                JSON.stringify(parsedMessage.tool_calls),
                JSON.stringify([{}]),
                `${template.constructor.name} empty tool call`,
            )
        }
        assertEqual(
            template.apply(parsedMessage).templatedPrompt,
            templatedPrompt,
            `${template.constructor.name} ${name} round-trip`,
        )
    }
    return PARTIAL_RESPONSE_TEMPLATE_TEST_CASES.length
}
