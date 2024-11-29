<template>

    <p class="role-name" v-if="!editingRoleName" @dblclick="editingRoleName = true"
        :style="messageRoleNameStyle(props.message)"> {{ props.message['role'] || 'unknown' }}:</p>
    <el-input v-if="editingRoleName" @blur="editingRoleName = false" @keydown.enter="editingRoleName = false"
        v-model="props.message['role']" size="" style="width: 100px;" />


</template>
<script setup>
import { defineProps, ref, toValue } from 'vue'

const props = defineProps({
    message: {
        type: Object,
        default: {}
    },
})

const editingRoleName = ref(false)

const messageRoleNameStyle = (message) => {
    var role = message['role'] ? toValue(message)['role'] : 'unknown'
    return {
        color: { 'user': 'orange', 'assistant': 'green', 'context': "#888", "system": "#888", 'unknown': "#888" }[role] || "#f55",
        fontSize: 'larger',
        fontWeight: 'bold',
        marginBottom: '2px',
        marginTop: '10px'
    }
}
</script>