<template>
  <div class="message-as-text-render">
    <div v-if="message.reasoning" class="message-as-text-reasoning">
      <MultimodalRender :content="message.reasoning" />
    </div>
    <div v-if="message.content" class="message-as-text-content">
      <MultimodalRender :content="message.content" />
    </div>
    <ObjectViewerInDetails v-if="Object.keys(messageMeta).length" :object="messageMeta" summary="meta" />
    <ObjectViewerInDetails v-if="message.tool_calls && message.tool_calls.length" :object="message.tool_calls" summary="tool_calls" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import MultimodalRender from './MultimodalRender.vue'
import ObjectViewerInDetails from './ObjectViewerInDetails.vue'
import { MESSAGE_META_KEYS, parseMessageAsText } from '../../utils/messageTextCodec.js'

const props = defineProps({
  messageAsText: {
    type: String,
    default: '',
  },
})

const message = computed(() => parseMessageAsText(props.messageAsText))

const messageMeta = computed(() => Object.fromEntries(
  MESSAGE_META_KEYS
    .filter(key => message.value[key])
    .map(key => [key, message.value[key]])
))
</script>

<style scoped>
.message-as-text-reasoning {
  color: #757575;
}
</style>
