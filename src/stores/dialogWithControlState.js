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
    const toolManageState = ToolManageStateClosure({ presetToolConfigs })
    const responseState = ResponseStateClosure({
        messages,
        apiConfig: controlParameterState.apiConfig,
        toolManageState,
    })

    return {
        controlParameterState,
        responseState,
        toolManageState,
        ...controlParameterState,
        ...responseState,
    }
}
