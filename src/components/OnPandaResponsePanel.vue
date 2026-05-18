<script setup>
import { ref, computed, provide, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { DArrowRight, VideoPause, Edit, View, DocumentCopy, Refresh, Close } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

import { useI18n } from 'vue-i18n'
import { useGlobalStore } from '../stores/globalStore.js'
import { probOfToken, messageToSeq } from '../utils/chatUtils.js'
import { duplicateWindow, copyToClipboard } from '../utils/commonUtils.js'
import { useScrollSwitchSync } from '../utils/userInterfaceUtils.js'
import MessageRole from '../components/widgets/MessageRole.vue'
import MarkdownResponse from '../components/widgets/MarkdownResponse.vue'
import OnPandaResponseText from '../components/OnPandaResponseText.vue'
import DialogKeysFooter from './widgets/DialogKeysFooter.vue'
import ToolCallControlPanel from './ToolCallControlPanel.vue'
import WaitingInfo from './widgets/WaitingInfo.vue'

const props = defineProps({
    responseState: {
        type: Object,
        description: 'The response state object',
    },
})
const globalStore = useGlobalStore()
const isMobile = computed(() => globalStore.isMobile)
const { t } = useI18n()

const responseState = props.responseState
const pandaState = responseState.pandaState
const tokens = responseState.tokens
const requestStatus = responseState.requestStatus
const agenticLoopStatus = responseState.agenticLoopStatus
const apiConfig = responseState.apiConfig
const operationCenter = responseState.operationCenter
const finalMessage = responseState.finalMessage
const finalMessageAsText = computed(() => messageToSeq(finalMessage.value, { includeFinishReason: false }))

const bitsTooltipHtml = 'bits = - &sum;<sub>i</sub> log<sub>2</sub>(p<sub>i</sub>)'

const waitingInfoProps = computed(() => ({
    generating: requestStatus.value.generating,
    requestTimes: requestStatus.value.requestTimes,
    model: requestStatus.value.requestModel || apiConfig.value?.chat_config?.model || '',
}))


var bitTokens = computed(() => tokens.value.filter(token => typeof token.logprobs?.content?.[0]?.logprob === "number"))

var bitTotal = computed(
    () => bitTokens.value.reduce((sum, token) => sum + - Math.log2(probOfToken(token)), 0)
)

const tokensModelNames = computed(() => {
    var tokensModelNames = []
    tokens.value.map(token => {
        if (token.model && !tokensModelNames.includes(token.model)) {
            tokensModelNames.push(token.model)
        }
    })
    if (tokensModelNames.length === 0) {
        return "unknown_model"
    }
    return tokensModelNames.join(", ")
})

async function handleCopyButtonClick() {
    try {
        await copyToClipboard(finalMessage.value.content)
        ElMessage({
            showClose: true,
            message: t('userMessages.copied'),
            type: 'success',
            duration: 2000,
        })
    } catch {
        ElMessage({
            showClose: true,
            message: t('userMessages.copyFailed'),
            type: 'error',
            duration: 5000,
        })
    }
}

async function pasteThenRequestPromptLogprobs() {
    try {
        var pasteText = await navigator.clipboard.readText()
    } catch {
        ElMessage({
            showClose: true,
            message: t('userMessages.pasteManually'),
            type: 'warning',
            duration: 5000,
        })
        return
    }
    if (tokens.value.length == 0) {
        tokens.value = [{ delta: { role: "assistant", content: "" } }]
    }
    operationCenter.applyInputChange(tokens.value[0], pasteText)
    operationCenter.refreshResponseProbability()
}

const scrollDiv = ref(null)
const scrollSwitch = useScrollSwitchSync(scrollDiv); // { isSwitched, scrollToPosition }
const finalMessageTwoPanelBodyRef = ref(null)
const rawMessagePanelRef = ref(null)
const markdownMessagePanelRef = ref(null)
const rawMessagePanelStyle = ref({})
const markdownMessagePanelStyle = ref({})
const shortPanelAutoFollow = {
    frame: 0,
    resizeObserver: null,
    schedule() {
        cancelAnimationFrame(shortPanelAutoFollow.frame)
        shortPanelAutoFollow.frame = requestAnimationFrame(shortPanelAutoFollow.update)
    },
    update() {
        shortPanelAutoFollow.frame = 0
        const bodyRect = finalMessageTwoPanelBodyRef.value.getBoundingClientRect()
        const rawHeight = rawMessagePanelRef.value.firstElementChild.offsetHeight
        const markdownHeight = markdownMessagePanelRef.value.firstElementChild.offsetHeight
        const shortHeight = Math.min(rawHeight, markdownHeight)
        const longHeight = Math.max(rawHeight, markdownHeight)
        const heightDiff = longHeight - shortHeight
        const offset = shortHeight > window.innerHeight
            ? Math.min(Math.max(-bodyRect.top, 0) * heightDiff / (longHeight - window.innerHeight), heightDiff)
            : Math.min(Math.max(-bodyRect.top, 0), heightDiff)
        rawMessagePanelStyle.value = rawHeight < markdownHeight && offset ? { position: 'relative', top: `${offset}px` } : {}
        markdownMessagePanelStyle.value = markdownHeight < rawHeight && offset ? { position: 'relative', top: `${offset}px` } : {}
    },
    start() {
        window.addEventListener('scroll', shortPanelAutoFollow.schedule, { passive: true })
        window.addEventListener('resize', shortPanelAutoFollow.schedule, { passive: true })
        shortPanelAutoFollow.resizeObserver = new ResizeObserver(shortPanelAutoFollow.schedule)
        shortPanelAutoFollow.resizeObserver.observe(finalMessageTwoPanelBodyRef.value)
        shortPanelAutoFollow.resizeObserver.observe(rawMessagePanelRef.value.firstElementChild)
        shortPanelAutoFollow.resizeObserver.observe(markdownMessagePanelRef.value.firstElementChild)
        shortPanelAutoFollow.schedule()
    },
    stop() {
        window.removeEventListener('scroll', shortPanelAutoFollow.schedule)
        window.removeEventListener('resize', shortPanelAutoFollow.schedule)
        shortPanelAutoFollow.resizeObserver.disconnect()
        cancelAnimationFrame(shortPanelAutoFollow.frame)
    },
}

var handleScrollDivFunctions = []
provide('handleScrollDivFunctions', handleScrollDivFunctions)
function handleScrollDivFunction(e) {
    for (const func of handleScrollDivFunctions) {
        func(e)
    }
}

onMounted(async () => {
    if (!globalStore.cleanMode) {
        scrollDiv.value.addEventListener('scroll', handleScrollDivFunction);
        shortPanelAutoFollow.start()
    }
})

onBeforeUnmount(() => {
    if (!globalStore.cleanMode) {
        scrollDiv.value.removeEventListener('scroll', handleScrollDivFunction);
        shortPanelAutoFollow.stop()
    }
})

watch(() => globalStore.cleanMode, async function watchCleanMode(cleanMode) {
    if (cleanMode) {
        scrollDiv.value.removeEventListener('scroll', handleScrollDivFunction);
        shortPanelAutoFollow.stop()
        return
    }
    await nextTick()
    scrollDiv.value.addEventListener('scroll', handleScrollDivFunction);
    shortPanelAutoFollow.start()
})
</script>

<template>
    <div class="OnPandaResponsePanel onPandaContainers" :style="globalStore.cleanMode ? { maxWidth: '1024px' } : {}">
        <div class="finalMessageHeadBar" style="display: flex; justify-content: space-between;"
            :style="isMobile ? {} : { width: '50%' }">
            <MessageRole :message="responseState.isPromptLogprobsState.value ? { role: 'prompt' } : finalMessage" />
            <span class="stretch" style="margin-right: auto" />
            <footer class="finalMessageControlButtons" style="display :flex; margin-top:5px; margin-bottom:-5px">
                <span class="stretch" style="margin-right: auto" />
                <el-tooltip v-if="responseState.isPromptLogprobsState.value" :content="t('common.close')"
                    placement="top">
                    <el-button :icon="Close" size="small"
                        @click="responseState.rawPromptLogprobsTokens.value.length = 0" />
                </el-tooltip>
                <el-tooltip v-if="!agenticLoopStatus.running" :content="t('tooltips.continueGenerating')"
                    placement="top">
                    <el-button :icon="DArrowRight" size="small" :disabled="!tokens?.length"
                        @click="operationCenter.continueGenerating()" />
                </el-tooltip>
                <el-tooltip v-if="requestStatus.generating" :content="t('tooltips.stopGenerating')" placement="top">
                    <el-button :icon="VideoPause" size="small" @click="operationCenter.stopAgenticLoop()" />
                </el-tooltip>
                <!-- <el-tooltip content="try again" placement="top">
              <el-button :icon="Refresh" size="small" @click="operationCenter.generateNew()" />
            </el-tooltip> -->
                <el-tooltip v-if="0" content="edit (TBD)" placement="top">
                    <el-button :icon="Edit" size="small" :disabled="true || !finalMessage.content" />
                </el-tooltip>
                <el-tooltip placement="top" effect="light">
                    <template #content>
                        {{ t('tooltips.refreshTokenProb') }}, <br>
                        {{ t('tooltips.dblclickToPasteAndRefresh') }}
                        <el-button size="small" @click="pasteThenRequestPromptLogprobs">
                            {{ t('tooltips.pasteAndRefresh') }}
                        </el-button>
                    </template>
                    <el-button :icon="View" size="small" :disabled="!finalMessageAsText || agenticLoopStatus.running"
                        @click="operationCenter.refreshResponseProbability()"
                        @dblclick="pasteThenRequestPromptLogprobs" />
                </el-tooltip>
                <el-tooltip placement="top-end" effect="light">
                    <template #content>
                        Click to copy response, <br>Or double-click to <br>
                        <el-button size="small" @click="duplicateWindow(pandaState)">
                            Duplicate Window
                        </el-button>
                    </template>
                    <el-button :icon="DocumentCopy" size="small" :disabled="!finalMessage.content"
                        @click="handleCopyButtonClick" @dblclick="duplicateWindow(pandaState)" />
                </el-tooltip>
                &nbsp;&nbsp;&nbsp;
                <hr v-if="!isMobile" style="color:#eee; margin-top: -5px; margin-bottom: 4px">
            </footer>
            <el-switch v-if="isMobile" v-model="scrollSwitch.isSwitched.value" inline-prompt active-text="raw"
                inactive-text="MD" @change="scrollSwitch.scrollToPosition"
                style="margin-right: 8px;--el-switch-on-color: #aaa; --el-switch-off-color: #aaa; width:45px" />
        </div>
        <div class="replayStatisticsSubtitle" style="display: flex; justify-content: space-between;">
            <small style="color: #888;"> model:
                <code>{{ tokensModelNames }}</code>
                <span v-if="tokens.length">
                    <span v-if="tokens[tokens.length - 1]?.usage?.prompt_tokens">
                        ｜ tokens:
                        {{ tokens[tokens.length - 1]?.usage?.prompt_tokens }} +
                        {{ tokens[tokens.length - 1]?.usage?.completion_tokens }}
                    </span>
                    <span v-else-if="bitTokens.length <= 1"> ｜ tokens: {{ tokens.length }} </span>
                </span>
                <span v-if="bitTokens.length > 1"> ｜
                    <el-tooltip class="" effect="light" placement="left" raw-content :content="bitsTooltipHtml">
                        bits
                    </el-tooltip>
                    / tokens: {{ bitTotal.toFixed(1) }} ÷ {{ bitTokens.length }} = {{ (bitTotal /
                        bitTokens.length).toFixed(2)
                    }}
                </span>


            </small>
            <small style="color: #888;" v-if="!isMobile"> rendered markdown </small>
        </div>

        <div class="finalMessageTwoPanel" v-if="!globalStore.cleanMode"
            style="width: 100%;overflow:scroll;overflow-y:hidden; padding-bottom: 3px;" ref="scrollDiv">
            <div ref="finalMessageTwoPanelBodyRef" style="display: flex; justify-content: space-between;"
                :style="{ 'width': isMobile ? '195%' : '100%' }">
                <div ref="rawMessagePanelRef" class="final-message-half-panel" :style="rawMessagePanelStyle">
                    <div style="background-color: #eee;">
                        <WaitingInfo v-if="!tokens.length" v-bind="waitingInfoProps" />
                        <OnPandaResponseText :responseState="responseState" />
                    </div>
                </div>
                <hr style="color:#eee">
                <div ref="markdownMessagePanelRef" class="final-message-half-panel" :style="markdownMessagePanelStyle">
                    <MarkdownResponse :content="finalMessageAsText" :waiting-info-props="waitingInfoProps" />
                </div>
            </div>
        </div>
        <div v-if="globalStore.cleanMode">
            <MarkdownResponse :content="finalMessageAsText" :waiting-info-props="waitingInfoProps" />
        </div>
        <ToolCallControlPanel :responseState="responseState" />
        <DialogKeysFooter :pandaState="pandaState" style="padding-top: 10px; margin-bottom:2px;" />
    </div>
</template>

<style scoped>
.final-message-half-panel {
    display: inline-block;
    width: 49.5%;
}
</style>
