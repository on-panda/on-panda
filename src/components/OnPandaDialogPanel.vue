<script setup>
import { provide } from 'vue'
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
</script>

<template>
    <div class="onPandaContainers">
        <div class="dialogFixedPosition"
            :style="Object.assign(pandaState?.isDeleted.value ? { backgroundColor: '#ffe8e8' } : {})"
            style="border-radius: 5px;">
            <div class="promptMessages">
                <!-- <Message v-for="(message, index) in messages" :message="message" 
          @sendButton="operationCenter.generateNew()"
          @deleteMessage="operationCenter.clearOrDeleteMessage(message, index)" @focus="operationCenter.editPrompt.before()"
          @blur="operationCenter.editPrompt.after()" /> -->
                <!-- change edit in compoment to edit in operationCenter -->
                <Message v-for="(message, index) in messages" :key="message.role + messageToSeq(message) + index"
                    :message="message" :index="index" :operationCenter="operationCenter" />
            </div>
        </div>
        <OnPandaResponsePanel :responseState="responseState" />
        <slot name="beforeNewRoundMessageSlot"></slot>

        <el-divider content-position="left" style="margin-bottom: 5px;">{{ t('common.newMessage') }}:</el-divider>
        <div :style="{ opacity: newRoundMessage.content ? 1 : 0.5 }">
            <Message :message="newRoundMessage" :index="-2" @deleteMessage="newRoundMessage.content = ''"
                @sendButton="operationCenter.startNewRound()" />
        </div>
    </div>
</template>