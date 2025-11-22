<template>

    <span class="role-name" v-show="!editingRoleName" @dblclick="focus"
        :style="messageRoleNameStyle(props.message.role)">
        {{
            props.message.role || 'unknown' }}:</span>
    <el-input ref="roleNameInput" v-show="editingRoleName" @blur="blur()" @keydown.enter="blur()" v-model="roleCache"
        style="width: 100px;" />


</template>
<script setup>
import { ref, toValue, inject } from 'vue'
import { mockObject } from '../../utils/commonUtils'

const roleNameInput = ref(null)
const operationCenterEditRole = inject('operationCenter.editRole', mockObject)

function focus() {
    roleCache.value = props.message.role
    operationCenterEditRole.before()
    editingRoleName.value = true
    roleNameInput.value.focus()
}

function blur() {
    editingRoleName.value = false
    props.message.role = roleCache.value
    operationCenterEditRole.after()
}

const props = defineProps({
    message: {
        type: Object,
        default: {}
    },
})

// roleCache can't change when props.message.role change
// const roleCache = ref(props.message?.role)  

const roleCache = ref(null)

const editingRoleName = ref(false)

const messageRoleNameStyle = (role) => {
    role = role || 'unknown'
    return {
        color: { 'user': 'orange', 'assistant': 'green', "developer": "#888", "system": "#888", 'context': "#888", "tool": "#888", 'unknown': "#888", 'prompt': "#faa" }[role] || "#f55",
        fontSize: 'larger',
        fontWeight: 'bold',
        marginBottom: '2px',
        marginTop: '10px',
    }
}
</script>