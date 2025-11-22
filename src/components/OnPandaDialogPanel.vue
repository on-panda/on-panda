<script setup>
import { provide, computed } from 'vue'
const { t } = useI18n()
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

const { responseState } = props
const { messages, operationCenter, pandaState, newRoundMessage } = responseState

provide('operationCenter.editRole', responseState.operationCenter.editRole)

import { ResponseStateClosure } from '../stores/responseState.js'
function setPromptLogprobsResponseState() {
    if (responseState.promptLogprobsTokens.value.length) {
        console.log("prompt:")
        var prompt = responseState.promptLogprobsTokens.value.map(x => x.delta.content).join('')
        // console.log(prompt)
        console.trace()
        var endOfText = "<|im_end|>\n<|endoftext|>"  // Make chatML compatible with chat API
        const promptLogprobsResponseState = ResponseStateClosure({
            messages: [{ role: "user", content: "Hi" }, { role: "assistant", content: "Hello!" + endOfText + prompt }],
            apiConfig: responseState.apiConfig,
        })
        promptLogprobsResponseState.tokens.value = responseState.promptLogprobsTokens.value
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
        <div v-if="responseState.promptLogprobsTokens.value.length"
            style="padding: 5px 20px 5px 20px;border-radius: 5px;border: 2px solid rgb(255, 85, 85);">
            <OnPandaResponsePanel :responseState="promptLogprobsResponseState" />
        </div>

        <OnPandaResponsePanel :responseState="responseState" />
        <slot name="beforeNewRoundMessageSlot"></slot>

        <el-divider content-position="left" style="margin-bottom: 5px;">{{ t('common.newMessage') }}:</el-divider>
        <div :style="{ opacity: newRoundMessage.content ? 1 : 0.5 }">
            <Message :message="newRoundMessage" :messageIndex="-2" @deleteMessage="newRoundMessage.content = ''"
                @sendButton="operationCenter.startNewRound()" />
        </div>
    </div>
</template>