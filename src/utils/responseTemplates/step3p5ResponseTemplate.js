import { Qwen3p5ResponseTemplate } from './qwen3p5ResponseTemplate.js'
import { testPartialResponseTemplateRoundTrips } from './responseTemplateTestUtils.js'

const xmlMarker = (name, closing = false) => ['<', closing ? '/' : '', name, '>'].join('')
const xmlValueMarker = (name) => ['<', name, '='].join('')
const THINK_BEGIN = xmlMarker('think')
const THINK_END = xmlMarker('think', true)
const TOOL_CALL_BEGIN = xmlMarker('tool_call')
const TOOL_CALL_END = xmlMarker('tool_call', true)
const FUNCTION_BEGIN = xmlValueMarker('function')
const FUNCTION_END = xmlMarker('function', true)
const PARAMETER_BEGIN = xmlValueMarker('parameter')
const PARAMETER_END = xmlMarker('parameter', true)

export class Step3p5ResponseTemplate extends Qwen3p5ResponseTemplate {
    static match({ responseTemplateConfig } = {}) {
        return /^stepfun-ai\/Step-3\.[5-9]-Flash(-|$)/i.test(responseTemplateConfig?.name_or_path || '')
    }

    constructor(options = {}) {
        super(options)
        this.reasoningContentSeparator = '\n'
        this.contentToolCallsSeparator = ''
        this.toolCallSeparator = ''
    }
}

export function testStep3p5ResponseTemplate() {
    const template = new Step3p5ResponseTemplate()
    const partialMessageTestCount = testPartialResponseTemplateRoundTrips({ template })
    const assertEqual = (actual, expected, label) => {
        if (actual !== expected) {
            throw new Error(`${label}\n  actual  : ${JSON.stringify(actual)}\n  expected: ${JSON.stringify(expected)}`)
        }
    }
    const tools = [{
        type: 'function',
        function: {
            name: 'get_weather',
            parameters: {
                type: 'object',
                properties: { location: { type: 'string' } },
            },
        },
    }]
    const message = {
        role: 'assistant',
        reasoning: 'I should check both cities.',
        content: 'I will check them now.',
        tool_calls: [
            {
                type: 'function',
                index: 0,
                function: {
                    name: 'get_weather',
                    arguments: '{"location": "New York City, NY"}',
                },
            },
            {
                type: 'function',
                index: 1,
                function: {
                    name: 'get_weather',
                    arguments: '{"location": "San Francisco, CA"}',
                },
            },
        ],
        finish_reason: 'tool_calls',
    }
    const expected = `${THINK_BEGIN}\nI should check both cities.\n${THINK_END}\n` +
        `I will check them now.${TOOL_CALL_BEGIN}\n${FUNCTION_BEGIN}get_weather>\n` +
        `${PARAMETER_BEGIN}location>\nNew York City, NY\n${PARAMETER_END}\n${FUNCTION_END}\n${TOOL_CALL_END}` +
        `${TOOL_CALL_BEGIN}\n${FUNCTION_BEGIN}get_weather>\n` +
        `${PARAMETER_BEGIN}location>\nSan Francisco, CA\n${PARAMETER_END}\n${FUNCTION_END}\n${TOOL_CALL_END}`
    const templatedPrompt = template.apply(message).templatedPrompt
    assertEqual(templatedPrompt, expected, 'complete response')

    const parsedMessage = template.parse({ tokens: expected, tools })
    parsedMessage.finish_reason = 'tool_calls'
    assertEqual(template.apply(parsedMessage).templatedPrompt, expected, 'complete response round-trip')

    const contentText = `${THINK_BEGIN}\nthink\n${THINK_END}\nanswer`
    const parsedContent = template.parse({ tokens: contentText })
    assertEqual(parsedContent.reasoning, 'think', 'reasoning parse')
    assertEqual(parsedContent.content, 'answer', 'content parse')
    assertEqual(template.apply(parsedContent).templatedPrompt, contentText, 'content round-trip')

    const partialMessage = {
        role: 'assistant',
        reasoning: 'think',
        content: '',
        tool_calls: [{
            index: 0,
            type: 'function',
            function: {
                name: 'get_weather',
                arguments: '{"location": "New York',
            },
        }],
    }
    const partialText = `${THINK_BEGIN}\nthink\n${THINK_END}\n${TOOL_CALL_BEGIN}\n` +
        `${FUNCTION_BEGIN}get_weather>\n${PARAMETER_BEGIN}location>\nNew York`
    assertEqual(template.apply(partialMessage).templatedPrompt, partialText, 'partial arguments apply')
    const parsedPartial = template.parse({ tokens: partialText, tools })
    assertEqual(template.apply(parsedPartial).templatedPrompt, partialText, 'partial arguments round-trip')

    const openToolCallsMessage = {
        role: 'assistant',
        reasoning: 'think',
        content: 'answer',
        tool_calls: [],
    }
    const openToolCallsText = `${THINK_BEGIN}\nthink\n${THINK_END}\nanswer${TOOL_CALL_BEGIN}`
    assertEqual(template.apply(openToolCallsMessage).templatedPrompt, openToolCallsText, 'open tool calls channel')
    const parsedOpenToolCalls = template.parse({ tokens: openToolCallsText })
    assertEqual(parsedOpenToolCalls.tool_calls.length, 1, 'parse open tool calls channel')
    assertEqual(Object.keys(parsedOpenToolCalls.tool_calls[0]).length, 0, 'empty open tool call')
    assertEqual(template.apply(parsedOpenToolCalls).templatedPrompt, openToolCallsText, 'open tool calls round-trip')

    for (let version = 5; version <= 9; version++) {
        assertEqual(Step3p5ResponseTemplate.match({
            responseTemplateConfig: { name_or_path: `stepfun-ai/Step-3.${version}-Flash` },
        }), true, `Step-3.${version} match`)
    }
    assertEqual(Step3p5ResponseTemplate.match({
        responseTemplateConfig: { name_or_path: 'stepfun-ai/Step-3.4-Flash' },
    }), false, 'Step-3.4 mismatch')
    assertEqual(Step3p5ResponseTemplate.match({
        responseTemplateConfig: { name_or_path: 'step3p7-mm-fp8-mtp3-it100' },
    }), false, 'internal checkpoint mismatch')
    return partialMessageTestCount + 17
}
