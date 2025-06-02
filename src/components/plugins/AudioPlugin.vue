<template>
    <div class="on-panda-audio-plugin">
        <audio :src="audioUrl" controls />
    </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
    content: {
        type: Object,
        default: () => ({})
    }
})

const audioUrl = computed(() => {
    if (props.content.blob_url) {
        return props.content.blob_url
    }
    console.log(props.content)
    return props.content["audio_url"]["url"]
})

</script>