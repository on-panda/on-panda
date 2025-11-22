<script setup>
import { provide, computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { messageToSeq } from '../utils/chatUtils.js'

import Message from './Message.vue'
import OnPandaResponsePanel from './OnPandaResponsePanel.vue'

const props = defineProps({
    responseState: {
        type: Object,
        required: true,
    },
})

const { t } = useI18n()
const { responseState } = props
const { messages, operationCenter, pandaState, newRoundMessage } = responseState

provide('operationCenter.editRole', responseState.operationCenter.editRole)

import { ResponseStateClosure } from '../stores/responseState.js'


const promptLogprobsText = computed(() => {
    if (responseState.promptLogprobsTokens.value.length) {
        var prompt = responseState.promptLogprobsTokens.value.map(x => x.delta.content).join('')
        // console.log("prompt:", prompt)
        return prompt
    }
    return ""
})

function setPromptLogprobsResponseState() {
    if (responseState.promptLogprobsTokens.value.length) {
        // Make chatML compatible with chat API (now only for Qwen tokenizer)
        // TODO: Compatible special tokens with other models, maybe by special_tokens config?
        var endOfText = "<|im_end|>\n<|endoftext|>"
        const promptLogprobsResponseState = ResponseStateClosure({
            messages: [{ role: "system", content: "You are a helpful assistant." }, { role: "user", content: "Say hi" }],
            apiConfig: responseState.apiConfig,
        })
        const prefixTokens = { delta: { role: "assistant", content: "Hi!" + endOfText } }
        promptLogprobsResponseState.tokens.value = [prefixTokens, ...responseState.promptLogprobsTokens.value].map((token, tokenIndex) => {
            token.tokenIndex = tokenIndex
            return token
        })
        promptLogprobsResponseState.isPromptLogprobsState.value = true
        return promptLogprobsResponseState
    }
    return null
}
const promptLogprobsResponseState = computed(setPromptLogprobsResponseState)

</script>

<template>
    <div class="onPandaContainers">
        <div class="dialogFixedPosition"
            :style="Object.assign(pandaState?.isDeleted.value ? { backgroundColor: '#ffe8e8' } : {})"
            style="border-radius: 5px;">
            <div class="promptMessages">
                <!-- <Message v-for="(message, messageIndex) in messages" :message="message" 
          @sendButton="operationCenter.generateNew()"
          @deleteMessage="operationCenter.clearOrDeleteMessage(message, messageIndex)" @focus="operationCenter.editPrompt.before()"
          @blur="operationCenter.editPrompt.after()" /> -->
                <!-- change edit in compoment to edit in operationCenter -->
                <Message v-for="(message, messageIndex) in messages"
                    :key="message.role + messageToSeq(message) + messageIndex" :message="message"
                    :messageIndex="messageIndex" :operationCenter="operationCenter" />
            </div>
        </div>
        <details v-if="promptLogprobsResponseState" class="prompt-logprobs-details">
            <summary class="prompt-logprobs-summary">
                <el-tooltip effect="dark" placement="top" :content="t('dialogPanel.promptLogprobsTooltip')">
                    <span>{{ t('dialogPanel.promptVisualizationLabel') }}</span>
                </el-tooltip>
            </summary>
            <div class="prompt-logprobs-body" v-if="promptLogprobsResponseState"
                :key="JSON.stringify(responseState.promptLogprobsTokens.value.slice(-10))">
                <OnPandaResponsePanel :responseState="promptLogprobsResponseState" />
            </div>
        </details>

        <OnPandaResponsePanel :responseState="responseState" />
        <slot name="beforeNewRoundMessageSlot"></slot>

        <el-divider content-position="left" style="margin-bottom: 5px;">{{ t('common.newMessage') }}:</el-divider>
        <div :style="{ opacity: newRoundMessage.content ? 1 : 0.5 }">
            <Message :message="newRoundMessage" :messageIndex="-2" @deleteMessage="newRoundMessage.content = ''"
                @sendButton="operationCenter.startNewRound()" />
        </div>
    </div>
</template>

<style scoped>
.prompt-logprobs-details {
    border: 2px solid transparent;
    border-radius: 5px;
    margin-top: 10px;
    background-color: transparent;
    transition: border-color 0.2s ease, background-color 0.2s ease;
    padding: 6px 20px 12px 0px;
}

.prompt-logprobs-details[open] {
    border-color: #f554;
    background-color: #fff;
    padding: 6px 20px 12px;
}

.prompt-logprobs-summary {
    font-size: small;
    font-weight: 500;
    color: #888;
    cursor: pointer;
}

.prompt-logprobs-summary::marker,
.prompt-logprobs-summary::-webkit-details-marker {
    color: #888;
}

.prompt-logprobs-body {
    margin-top: 10px;
}
</style>