<template>
    <div class="md-content"  v-html="htmlContent"></div>
</template>

<script setup>
import { computed } from 'vue'
import markdown from '@/utils/markdown'

const props = defineProps({
  content: {
    type: String,
    default: ''
  },
})

const htmlContent = computed(() => {
  if (!props.content) {
    return ''
  }
  return markdown.render(props.content)
})
</script>