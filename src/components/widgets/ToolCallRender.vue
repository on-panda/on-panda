<template>
  <details class="tool-call-render" open>
    <summary class="tool-call-render-summary">
      <el-icon class="tool-call-render-icon">
        <PhoneFilled />
      </el-icon>
      <code>{{ props.toolCall.function?.name }}</code>
    </summary>
    <div class="tool-call-render-body">{{ props.toolCall.function?.arguments }}</div>
    <footer v-if="props.toolCall.index != null || props.toolCall.id" class="tool-call-render-footer">
      <small>
        <template v-if="props.toolCall.index != null">index: {{ props.toolCall.index }}</template>
        <template v-if="props.toolCall.index != null && props.toolCall.id">, </template>
        <template v-if="props.toolCall.id">id: {{ props.toolCall.id }}</template>
      </small>
    </footer>
  </details>
</template>

<script setup>
import { PhoneFilled } from '@element-plus/icons-vue'

const props = defineProps({
  toolCall: {
    type: Object,
    required: true,
  },
})
</script>

<style scoped>
.tool-call-render {
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  background: #f8f8f8;
  overflow: hidden;
}

.tool-call-render-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 14px;
  font-weight: 600;
  color: #999;
  background: #f8f8f8;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  list-style: none;
}

.tool-call-render-summary::-webkit-details-marker {
  display: none;
}

.tool-call-render:not([open]) .tool-call-render-summary::before {
  content: '▸';
  font-size: 12px;
  line-height: 1;
}

.tool-call-render-summary code {
  padding: 1px 4px;
  color: #888;
  font-size: 11px;
  border: 1px solid #dadada;
  border-radius: 4px;
}

.tool-call-render-icon {
  font-size: 12px;
}

.tool-call-render[open] .tool-call-render-summary {
  border-bottom: 1px solid #e4e7ed;
}

.tool-call-render-body {
  white-space: pre-wrap;
  font-family: monospace;
  background: #fafafa;
  margin: 10px 12px 6px;
  padding: 10px;
  overflow-x: auto;
}

.tool-call-render-footer {
  margin: 0 12px 10px;
  color: #999;
}
</style>
