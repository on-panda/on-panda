<script setup>
import { ref, onMounted } from 'vue'
import { duplicateWindow } from '../utils/commonUtils.js'
import { useI18n } from 'vue-i18n'

import DataControlPanel from './DataControlPanel.vue'
import ControlParameterPanel from './ControlParameterPanel.vue'
import OnPandaDialogPanel from './OnPandaDialogPanel.vue'
import ToolManagePanel from './ToolManagePanel.vue'
const { t } = useI18n()

const props = defineProps({
    dialogWithControlState: {
        type: Object,
        required: true
    }
})

const { responseState, controlParameterState, toolManageState } = props.dialogWithControlState


function duplicateWindowWithModelName(modelName) {
    localStorage.setItem('modelNameForDuplicateWindow', modelName)
    duplicateWindow(responseState.pandaState)
}

const onPandaDialogPanelRef = ref(null)
onMounted(() => {
    if (onPandaDialogPanelRef.value) {
        responseState.onPandaContainerRef.value = onPandaDialogPanelRef.value
    }
})

</script>

<template>
    <div class="onPandaContainers" ref="onPandaDialogPanelRef">
        <ToolManagePanel :responseState="responseState" :toolManageState="toolManageState" />
        <OnPandaDialogPanel :responseState="responseState">
            <template #beforeNewRoundMessageSlot>
                <DataControlPanel :responseState="responseState" />
            </template>
        </OnPandaDialogPanel>

        <el-divider content-position="left">
            <b>{{ t('common.controlParameter') }}:</b>
        </el-divider>
        <ControlParameterPanel :controlParameterState="controlParameterState"
            @dblclickModelTag="responseState?.operationCenter.generateNew()"
            @duplicateWindowWithModelName="duplicateWindowWithModelName" />
    </div>
</template>
