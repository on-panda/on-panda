<template>
    <span class="message-role">
        <span class="role-name" v-show="!editingRoleName" @dblclick="focus"
            :style="messageRoleNameStyle(props.message.role)">
            {{ props.message.role || 'unknown' }}</span>
        <el-input ref="roleNameInput" v-show="editingRoleName" @blur="blur()" @keydown.enter="blur()"
            v-model="roleCache" style="width: 100px;" />
        <span v-if="props.message.name" class="message-meta" :tabindex="props.message.tool_call_id ? 0 : null">
            <code>{{ props.message.name }}</code>
            <small v-if="props.message.tool_call_id" class="message-meta-content">tool_call_id: {{
                props.message.tool_call_id }}</small>
        </span>
        <span class="role-name" v-else :style="messageRoleNameStyle(props.message.role)">:</span>
    </span>
</template>
<script setup>
import { ref, inject } from 'vue'
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
        color: { 'user': 'orange', 'assistant': 'green', "developer": "#888", "system": "#888", 'context': "#888", "tool": "orange", 'unknown': "#888", 'prompt': "#faa" }[role] || "#f55",
        fontSize: 'larger',
        fontWeight: 'bold',
        marginBottom: '2px',
        marginTop: '10px',
    }
}
</script>

<style scoped>
.message-role {
    display: inline-flex;
    align-items: center;
    gap: 0px;
    flex-wrap: wrap;
}

.message-meta {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 8px 1px 0px 3px;
}

.message-meta code {
    padding: 1px 4px;
    color: #aaa;
    font-weight: 600;
    font-size: 11px;
    border: 1px solid #dadada;
    border-radius: 4px;
}

.message-meta-content {
    font-weight: 520;
    font-size: 11px;
    display: none;
    color: #999;
}

.message-meta:hover .message-meta-content,
.message-meta:focus .message-meta-content {
    display: inline;
}
</style>
