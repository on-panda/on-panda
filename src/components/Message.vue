<template>

  <p class="role-name" :style="messageRoleNameStyle(props.message)"> {{ props.message['role'] }}:</p>
  <div style="display: flex; justify-content: space-between;max-width: 1024px;">
    <el-input class="message-content" v-model="props.message['content']" type="textarea"
      placeholder="Empty message will be ignored" :autosize="{ minRows: 2, maxRows: 50 }"
      @keydown.ctrl.enter="$emit('sendButton')" />

    <button @click="$emit('sendButton')"
      style="margin-left: 5px; background-color: lightskyblue; color:#fff; padding: 8px; border-radius: 7px;">
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
</template>

<script setup>
import { messageRoleNameStyle } from '@/utils/styleUtils'
import MessageMarkdown from './MessageMarkdown.vue'

const props = defineProps({
  message: {
    type: Object,
    default: {}
  },
})


const emit = defineEmits(['sendButton'])

</script>
<style scoped>
@media (max-width: 600px) {
  .message-content {
    font-size: 16px;
  }
}
</style>