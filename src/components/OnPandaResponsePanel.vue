<script setup>
import { ref, computed, provide, onMounted, onBeforeUnmount } from 'vue'
import { DArrowRight, VideoPause, Edit, View, DocumentCopy, Refresh } from '@element-plus/icons-vue'

import { useI18n } from 'vue-i18n'
import { useGlobalStore } from '../stores/globalStore.js'
import { probOfToken } from '../utils/chatUtils.js'
import { duplicateWindow, copyToClipboard } from '../utils/commonUtils.js'
import { useScrollSwitchSync } from '../utils/userInterfaceUtils.js'
import MessageRole from '../components/widgets/MessageRole.vue'
import MarkdownRender from '../components/widgets/MarkdownRender.vue'
import MarkdownResponse from '../components/widgets/MarkdownResponse.vue'
import OnPandaResponseText from '../components/OnPandaResponseText.vue'
import DialogKeysFooter from './widgets/DialogKeysFooter.vue'

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
const apiConfig = responseState.apiConfig
const operationCenter = responseState.operationCenter
const finalMessage = responseState.finalMessage

const WaitingInfo = computed(() => {
    if (requestStatus.value.generating) {
        return `⏳ <b>No.${requestStatus.value.requestTimes}</b> ${t('userMessages.waitingForModel')} <br>  <code style='margin-left:30px'> ${apiConfig.value.chat_config.model} </code>`
    } else {
        return t('userMessages.clickSendButton')
    }
})


var bitTokens = computed(() => tokens.value.filter(token => typeof token.logprobs?.content[0]?.logprob === "number"))

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

async function pasteThenRequestPromptLogprobs() {
    var pasteText = await navigator.clipboard.readText()
    if (tokens.value.length == 0) {
        tokens.value = [{ delta: { role: "assistant", content: "" } }]
    }
    operationCenter.applyInputChange(tokens.value[0], pasteText)
    responseState.requestPromptLogprobs()
}

const scrollDiv = ref(null)
const scrollSwitch = useScrollSwitchSync(scrollDiv); // { isSwitched, scrollToPosition }

var handleScrollDivFunctions = []
provide('handleScrollDivFunctions', handleScrollDivFunctions)
function handleScrollDivFunction(e) {
    for (const func of handleScrollDivFunctions) {
        func(e)
    }
}

onMounted(async () => {
    scrollDiv.value.addEventListener('scroll', handleScrollDivFunction);
})

onBeforeUnmount(() => {
    scrollDiv.value.removeEventListener('scroll', handleScrollDivFunction);
})
</script>

<template>
    <div class="OnPandaResponsePanel onPandaContainers" :style="globalStore.cleanMode ? { maxWidth: '1024px' } : {}">
        <div class="finalMessageHeadBar" style="display: flex; justify-content: space-between;"
            :style="isMobile ? {} : { width: '50%' }">
            <MessageRole :message="finalMessage" />
            <span class="stretch" style="margin-right: auto" />
            <footer class="finalMessageControlButtons" style="display :flex; margin-top:5px; margin-bottom:-5px">
                <span class="stretch" style="margin-right: auto" />
                <el-tooltip v-if="!requestStatus.generating" :content="t('tooltips.continueGenerating')"
                    placement="top">
                    <el-button :icon="DArrowRight" size="small" :disabled="!tokens?.length"
                        @click="operationCenter.continueGenerating()" />
                </el-tooltip>
                <el-tooltip v-if="requestStatus.generating" :content="t('tooltips.stopGenerating')" placement="top">
                    <el-button :icon="VideoPause" size="small" @click="operationCenter.stopGenerating()" />
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
                    <el-button :icon="View" size="small" :disabled="!finalMessage.content || requestStatus.generating"
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
                        @click="copyToClipboard(finalMessage.content)" @dblclick="duplicateWindow(pandaState)" />
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
                    <el-tooltip class="" effect="light" placement="bottom" raw-content>
                        <template #content>
                            <MarkdownRender
                                content="${\text{bits}} = - \sum_{i} \log_2(p_i)$. // note for vLLM server model: 
                  Logprob value are affected by sampling parameters, click: [🔗URL](https://github.com/vllm-project/vllm/issues/9453)" />
                        </template>
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
            <div style="display: flex; justify-content: space-between;"
                :style="{ 'width': isMobile ? '195%' : '100%' }">
                <div class="final-message-half-panel">
                    <div style="background-color: #eee;">
                        <p style="color: #444" v-if="!tokens.length">
                            <span v-html="WaitingInfo"></span>
                        </p>
                        <OnPandaResponseText :responseState="responseState" />
                    </div>
                </div>
                <hr style="color:#eee">
                <div class="final-message-half-panel">
                    <MarkdownResponse :content="finalMessage.content" :WaitingInfo="WaitingInfo" />
                </div>
            </div>
        </div>
        <div v-if="globalStore.cleanMode">
            <MarkdownResponse :content="finalMessage.content" :WaitingInfo="WaitingInfo" />
        </div>
        <DialogKeysFooter :pandaState="pandaState" style="padding-top: 10px; margin-bottom:2px;" />
    </div>
</template>

<style scoped>
.final-message-half-panel {
    display: inline-block;
    width: 49.5%;
}
</style>