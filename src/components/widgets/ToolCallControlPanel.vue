<script setup>
import { computed, ref, watch } from 'vue'
import { CaretRight, Close, CloseBold, Loading, RefreshRight } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { useGlobalStore } from '../../stores/globalStore.js'
import { closeFloatPanelMeta, hashObjectSHA256Base64 } from '../../utils/commonUtils.js'
import ElTooltipWithKeepOpen from './ElTooltipWithKeepOpen.vue'

function useToolCallsRejectedGuidance(toolCalls) {
    const toolCallsHash = ref('')
    const toolCallsRejectedGuidance = ref('')
    const toolCallsRejectedGuidanceCache = {}

    let toolCallsHashSyncID = 0
    watch(toolCalls, async (nextToolCalls) => {
        const currentSyncID = ++toolCallsHashSyncID
        const nextToolCallsHash = nextToolCalls.length ? await hashObjectSHA256Base64(nextToolCalls) : ''
        if (currentSyncID !== toolCallsHashSyncID) {
            return
        }
        toolCallsHash.value = nextToolCallsHash
        toolCallsRejectedGuidance.value = nextToolCallsHash ? (toolCallsRejectedGuidanceCache[nextToolCallsHash] || '') : ''
    }, { deep: true, immediate: true })

    watch(toolCallsRejectedGuidance, (nextGuidance) => {
        if (!toolCallsHash.value) {
            return
        }
        toolCallsRejectedGuidanceCache[toolCallsHash.value] = nextGuidance
    })

    return {
        toolCallsHash,
        toolCallsRejectedGuidance,
    }
}

function useToolCallRejectTooltip() {
    const rejectTooltipWrapperRef = ref(null)
    const rejectGuideTooltipVisible = ref(false)
    const isGuideInputFocused = ref(false)
    const isRejectConfirming = ref(false)

    function openRejectGuideTooltip() {
        rejectGuideTooltipVisible.value = true
    }

    function confirmRejectAndOpenTooltip() {
        isRejectConfirming.value = true
        rejectGuideTooltipVisible.value = true
    }

    function closeRejectGuideTooltip() {
        rejectGuideTooltipVisible.value = false
        isGuideInputFocused.value = false
        isRejectConfirming.value = false
    }

    function handleGuideInputFocus() {
        isGuideInputFocused.value = true
    }

    function handleGuideInputBlur() {
        isGuideInputFocused.value = false
    }

    watch(rejectGuideTooltipVisible, (visible) => {
        if (!visible && !isGuideInputFocused.value) {
            isRejectConfirming.value = false
        }
    })

    closeFloatPanelMeta(rejectTooltipWrapperRef, () => {
        if (!rejectGuideTooltipVisible.value) {
            return
        }
        closeRejectGuideTooltip()
    })

    return {
        rejectTooltipWrapperRef,
        rejectGuideTooltipVisible,
        isGuideInputFocused,
        isRejectConfirming,
        openRejectGuideTooltip,
        confirmRejectAndOpenTooltip,
        closeRejectGuideTooltip,
        handleGuideInputFocus,
        handleGuideInputBlur,
    }
}

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
const { toolCallsHash, toolCallsRejectedGuidance } = useToolCallsRejectedGuidance(toolCalls)
const {
    rejectTooltipWrapperRef,
    rejectGuideTooltipVisible,
    isGuideInputFocused,
    isRejectConfirming,
    confirmRejectAndOpenTooltip,
    closeRejectGuideTooltip,
    handleGuideInputFocus,
    handleGuideInputBlur,
} = useToolCallRejectTooltip()
const runTooltip = computed(() => {
    if (readyStatus.value.allReady || !readyStatus.value.unreadyToolNames.length) {
        return ''
    }
    return `${t('toolCallControl.unreadyTools')}: ${readyStatus.value.unreadyToolNames.join(', ')}`
})

watch(toolCallsHash, () => {
    closeRejectGuideTooltip()
})

async function handleRunToolCalls() {
    await toolCallState.callToolCalls(toolCalls.value)
}

async function handleRejectToolCalls() {
    closeRejectGuideTooltip()
    await toolCallState.rejectToolCalls(toolCalls.value)
}

async function handleGuideToolCalls() {
    closeRejectGuideTooltip()
    await toolCallState.rejectToolCalls(toolCalls.value, toolCallsRejectedGuidance.value)
}

async function handleRetryToolCalls() {
    await toolCallState.retry()
}

async function handleRejectTriggerClick() {
    if (!isRejectConfirming.value) {
        confirmRejectAndOpenTooltip()
        return
    }
    await handleRejectToolCalls()
}
</script>

<template>
    <div v-if="finalMessage.finish_reason === 'tool_calls'" class="toolCallControlPanel"
        :class="{ mobile: globalStore.isMobile }">
        <div class="toolCallControlRow">

            <div v-if="!toolCallStatus.calling" class="toolCallControlButtons">
                <b class="toolCallControlTitle">{{ t('toolCallControl.title') }}</b>
                <el-tooltip :disabled="!runTooltip" :content="runTooltip" placement="top">
                    <el-button class="toolCallActionButton" type="primary" size="small" :icon="CaretRight"
                        :disabled="!canRun" @click="handleRunToolCalls">
                        {{ t('toolCallControl.run') }}
                    </el-button>
                </el-tooltip>
                <div ref="rejectTooltipWrapperRef">
                    <ElTooltipWithKeepOpen v-model:visible="rejectGuideTooltipVisible" :keep-open="isGuideInputFocused"
                        effect="light" trigger="hover" placement="top" :teleported="false" persistent enterable>
                        <template #content>
                            <div class="toolCallGuideTooltip">
                                <div class="toolCallGuideEditor">
                                    <el-input class="toolCallGuideInput" v-model="toolCallsRejectedGuidance"
                                        type="textarea" resize="none" :autosize="{ minRows: 1, maxRows: 16 }"
                                        :placeholder="t('toolCallControl.rejectGuidancePlaceholder')"
                                        @keydown.ctrl.enter.prevent="handleGuideToolCalls"
                                        @focus="handleGuideInputFocus" @blur="handleGuideInputBlur" />
                                    <div class="toolCallGuideActions">
                                        <button class="toolCallGuideActionButton toolCallGuideSubmitButton"
                                            @click="handleGuideToolCalls">
                                            <b>{{ t('toolCallControl.guide') }}</b>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </template>
                        <span>
                            <el-button class="toolCallActionButton" type="danger" size="small" :icon="Close"
                                :disabled="!toolCalls.length" @click="handleRejectTriggerClick">
                                <b v-if="isRejectConfirming">{{ t('toolCallControl.rejectConfirm') }}</b>
                                <template v-else>{{ t('toolCallControl.reject') }}</template>
                            </el-button>
                        </span>
                    </ElTooltipWithKeepOpen>
                </div>
                <el-button class="toolCallActionButton" type="warning" size="small" :icon="RefreshRight"
                    @click="handleRetryToolCalls">
                    {{ t('toolCallControl.retry') }}
                </el-button>
            </div>

            <div v-else class="toolCallControlButtons">
                <span class="toolCallControlCalling">
                    <el-icon class="is-loading">
                        <Loading />
                    </el-icon>
                    <b class="toolCallControlTitle">
                        {{ t('toolCallControl.calling') }}
                    </b>
                </span>
                <el-button class="toolCallActionButton" type="danger" size="small" :icon="CloseBold"
                    @click="toolCallState.stopToolCalls()">
                    {{ t('common.stop') }}
                </el-button>
            </div>
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

.toolCallControlButtons {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
}

.toolCallControlTitle {
    font-size: 13px;
    color: #888;
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

.toolCallGuideTooltip {
    min-width: 280px;
    max-width: min(500px, calc(100vw - 48px));
}

.toolCallControlPanel.mobile :deep(.toolCallGuideInput .el-textarea__inner) {
    font-size: 16px;
}

.toolCallGuideEditor {
    display: flex;
    align-items: stretch;
}

.toolCallGuideActions {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-left: 5px;
}

.toolCallGuideActionButton {
    background-color: #f56c6c;
    color: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 8px 10px;
    border: none;
    border-radius: 7px;
    cursor: pointer;
    white-space: nowrap;
}

.toolCallGuideActionButton:hover {
    background-color: #f78989;
}
</style>
