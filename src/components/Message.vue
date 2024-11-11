<template>
  <div style="max-width: 1024px;">
    <div style="display :flex;">
      <p class="role-name" :style="messageRoleNameStyle(props.message)"> {{ props.message['role'] }}:</p>
      <span class="stretch" style="margin-right: auto" />
      <el-tooltip content="Delete" placement="top">
        <el-button :icon="Close" size="small" style="width: 24px;height: 15px; margin-top: 13px; margin-right: 5px;"
          @click="$emit('deleteMessage')" />
      </el-tooltip>
    </div>
    <div style="display: flex; justify-content: space-between">
      <el-input class="message-content" v-model="props.message['content']" type="textarea"
        placeholder="Empty message will be ignored" :autosize="{ minRows: 2, maxRows: 50 }"
        @keydown.ctrl.enter="$emit('sendButton')" />

      <button @click="$emit('sendButton')" :disabled="!props.message['content']" :style="{
        cursor: props.message['content'] ? 'pointer' : 'not-allowed'
      }" style="margin-left: 5px; background-color: lightskyblue; color:#fff; padding: 8px; border-radius: 7px;">
        <b>Send➡️</b><br>
        <small>ctrl+enter</small> </button>
    </div>
    <details>
      <summary>
        <small style="color: #888;">rendered markdown:</small>
      </summary>
      <MessageMarkdown :content="`${props.message['content']}`" />
      <hr style="margin-top:0px;color:#ccc">
    </details>
  </div>
</template>

<script setup>
import { messageRoleNameStyle } from '@/utils/styleUtils'
import MessageMarkdown from './MessageMarkdown.vue'

import { Close } from '@element-plus/icons-vue'

const props = defineProps({
  message: {
    type: Object,
    default: {}
  },
})


const emit = defineEmits(['sendButton', 'deleteMessage'])

</script>
<style scoped>
@media (max-width: 600px) {
  .message-content {
    font-size: 16px;
  }
}
</style>