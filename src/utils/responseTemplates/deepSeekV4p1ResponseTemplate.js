import { DeepSeekV4ResponseTemplate } from './deepSeekV4ResponseTemplate.js'
import { testPartialResponseTemplateRoundTrips } from './responseTemplateTestUtils.js'

export class DeepSeekV4p1ResponseTemplate extends DeepSeekV4ResponseTemplate {
    static match({ responseTemplateConfig } = {}) {
        return /^deepseek-ai\/DeepSeek-V4\.1-Flash(?:-|$)/i.test(responseTemplateConfig?.name_or_path || '')
    }

    constructor(options = {}) {
        super(options)
        this.toolCallsBlockName = ' calls'
        this.toolCallTagName = ' invoke'
        this.parameterTagName = ' parameter'
        this.toolCallsBegin = ['<', '｜DSML｜', this.toolCallsBlockName, '>'].join('')
        this.toolCallsEnd = ['</', '｜DSML｜', this.toolCallsBlockName, '>'].join('')
    }
}

export function testDeepSeekV4p1ResponseTemplate() {
    const template = new DeepSeekV4p1ResponseTemplate()
    const partialMessageTestCount = testPartialResponseTemplateRoundTrips({ template })
    const marker = (name, closing = false) => ['<', closing ? '/' : '', '｜DSML｜', name, '>'].join('')
    const think = (closing = false) => ['<', closing ? '/' : '', 'think', '>'].join('')
    const invoke = ['<', '｜DSML｜', ' invoke name="'].join('')
    const parameter = ['<', '｜DSML｜', ' parameter name="'].join('')
    const parsed = template.parse({
        tokens: think() + 'thinking' + think(true) + 'answer\n\n' + template.toolCallsBegin + '\n' +
            invoke + 'read_file">\n' +
            parameter + 'path" string="true">/tmp/a.txt' + marker(' parameter', true) + '\n' +
            marker(' invoke', true) + '\n' + marker(' calls', true) +
            ['<｜', 'end▁of▁sentence', '｜>'].join(''),
    })
    if (parsed.reasoning !== 'thinking' || parsed.content !== 'answer' ||
        parsed.tool_calls?.[0]?.function?.name !== 'read_file' ||
        parsed.tool_calls[0].function.arguments !== '{"path": "/tmp/a.txt"}' ||
        parsed.finish_reason !== 'tool_calls') {
        throw new Error(`DeepSeekV4p1ResponseTemplate parse mismatch: ${JSON.stringify(parsed)}`)
    }
    if (!DeepSeekV4p1ResponseTemplate.match({
        responseTemplateConfig: { name_or_path: 'deepseek-ai/DeepSeek-V4.1-Flash' },
    }) || DeepSeekV4p1ResponseTemplate.match({
        responseTemplateConfig: { name_or_path: 'deepseek-ai/DeepSeek-V4' },
    })) {
        throw new Error('DeepSeekV4p1ResponseTemplate match mismatch')
    }
    return partialMessageTestCount + 2
}
