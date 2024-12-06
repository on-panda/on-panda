<template>
    <small style="color: #888;display: flex; justify-content: space-between;">
        <div style="padding-right: 10px;padding-top: 10px;">
            {{ props.title || ((props.attr
                || 'unknow') + ':') }}
        </div>
        <el-input type="textarea" v-model="props.obj[props.attr]" size="small" style="display: inline;padding-top: 5px;"
            :input-style="{ color: '#888' }" :autosize="true" :disabled="!props.editable" />
    </small>

</template>

<script setup>

const props = defineProps({
    obj: {
        type: Object,
    },
    attr: {
        type: String,
    },
    editable: {
        type: Boolean,
        default: true
    },
    title: {
        type: String,
        default: ""
    },

})

</script>
