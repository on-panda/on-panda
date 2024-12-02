<template>
    <small style="color: #888;display: flex; justify-content: space-between;">
        <div style="padding-right: 10px;padding-top: 10px;">
            {{ props.title }}
        </div>
        <el-input type="textarea" v-model="props.content" size="small" style="display: inline;padding-top: 5px;"
            :autosize="true" :disabled="!props.editable" />
    </small>
</template>

<script setup>

const props = defineProps({
    title: {
        type: String,
        default: ""
    },
    content: {
        type: String,
        default: ""
    },
    editable: {
        type: Boolean,
        default: true
    },

})

</script>
