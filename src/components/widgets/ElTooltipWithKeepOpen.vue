<script setup>
import { computed, ref } from 'vue'

defineOptions({
  inheritAttrs: false,
})

const props = defineProps({
  keepOpen: {
    type: Boolean,
    default: false,
  },
  visible: {
    type: Boolean,
    default: undefined,
  },
})

const emit = defineEmits(['update:visible'])

const visibleState = ref(false)

const tooltipVisible = computed({
  get() {
    return props.visible ?? visibleState.value
  },
  set(value) {
    if (!value && props.keepOpen) {
      return
    }
    if (props.visible === undefined) {
      visibleState.value = value
    }
    emit('update:visible', value)
  },
})
</script>

<template>
  <el-tooltip v-bind="$attrs" v-model:visible="tooltipVisible">
    <template #content>
      <slot name="content" />
    </template>
    <slot />
  </el-tooltip>
</template>
