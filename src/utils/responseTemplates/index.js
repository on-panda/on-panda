import { KimiK2ResponseTemplate } from './kimiK2ResponseTemplate.js'

const RESPONSE_TEMPLATE_CLASSES = [
    KimiK2ResponseTemplate,
]

export function buildMatchedResponseTemplate({ apiConfig } = {}) {
    const responseTemplateConfig = (apiConfig?.value || apiConfig || {}).response_template
    for (const ResponseTemplateClass of RESPONSE_TEMPLATE_CLASSES) {
        if (ResponseTemplateClass.match({ responseTemplateConfig })) {
            return new ResponseTemplateClass({ apiConfig })
        }
    }
}
