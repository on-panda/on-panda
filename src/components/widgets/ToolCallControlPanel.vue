<script setup>
import { computed } from 'vue'
import { CaretRight, Close, CloseBold, InfoFilled, Loading, RefreshRight } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { useGlobalStore } from '../../stores/globalStore.js'

const props = defineProps({
    responseState: {
        type: Object,
        required: true,
    },
})

const globalStore = useGlobalStore()
const { t } = useI18n()

const responseState = props.responseState
const finalMessage = responseState.finalMessage
const operationCenter = responseState.operationCenter
const toolCallState = operationCenter.toolCallState
const toolCallStatus = toolCallState.toolCallStatus

const toolCalls = computed(() => finalMessage.value.tool_calls || [])
const toolCallNames = computed(() => toolCalls.value.map(toolCall => toolCall.function?.name).filter(Boolean))
const readyStatus = computed(() => toolCallState.checkCallReady(toolCalls.value))
const approvalStatus = computed(() => toolCallState.checkRequireApproval(toolCalls.value))
const canRun = computed(() => toolCalls.value.length > 0 && readyStatus.value.allReady)
const runTooltip = computed(() => {
    if (readyStatus.value.allReady || !readyStatus.value.unreadyToolNames.length) {
        return ''
    }
    return `${t('toolCallControl.unreadyTools')}: ${readyStatus.value.unreadyToolNames.join(', ')}`
})

async function handleRunToolCalls() {
    await toolCallState.callToolCalls(toolCalls.value)
}

async function handleRejectToolCalls() {
    await toolCallState.rejectToolCalls(toolCalls.value)
}

async function handleRetryToolCalls() {
    await toolCallState.retry()
}
</script>

<template>
    <div v-if="finalMessage.finish_reason === 'tool_calls'" class="toolCallControlPanel"
        :class="{ mobile: globalStore.isMobile }">
        <div class="toolCallControlRow">

            <span v-if="!toolCallStatus.calling" class="toolCallControlButtons">
                <b style="font-size: 13px; color:#888;margin-right: 10px;">{{ t('toolCallControl.title') }}</b>
                <el-tooltip :disabled="!runTooltip" :content="runTooltip" placement="top">
                    <el-button class="toolCallActionButton" type="primary" size="small" :icon="CaretRight"
                        :disabled="!canRun" @click="handleRunToolCalls">
                        {{ t('toolCallControl.run') }}
                    </el-button>
                </el-tooltip>
                <el-button class="toolCallActionButton" type="danger" size="small" :icon="Close"
                    :disabled="!toolCalls.length" @click="handleRejectToolCalls">
                    {{ t('toolCallControl.reject') }}
                </el-button>
                <el-button class="toolCallActionButton" type="warning" size="small" :icon="RefreshRight"
                    @click="handleRetryToolCalls">
                    {{ t('toolCallControl.retry') }}
                </el-button>
            </span>

            <span v-else class="toolCallControlButtons">
                <span class="toolCallControlCalling">
                    <el-icon class="is-loading">
                        <Loading />
                    </el-icon>
                    <b style="font-size: 13px; color:#888;margin-right: 10px;">
                        {{ t('toolCallControl.calling') }}
                    </b>
                </span>
                <el-button class="toolCallActionButton" type="danger" size="small" :icon="CloseBold"
                    @click="toolCallState.stopToolCalls()">
                    {{ t('common.stop') }}
                </el-button>
            </span>
        </div>

        <div class="toolCallControlInfo">
            <small>
                <template v-if="approvalStatus.needApproval">
                    {{ t('toolCallControl.approvalRequired') }}:
                </template>
                <template v-else>
                    {{ t('toolCallControl.pendingTools') }}:
                </template>
                <code>{{ toolCallNames.join(', ') }}</code>
            </small>
        </div>
    </div>
</template>

<style scoped>
.toolCallControlPanel {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 8px;
    padding: 6px 8px;
    border: 1px solid #d9ecff;
    border-left: 3px solid #409eff;
    border-radius: 6px;
    background: #fbfdff;
}

.toolCallControlRow {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
}


.toolCallControlCalling {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: #606266;
    font-size: 12px;
}

.toolCallControlInfo {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: #606266;
    font-size: 12px;
}

.toolCallControlInfo code {
    color: #606266;
    font-size: 12px;
}

.mobile .toolCallControlButtons {
    justify-content: flex-start;
}
</style>
