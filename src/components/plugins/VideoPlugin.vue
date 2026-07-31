<template>
    <video class="on-panda-video-plugin" :src="videoUrl" controls preload="metadata" />
</template>

<script setup>
import { ref, watchEffect } from 'vue'
import { base64ToBlob } from '../../utils/commonUtils.js'

const props = defineProps({
    content: {
        type: Object,
        default: () => ({})
    }
})

const videoUrl = ref('')

// Use a blob URL instead of a base64 data URL, otherwise seeking does not work.
watchEffect(function updateVideoUrl(onCleanup) {
    const url = props.content.video_url.url
    if (!url.startsWith('data:')) {
        videoUrl.value = url
        return
    }

    const blobUrl = base64ToBlob(url)
    videoUrl.value = blobUrl
    onCleanup(() => URL.revokeObjectURL(blobUrl))
})
</script>

<style scoped>
.on-panda-video-plugin {
    max-width: min(100% - 5px, 512px);
    max-height: 512px;
    margin-left: 5px;
    margin-right: 5px;
    border-radius: 8px;
    box-shadow: rgba(0, 0, 0, 0.5) 0px 0px 8px;
}
</style>
