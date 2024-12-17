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
  var html = markdown.render(content).trim()
  if (html.startsWith('<p>') && html.endsWith('</p>')) {
    html = html.slice(3, -4)
    // 去掉了 p 标签, 会导致动态 markdown 渲染不稳定，一直跳动，需要的话自己加上
    // Removing the p tag will cause unstable rendering in stream mode. Add it yourself if necessary.
  }
  return html
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