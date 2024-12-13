<template>
    <small style="color: #888;display: flex; justify-content: space-between;">
        <div style="padding-right: 10px;padding-top: 10px;">
            {{ props.name || ((props.attr
                || 'unknow') + ':') }}
        </div>
        <el-input type="textarea" v-model="props.obj[props.attr]" size="small" style="display: inline;padding-top: 5px;"
            :input-style="{ color: '#888' }" :autosize="true" :disabled="props.disabled" />
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
    disabled: {
        type: Boolean,
        default: false
    },
    name: {
        type: String,
        default: ""
    },

})

</script>
