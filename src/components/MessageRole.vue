<template>

    <p class="role-name" v-show="!editingRoleName" @dblclick="focus" :style="messageRoleNameStyle(roleCache)"> {{
        roleCache || 'unknown' }}:</p>
    <el-input ref="roleNameInput" v-show="editingRoleName" @blur="blur()" @keydown.enter="blur()" v-model="roleCache"
        style="width: 100px;" />


</template>
<script setup>
import { ref, toValue, inject } from 'vue'
import { mockObject } from '@/utils/commonUtils'

const roleNameInput = ref(null)
const opreatorsEditRole = inject('opreators.editRole', mockObject)

function focus() {
    opreatorsEditRole.before()
    editingRoleName.value = true
    roleNameInput.value.focus()
}

function blur() {
    editingRoleName.value = false
    props.message.role = roleCache.value
    opreatorsEditRole.after()
}

const props = defineProps({
    message: {
        type: Object,
        default: {}
    },
})

const roleCache = ref(props.message?.role)

const editingRoleName = ref(false)

const messageRoleNameStyle = (role) => {
    role = role || 'unknown'
    return {
        color: { 'user': 'orange', 'assistant': 'green', 'context': "#888", "system": "#888", 'unknown': "#888" }[role] || "#f55",
        fontSize: 'larger',
        fontWeight: 'bold',
        marginBottom: '2px',
        marginTop: '10px'
    }
}
</script>