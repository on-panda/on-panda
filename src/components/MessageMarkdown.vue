<template>
  <div class="md-content" v-html="htmlContent"></div>
</template>

<script setup>
import { computed } from 'vue'
import { markdown } from '@/utils/markdown'

const props = defineProps({
  content: {
    type: String,
    default: ''
  },
  replaceBBCodeLatexDelimiters: {
    type: Boolean,
    default: true
  },
})

const htmlContent = computed(() => {
  if (!props.content) {
    return ''
  }
  var content = props.content
  if (props.replaceBBCodeLatexDelimiters) {
    content = content
    .replace(/\\\[ /g, "$$")
    .replace(/ \\]/g, "$$")
    .replace(/\\\(\s/g, "$")
    .replace(/\s\\\)/g, "$")
    .replace(/\\\[/g, "$$")
    .replace(/\\\]/g, "$$")
    .replace(/\\\(/g, "$")
    .replace(/\\\)/g, "$");
  }
  return markdown.render(content)
})
</script>