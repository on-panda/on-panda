<template>
    <details ref="detailsRef" @toggle="handleToggle">
        <summary style="color: #606266">
            <el-tooltip :content="props.tips" v-if="props.tips" placement="bottom">
                <small>{{ props.summary }}</small>
            </el-tooltip>
            <small v-else>{{ props.summary }}</small>
        </summary>
        <div class="raw-json-in-annotator-panel" style="overflow-x: scroll;">{{ content }}</div>
    </details>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
    object: {
        type: Object,
    },
    summary: {
        type: String,
        default: 'JSON'
    },
    tips: {
        type: String,
        default: null
    },
})

const detailsRef = ref(null)
// lazy load the content for better performance and avoid repeated key word find in the content
const content = ref('PLACEHOLDER')

const handleToggle = () => {
    content.value = detailsRef.value?.open ? JSON.stringify(props.object, null, 2) : 'PLACEHOLDER'
}

</script>
<style scoped>
.raw-json-in-annotator-panel {
    white-space: pre-wrap;
    font-family: Monospace;
    background-color: #fafafa;
    /* width: 90%; */
    margin: 10px;
    padding: 10px;
}
</style>