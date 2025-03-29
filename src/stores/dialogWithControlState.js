import { ref } from 'vue'
import { ControlParameterStateClosure } from './controlParameterState.js'
import { ResponseStateClosure } from './responseState.js'

export function DialogWithControlStateClosure({
    messages = null,
    apiConfigs = null,
    modelNameTags = null,
    modelName = null } = {}) {
    const controlParameterState = ControlParameterStateClosure({ apiConfigs, modelNameTags, modelName })
    const responseState = ResponseStateClosure({ messages, apiConfig: controlParameterState.apiConfig })

    return {
        controlParameterState,
        responseState,
        ...controlParameterState,
        ...responseState,
    }
}
