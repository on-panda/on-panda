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
import { multimodalChunkStringToObject } from '../../utils/multimodalUtils.js'

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
  var content = props.content
  // var content = 'before<|ON_PANDA_OBJECT_START|>1st<|ON_PANDA_OBJECT_END|>after<|ON_PANDA_OBJECT_START|>2th<|ON_PANDA_OBJECT_END|><|ON_PANDA_OBJECT_START|>3th<|ON_PANDA_OBJECT_END|>end'
  const chunkStrings = content.split(/(<\|ON_PANDA_OBJECT_START\|>.*?)<\|ON_PANDA_OBJECT_END\|>/)
  var contentChunks = chunkStrings.filter(chunk => chunk.length > 0).map(chunk => {
    if (chunk.startsWith('<|ON_PANDA_OBJECT_START|>')) {
      chunk = chunk.slice('<|ON_PANDA_OBJECT_START|>'.length)
      var chunkObj = multimodalChunkStringToObject(chunk, globalStore.blobUrlToBase64Cache, false)
      return { type: chunkObj.type, content: chunkObj }
    }
    return { type: 'text', content: chunk }
  })
  return contentChunks
})

</script>
