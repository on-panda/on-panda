<template>
    <el-button-group>
        <el-button :disabled="props.disabled" :type="{ true: 'success', false: 'info', null: 'default' }[checkboxValue] || 'warning'"
            @click="emit('updateCheckboxValue', true)">
            <b>Y</b>
        </el-button>
        <el-button :disabled="props.disabled" :type="{ true: 'info', false: 'danger', null: 'default' }[checkboxValue] || 'warning'"
            @click="emit('updateCheckboxValue', false)">
            <b>N</b>
        </el-button>
    </el-button-group>
</template>


<script setup>

const props = defineProps({
    checkboxValue: {
        type: [Boolean, null],
        default: null
    },
    disabled: {
        type: Boolean,
        default: false
    }
})

const emit = defineEmits(['updateCheckboxValue'])

</script>
