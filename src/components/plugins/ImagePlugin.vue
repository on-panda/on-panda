<template>
    <img class="on-panda-image-plugin" :src="imageUrl" alt="<|ON_PANDA_IMAGE|>" @click="handleClick"
        @dblclick="handleDoubleClick">
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
    content: {
        type: Object,
        default: () => ({})
    }
})

const imageUrl = computed(() => props.content.blob_url || props.content.image_url.url)

function handleClick(event) {
    event.target.classList.toggle('rawSizeImg')
}

function handleDoubleClick() {
    window.open(imageUrl.value, '_blank')
}
</script>

<style scoped>
.on-panda-image-plugin {
    max-width: min(100% - 5px, 512px);
    max-height: 512px;
    box-shadow: rgba(0, 0, 0, 0.5) 0px 0px 8px;
    margin-left: 5px;
    margin-right: 5px;
    cursor: zoom-in;
}

.on-panda-image-plugin.rawSizeImg {
    max-width: initial;
    max-height: initial;
    position: relative;
    z-index: 1;
}
</style>
