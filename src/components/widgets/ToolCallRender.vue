<template>
  <details class="tool-call-render" open>
    <summary class="tool-call-render-summary">
      <el-icon class="tool-call-render-icon">
        <PhoneFilled />
      </el-icon>
      <span class="tool-call-meta" :tabindex="props.toolCall.index != null || props.toolCall.id ? 0 : null">
        <code>{{ props.toolCall.function.name }}</code>
        <small v-if="props.toolCall.index != null || props.toolCall.id" class="tool-call-meta-content">
          <template v-if="props.toolCall.index != null">index: {{ props.toolCall.index }}</template>
          <template v-if="props.toolCall.index != null && props.toolCall.id">, </template>
          <template v-if="props.toolCall.id">id: {{ props.toolCall.id }}</template>
        </small>
      </span>
    </summary>
    <div v-if="parsedArguments && (parsedArguments.entries.length || parsedArguments.complete)"
      class="tool-call-render-body">
      <template v-if="parsedArguments.entries.length">
        <div v-for="(argument, argumentIndex) in parsedArguments.entries" :key="argumentIndex"
          class="tool-call-render-json-row"
          :class="{ 'tool-call-render-json-row-break': shouldBreakLineAfterSeparator(argument.value) }">
          <span class="tool-call-render-json-key">{{ argument.name }}</span>
          <template v-if="argument.value !== undefined">
            <span class="tool-call-render-json-separator">: </span>
            <div v-if="typeof argument.value === 'string'" class="tool-call-render-json-string"
              :class="{ 'tool-call-render-json-string-block': argument.value.includes('\n') }">{{ argument.value === '' ?
                '""' : argument.value }}
            </div>
            <span v-else-if="typeof argument.value === 'number' || typeof argument.value === 'boolean'"
              class="tool-call-render-json-number">{{ argument.value }}</span>
            <span v-else-if="argument.value === null" class="tool-call-render-json-null">null</span>
            <span v-else class="tool-call-render-json-object">{{ JSON.stringify(argument.value) }}</span>
          </template>
        </div>
      </template>
      <span v-else class="tool-call-render-json-object">{}</span>
    </div>
    <div v-else class="tool-call-render-body">{{ props.toolCall.function.arguments }}</div>
  </details>
</template>

<script setup>
import { computed } from 'vue'
import { PhoneFilled } from '@element-plus/icons-vue'
import { parsePartialJsonObject } from '../../utils/partialJsonUtils.js'
import { useGlobalStore } from '../../stores/globalStore.js'

const props = defineProps({
  toolCall: {
    type: Object,
    required: true,
  },
})
const globalStore = useGlobalStore()

function shouldBreakLineAfterSeparator(value) {
  if (!globalStore.isMobile || value === null || typeof value !== 'string' && typeof value !== 'object') {
    return false
  }
  const renderedValue = typeof value === 'string' ? value : JSON.stringify(value)
  return renderedValue.includes('\n') || renderedValue.length > 100
}

const parsedArguments = computed(() => parsePartialJsonObject(props.toolCall.function.arguments))
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
  color: #aaa;
  font-size: 11px;
  border: 1px solid #dadada;
  border-radius: 4px;
}

.tool-call-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tool-call-meta-content {
  font-weight: 520;
  font-size: 11px;
  display: none;
  color: #999;
}

.tool-call-meta:hover .tool-call-meta-content,
.tool-call-meta:focus .tool-call-meta-content {
  display: inline;
}

.tool-call-render-icon {
  font-size: 12px;
}

.tool-call-render[open] .tool-call-render-summary {
  border-bottom: 1px solid #e4e7ed;
}

.tool-call-render-body {
  white-space: pre-wrap;
  font-family: consolas, menlo, monaco, "Ubuntu Mono", source-code-pro, monospace;
  background: #fafafa;
  padding: 10px;
  overflow-x: auto;
}

.tool-call-render-json-row {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
}

.tool-call-render-json-row+.tool-call-render-json-row {
  margin-top: 6px;
}

.tool-call-render-json-key {
  color: #000;
}

.tool-call-render-json-separator {
  color: rgba(0, 0, 0, 0.38);
  flex: none;
}

.tool-call-render-json-string {
  flex: 1;
  min-width: 0;
  color: rgb(0, 128, 0);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.tool-call-render-json-string-block {
  padding: 0 4px;
  border-radius: 4px;
  font-size: 14px;
  background: rgba(0, 128, 0, 0.07);
}

.tool-call-render-json-object {
  color: rgb(0, 64, 0);
}

.tool-call-render-json-number {
  color: #1d8ce0;
}

.tool-call-render-json-null {
  color: #d55fde;
}

.tool-call-render-json-row-break .tool-call-render-json-string,
.tool-call-render-json-row-break .tool-call-render-json-number,
.tool-call-render-json-row-break .tool-call-render-json-null,
.tool-call-render-json-row-break .tool-call-render-json-object {
  flex-basis: 100%;
}
</style>
