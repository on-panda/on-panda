<template>
  <pre class="on-panda-plain-text-content">{{ props.content }}</pre>
</template>

<script setup>
const props = defineProps({
  content: {
    type: String,
    default: ''
  },
})
</script>

<style scoped>
.on-panda-plain-text-content {
  margin: 0;
  padding: 0 4px;
  border-radius: 4px;
  font-size: 15px;
  color: #303133;
  background: rgba(255, 255, 255, 0.04);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: consolas, menlo, monaco, "Ubuntu Mono", source-code-pro, monospace;
}
</style>
