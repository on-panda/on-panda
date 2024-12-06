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
<style>
/* global CSS */
.md-content img {
  max-width: 100%;
  max-height: 100%;
  max-width: 322px;
  max-height: 386px;
  box-shadow: rgba(0, 0, 0, 0.5) 0px 0px 8px;
  margin-left: 10px;
  margin-right: 10px;
}

@media (min-width: 600px) {
  .md-content img {
    max-width: 512px;
    max-height: 512px;
  }
}
</style>