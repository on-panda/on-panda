<template>
  <div class="message-as-text-render">
    <ObjectViewerInDetails v-if="Object.keys(messageMeta).length" :object="messageMeta" summary="meta" />
    <details v-if="message.reasoning" class="message-as-text-reasoning-panel"
      :open="reasoningUiDisplayMode !== 'close'">
      <summary class="message-as-text-reasoning-summary" @click.prevent="handleReasoningSummaryClick">
        reasoning
      </summary>
      <div class="message-as-text-reasoning-body" :class="`message-as-text-reasoning-body-${reasoningUiDisplayMode}`"
        @click="handleReasoningBodyClick">
        <MultimodalRender :content="message.reasoning" />
      </div>
    </details>
    <div v-if="message.content" class="message-as-text-content">
      <MultimodalRender :content="message.content" />
    </div>
    <ObjectViewerInDetails v-if="message.tool_calls && message.tool_calls.length" :object="message.tool_calls"
      summary="tool_calls" />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import MultimodalRender from './MultimodalRender.vue'
import ObjectViewerInDetails from './ObjectViewerInDetails.vue'
import { MESSAGE_META_KEYS, parseMessageAsText } from '../../utils/messageTextCodec.js'

const props = defineProps({
  messageAsText: {
    type: String,
    default: '',
  },
  initReasoningDisplayMode: {
    type: String,
    default: 'restrict',
  },
})

const message = computed(() => parseMessageAsText(props.messageAsText))
const reasoningDisplayMode = ref(props.initReasoningDisplayMode)

const messageMeta = computed(() => Object.fromEntries(
  MESSAGE_META_KEYS
    .filter(key => message.value[key])
    .map(key => [key, message.value[key]])
))

const isRestrictFullSameHight = computed(() => {
  return (message.value.reasoning || '').length < 360 && ((message.value.reasoning || '').match(/\n/g) || []).length < 6
})
const reasoningUiDisplayMode = computed(() => {
  if (reasoningDisplayMode.value === 'restrict' && isRestrictFullSameHight.value) {
    return 'full'
  }
  return reasoningDisplayMode.value
})

function handleReasoningSummaryClick() {
  if (isRestrictFullSameHight.value) {
    reasoningDisplayMode.value = reasoningDisplayMode.value === 'close' ? 'full' : 'close'
    return
  }
  if (reasoningDisplayMode.value === 'close') {
    reasoningDisplayMode.value = 'restrict'
  } else if (reasoningDisplayMode.value === 'restrict') {
    reasoningDisplayMode.value = 'full'
  } else {
    reasoningDisplayMode.value = 'close'
  }
}

function handleReasoningBodyClick() {
  if (reasoningUiDisplayMode.value === 'restrict') {
    reasoningDisplayMode.value = 'full'
  }
}
</script>

<style scoped>
.message-as-text-reasoning-panel {
  margin-bottom: 8px;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  background: #f8f8f8;
  overflow: hidden;
}

.message-as-text-reasoning-summary {
  padding: 6px 12px;
  font-size: 14px;
  font-weight: 600;
  color: #999;
  background: #f8f8f8;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
}

.message-as-text-reasoning-panel[open] .message-as-text-reasoning-summary {
  border-bottom: 1px solid #e4e7ed;
}

.message-as-text-reasoning-body {
  padding: 10px 12px;
  color: #757575;
}

.message-as-text-reasoning-body-restrict {
  position: relative;
  max-height: 130px;
  overflow: hidden;
  cursor: pointer;
}

.message-as-text-reasoning-body-restrict::after {
  content: '';
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 55px;
  background: linear-gradient(180deg, rgb(248 248 248 / 0%), #f8f8f8);
  pointer-events: none;
}
</style>
