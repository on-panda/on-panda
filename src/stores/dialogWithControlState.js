import { ControlParameterStateClosure } from './controlParameterState.js'
import { ResponseStateClosure } from './responseState.js'
import { ToolManageStateClosure } from './toolState.js'

export function DialogWithControlStateClosure({
    messages = null,
    apiConfigs = null,
    presetToolConfigs = null,
    modelNameTags = null,
    modelName = null } = {}) {
    const controlParameterState = ControlParameterStateClosure({ apiConfigs, modelNameTags, modelName })
    const toolManageState = ToolManageStateClosure({
        presetToolConfigs,
        apiConfig: controlParameterState.apiConfig,
    })
    const responseState = ResponseStateClosure({
        messages,
        apiConfig: controlParameterState.apiConfig,
        toolManageState,
    })

    function applyConfig(config = {}) {
        const {
            apiConfigs = controlParameterState.apiConfigsInput.value,
            presetToolConfigs = [],
            modelNameTags = {},
            modelName = null,
            messages = null,
        } = config
        controlParameterState.apiConfigsInput.value = apiConfigs
        controlParameterState.modelNameTagsInput.value = modelNameTags
        toolManageState.presetToolConfigsInput.value = presetToolConfigs
        controlParameterState.modelName.value = modelName
            || Object.values(controlParameterState.modelNameTagsComputed.value)[0]
            || 'on-panda'

        if (messages) {
            responseState.operationCenter.loadMessages(
                messages,
                toolManageState.presetToolConfigsInput,
            )
        }
    }

    return {
        controlParameterState,
        responseState,
        toolManageState,
        applyConfig,
        ...controlParameterState,
        ...responseState,
    }
}
