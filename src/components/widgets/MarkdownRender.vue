<template>
  <div class="on-panda-markdown-content" ref="markdownContainer" v-html="htmlContent"
    @dblclick="handleDoubleClickInMarkdown" @click="handleClickInMarkdown">
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { markdown } from '../../utils/markdown'

const props = defineProps({
  content: {
    type: String,
    default: ''
  },
})

const markdownContainer = ref(null)
const { t, locale } = useI18n()

const htmlContent = computed(() => {
  if (!props.content) {
    return ''
  }
  var html = markdown.render(props.content).trim()
  if (html.startsWith('<p>') && html.endsWith('</p>')) {
    html = html.slice(3, -4)
    // 去掉了 p 标签, 会导致动态 markdown 渲染不稳定，一直跳动，需要的话自己加上
    // Removing the p tag will cause unstable rendering in stream mode. Add it yourself if necessary.
  }
  return html
})

// for fancy copy button
const updateCopyButtonLabels = () => {
  const container = markdownContainer.value
  if (!container) {
    return
  }
  const buttons = container.querySelectorAll('.markdown-it-code-copy')
  buttons.forEach(button => {
    const label = t('common.copy')
    button.title = label
    button.setAttribute('aria-label', label)
    if (button.dataset.copyFeedback === 'active') {
      return
    }
    const span = button.querySelector('span')
    if (span) {
      span.textContent = label
    }
  })
}
const scheduleCopyButtonUpdate = () => nextTick(updateCopyButtonLabels)
watch(htmlContent, scheduleCopyButtonUpdate, { immediate: true })
watch(locale, scheduleCopyButtonUpdate)

function handleDoubleClickInMarkdown(event) {
  if (event.target.tagName === 'IMG') {
    window.open(event.target.src, '_blank')
  }
}

function handleClickInMarkdown(event) {
  if (event.target.tagName === 'IMG') {
    event.target.classList.toggle('rawSizeImg')
  }
}

</script>
<style>
/* global CSS */
.on-panda-markdown-content img {
  max-width: 100%;
  max-height: 100%;
  max-width: 322px;
  max-height: 386px;
  box-shadow: rgba(0, 0, 0, 0.5) 0px 0px 8px;
  margin-left: 10px;
  margin-right: 10px;
  cursor: zoom-in;
}

@media (min-width: 600px) {
  .on-panda-markdown-content img {
    max-width: 512px;
    max-height: 512px;
  }
}

.on-panda-markdown-content .rawSizeImg {
  max-width: initial;
  max-height: initial;
  position: relative;
  z-index: 1;
}

.on-panda-markdown-content {
  pre code {
    font-family: monospace;
    font-size: 13px;
  }

  /* Inline code */
  code {
    background-color: #eee;
    border: 1px solid #ccc;
    border-radius: 3px;
    padding: 0px 3px;
    display: inline-block;
  }

  /* Code block container */
  pre code {
    background-color: #f3f3f3;
    border: 4px solid #fff;
    border-radius: 10px;
    overflow: auto;
    line-height: 1.45;
    display: block;
    padding: 1em;
  }
  /* for fancy copy button */
  pre {
    margin: 0;
  }

  .markdown-it-code-copy {
    position: absolute;
    top: 8px;
    right: 12px;
    border: none;
    background: rgba(0, 0, 0, 0.05);
    color: rgba(0, 0, 0, 0.4);
    padding: 2px 10px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 12px;
    opacity: 0.15;
    transition: opacity 0.2s ease, background 0.2s ease, color 0.2s ease;
  }

  pre:hover+.markdown-it-code-copy,
  .markdown-it-code-copy:hover,
  .markdown-it-code-copy:focus-visible {
    opacity: 1;
    background: rgba(128, 128, 128, 0.5);
    color: #fff;
  }

  .markdown-it-code-copy:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.8);
    outline-offset: 2px;
  }

  .markdown-it-code-copy span {
    font-size: 12px;
  }
}

/* markdown table CSS */
.on-panda-markdown-content {

  table {
    border-spacing: 0;
    border-collapse: collapse;
    display: block;
    width: max-content;
    max-width: 100%;
    overflow: auto;
  }

  td,
  th {
    padding: 0
  }

  table th {
    font-weight: 600
  }

  table td,
  table th {
    padding: 6px 13px;
    border: 1px solid #d0d7de
  }

  table tr {
    background-color: #fff;
    border-top: 1px solid #d7dde3
  }

  table tr:nth-child(2n) {
    background-color: #f6f8fa
  }

  table img {
    background-color: transparent
  }


  /* 悬停效果 */
  tr:hover,
  tr:nth-child(2n):hover {
    background-color: #ecf0f1;
    /* 行悬停背景色 */
  }
}
</style>
