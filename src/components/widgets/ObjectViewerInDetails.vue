<template>
    <details>
        <summary style="color: #606266">
            <el-tooltip :content="props.tips" v-if="props.tips" placement="top">
                <small>{{ props.summary }}</small>
            </el-tooltip>
            <small v-else>{{ props.summary }}</small>
        </summary>
        <div class="raw-json-in-annotator-panel" style="overflow-x: scroll;">{{
            JSON.stringify(props.object, null, 2) }}</div>
    </details>
</template>

<script setup>

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