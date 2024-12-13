<template>
    <details>
        <summary style="color: #606266">
            <el-tooltip :content="props.tip" v-if="props.tip" placement="top">
                <small>{{ props.summary }}</small>
            </el-tooltip>
            <small v-else>{{ props.summary }}</small>
        </summary>
        <div class="raw-json-in-annotator-panel">{{
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
    tip: {
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