<script setup>
import { provide, computed } from 'vue'
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
        // console.log("prompt:", responseState.promptLogprobsTokens.value.map(x => x.delta.content).slice(-40))
        return prompt
    }
    return ""
})

function setPromptLogprobsResponseState() {
    if (responseState.promptLogprobsTokens.value.length) {
        const promptLogprobsResponseState = ResponseStateClosure({
            messages: [
                { role: "user", content: "Say hi" },
                {
                    "role": "assistant",
                    "reasoning": "The user said \"Say hi\". This is a simple request for a greeting. I should respond with a friendly \"Hi\" or similar greeting.",
                    "content": "Hi! How can I help you today?",
                    "finish_reason": "stop"
                }],
            apiConfig: responseState.apiConfig,
        })
        const promptTokens = responseState.promptLogprobsTokens.value.map((token, tokenIndex) => {
            token.tokenIndex = tokenIndex
            return token
        })
        promptLogprobsResponseState.setGenerationTokens(promptTokens)
        promptLogprobsResponseState.rawPromptLogprobsTokens.value = responseState.promptLogprobsTokens.value
        return promptLogprobsResponseState
    }
    return null
}
const promptLogprobsResponseState = computed(setPromptLogprobsResponseState)

function clearNewRoundMessage() {
    const role = newRoundMessage.value.role
    newRoundMessage.value = { role: role, content: '' }
}

</script>

<template>
    <div class="onPandaContainers">
        <div class="promptMessagesPanel"
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
        <div class="newRoundMessage">
            <Message :message="newRoundMessage" :messageIndex="-2" @deleteMessage="clearNewRoundMessage"
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
