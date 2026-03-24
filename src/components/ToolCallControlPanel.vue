<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { CaretRight, Close, CloseBold, Loading, RefreshRight } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { useGlobalStore } from '../stores/globalStore.js'
import { closeFloatPanelMeta, hashObjectSHA256Base64 } from '../utils/commonUtils.js'
import ElTooltipWithKeepOpen from './widgets/ElTooltipWithKeepOpen.vue'

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
        confirmRejectAndOpenTooltip,
        closeRejectGuideTooltip,
        handleGuideInputFocus,
        handleGuideInputBlur,
    }
}

function useToolCallRunConfigTooltip({ canRun, isMobileByUserAgent }) {
    const runTooltipWrapperRef = ref(null)
    const runConfigTooltipVisible = ref(false)
    const isRunConfigInputFocused = ref(false)
    const openedByLongPress = ref(false)

    let longPressTimer = 0

    function clearLongPressTimer() {
        if (!longPressTimer) {
            return
        }
        window.clearTimeout(longPressTimer)
        longPressTimer = 0
    }

    function openRunConfigTooltip() {
        if (!canRun.value) {
            return
        }
        runConfigTooltipVisible.value = true
    }

    function closeRunConfigTooltip() {
        clearLongPressTimer()
        runConfigTooltipVisible.value = false
        isRunConfigInputFocused.value = false
        openedByLongPress.value = false
    }

    function handleRunConfigInputFocus() {
        isRunConfigInputFocused.value = true
    }

    function handleRunConfigInputBlur() {
        isRunConfigInputFocused.value = false
    }

    function handleRunTriggerTouchStart() {
        if (!isMobileByUserAgent.value || !canRun.value) {
            return
        }
        clearLongPressTimer()
        openedByLongPress.value = false
        longPressTimer = window.setTimeout(() => {
            openedByLongPress.value = true
            openRunConfigTooltip()
        }, 450)
    }

    function handleRunTriggerTouchEnd(event) {
        if (!isMobileByUserAgent.value) {
            return
        }
        clearLongPressTimer()
        if (openedByLongPress.value) {
            if (event.cancelable) {
                event.preventDefault()
            }
            event.stopPropagation()
        }
    }

    function handleRunTriggerTouchCancel() {
        clearLongPressTimer()
    }

    function handleRunTriggerContextMenu(event) {
        if (!isMobileByUserAgent.value || !canRun.value) {
            return
        }
        event.preventDefault()
        event.stopPropagation()
        openedByLongPress.value = true
        openRunConfigTooltip()
    }

    function shouldIgnoreRunClick() {
        if (!openedByLongPress.value) {
            return false
        }
        openedByLongPress.value = false
        return true
    }

    watch(canRun, (nextCanRun) => {
        if (!nextCanRun) {
            closeRunConfigTooltip()
        }
    })

    closeFloatPanelMeta(runTooltipWrapperRef, () => {
        if (!runConfigTooltipVisible.value) {
            return
        }
        closeRunConfigTooltip()
    })

    onBeforeUnmount(() => {
        clearLongPressTimer()
    })

    return {
        runTooltipWrapperRef,
        runConfigTooltipVisible,
        isRunConfigInputFocused,
        closeRunConfigTooltip,
        handleRunConfigInputFocus,
        handleRunConfigInputBlur,
        handleRunTriggerTouchStart,
        handleRunTriggerTouchEnd,
        handleRunTriggerTouchCancel,
        handleRunTriggerContextMenu,
        shouldIgnoreRunClick,
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
const isMobileByUserAgent = computed(() => globalStore.isMobileByUserAgent)
const autoApproveRunNum = ref(1)
const runConfigTooltipTrigger = computed(() => isMobileByUserAgent.value ? 'manual' : 'hover')
const showAutoRunButton = computed(() => autoApproveRunNum.value > 1)
const showCallingAutoApprove = computed(() => toolCallStatus.value.autoApproveRunNum > 1)
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
const {
    runTooltipWrapperRef,
    runConfigTooltipVisible,
    isRunConfigInputFocused,
    closeRunConfigTooltip,
    handleRunConfigInputFocus,
    handleRunConfigInputBlur,
    handleRunTriggerTouchStart,
    handleRunTriggerTouchEnd,
    handleRunTriggerTouchCancel,
    handleRunTriggerContextMenu,
    shouldIgnoreRunClick,
} = useToolCallRunConfigTooltip({ canRun, isMobileByUserAgent })
const runTooltip = computed(() => {
    if (readyStatus.value.allReady || !readyStatus.value.unreadyToolNames.length) {
        return ''
    }
    return `${t('toolCallControl.unreadyTools')}: ${readyStatus.value.unreadyToolNames.join(', ')}`
})

watch(toolCallsHash, () => {
    closeRejectGuideTooltip()
    closeRunConfigTooltip()
})

async function handleRunToolCalls() {
    if (shouldIgnoreRunClick()) {
        return
    }
    closeRunConfigTooltip()
    await operationCenter.runToolCalls({ toolCalls: toolCalls.value })
}

async function handleAutoRunToolCalls() {
    if (shouldIgnoreRunClick()) {
        return
    }
    closeRunConfigTooltip()
    await operationCenter.runAutoApprovedToolCalls({
        toolCalls: toolCalls.value,
        autoApproveRunNum: autoApproveRunNum.value,
    })
}

async function handleRejectToolCalls() {
    closeRejectGuideTooltip()
    await operationCenter.rejectToolCalls({ toolCalls: toolCalls.value })
}

async function handleGuideToolCalls() {
    closeRejectGuideTooltip()
    await operationCenter.rejectToolCalls({
        toolCalls: toolCalls.value,
        toolCallsRejectedGuidance: toolCallsRejectedGuidance.value,
    })
}

async function handleRetryToolCalls() {
    await operationCenter.generateNew()
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
                <div ref="runTooltipWrapperRef">
                    <ElTooltipWithKeepOpen v-if="canRun" v-model:visible="runConfigTooltipVisible"
                        :keep-open="isRunConfigInputFocused" effect="light" :trigger="runConfigTooltipTrigger"
                        placement="top" :teleported="false" persistent enterable>
                        <template #content>
                            <div style="text-align:center">
                                <div class="toolCallRunTooltipTitle">
                                    {{ t('toolCallControl.autoApproveRunNumLabel') }}
                                </div>
                                <el-input-number v-model="autoApproveRunNum" :min="1" :max="999" size="small"
                                    @focus="handleRunConfigInputFocus" @blur="handleRunConfigInputBlur" />
                            </div>
                        </template>
                        <span class="toolCallRunTrigger" @touchstart="handleRunTriggerTouchStart"
                            @touchend="handleRunTriggerTouchEnd" @touchcancel="handleRunTriggerTouchCancel"
                            @touchmove="handleRunTriggerTouchCancel" @contextmenu="handleRunTriggerContextMenu">
                            <el-button v-if="!showAutoRunButton" class="toolCallActionButton" type="primary"
                                size="small" :icon="CaretRight" :disabled="!canRun" @click="handleRunToolCalls">
                                {{ t('toolCallControl.run') }}
                            </el-button>
                            <el-button-group v-else class="toolCallActionButtonGroup">
                                <el-button class="toolCallActionButton" type="primary" size="small" :icon="CaretRight"
                                    :disabled="!canRun" @click="handleRunToolCalls">
                                    {{ t('toolCallControl.run') }}
                                </el-button>
                                <el-button class="toolCallActionButton autoRunButton" type="primary" size="small"
                                    :disabled="!canRun" @click="handleAutoRunToolCalls">
                                    <b>
                                        × <span class="autoRunButtonCount">{{ autoApproveRunNum }}</span>
                                    </b>
                                </el-button>
                            </el-button-group>
                        </span>
                    </ElTooltipWithKeepOpen>
                    <el-tooltip v-else :disabled="!runTooltip" :content="runTooltip" placement="top">
                        <span class="toolCallRunTrigger">
                            <el-button v-if="!showAutoRunButton" class="toolCallActionButton" type="primary"
                                size="small" :icon="CaretRight" :disabled="!canRun" @click="handleRunToolCalls">
                                {{ t('toolCallControl.run') }}
                            </el-button>
                            <el-button-group v-else class="toolCallActionButtonGroup">
                                <el-button class="toolCallActionButton" type="primary" size="small" :icon="CaretRight"
                                    :disabled="!canRun" @click="handleRunToolCalls">
                                    {{ t('toolCallControl.run') }}
                                </el-button>
                                <el-button class="toolCallActionButton autoRunButton" type="primary" size="small"
                                    :disabled="!canRun" @click="handleAutoRunToolCalls">
                                    <b>
                                        × <span class="autoRunButtonCount">{{ autoApproveRunNum }}</span>
                                    </b>
                                </el-button>
                            </el-button-group>
                        </span>
                    </el-tooltip>
                </div>
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
                    <span v-if="showCallingAutoApprove" class="toolCallControlAutoApprove">
                        (
                        {{ t('toolCallControl.autoApproveStatus') }}
                        <b>
                            <span class="toolCallControlAutoApproveCount"
                                :class="{ free: !toolCallStatus.currentCallConsumedApproval }">
                                {{ toolCallStatus.approvedRunCount }}
                            </span>/{{ toolCallStatus.autoApproveRunNum }}
                        </b>)
                    </span>
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

.toolCallActionButtonGroup {
    display: inline-flex;
}

.autoRunButtonCount {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.35em;
    height: 1.35em;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.22);
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

.toolCallControlAutoApprove {
    color: #909399;
}

.toolCallControlAutoApproveCount.free {
    color: #67c23a;
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

.toolCallRunTooltipTitle {
    color: #606266;
    font-size: 12px;
}

.toolCallControlPanel.mobile :deep(.toolCallGuideInput .el-textarea__inner) {
    font-size: 16px;
}

.toolCallControlPanel.mobile :deep(.toolCallRunTooltip .el-input__inner) {
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
