<!--
    MultimodalRender is a component that renders text content with multimodal support.
  -->

<template>
  <div class="on-panda-multimodal-render">
    <!-- <MarkdownRender v-for="chunk in contentChunks" :key="chunk.content" :content="chunk.content" /> -->
    <component
      :is="globalStore.multimodalPlugins[chunk.type]?.component || (props.isPlainText ? PlainTextRender : MarkdownRender)"
      v-for="chunk in contentChunks" :content="chunk.content" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import MarkdownRender from './MarkdownRender.vue'
import PlainTextRender from './PlainTextRender.vue'
import { useGlobalStore } from '../../stores/globalStore.js'
import { parseContentAsText } from '../../utils/messageTextCodec.js'

const props = defineProps({
  content: {
    type: String,
    default: ''
  },
  isPlainText: {
    type: Boolean,
    default: false,
  },
})

const globalStore = useGlobalStore()

const contentChunks = computed(() => {
  var content = parseContentAsText(props.content, {
    blobUrlToBase64Cache: globalStore.blobUrlToBase64Cache,
  })
  if (typeof content === 'string') {
    return [{ type: 'text', content }]
  }
  return content.map(chunk => {
    if (chunk.type === 'text') {
      return { type: 'text', content: chunk.text }
    }
    return { type: chunk.type, content: chunk }
  })
})

</script>
