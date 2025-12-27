<script setup>
import { nextTick, ref, watch } from 'vue'
import { useGlobalStore } from '../stores/globalStore.js'
import { createLruObject } from '../utils/commonUtils.js'
import { Edit, Refresh, ChatLineRound, QuestionFilled, Promotion } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const replacementTextCache = ref(createLruObject(100))

const props = defineProps({
    selectedTextState: {
        type: Object,
        description: 'The selected text state object',
    },
    operationCenter: {
        type: Object,
        description: 'The operation center object',
    },
})

const globalStore = useGlobalStore()

const selectedTextState = props.selectedTextState
const operationCenter = props.operationCenter

const floatSelectedOperationPanel = selectedTextState.floatSelectedOperationPanel
const selectedTokens = selectedTextState.selectedTokens
const selectedText = selectedTextState.selectedText
const improveSelectedText = selectedTextState.improveSelectedText
const floatSelectedOperationPanelRef = selectedTextState.floatSelectedOperationPanelRef

const replacementTextKey = ref("")
const editSelectedTokens = ref([])
const replacementTextareaRef = ref(null)

const replacementText = ref("")
watch(replacementText, (newValue) => {
    replacementTextCache.value.set(replacementTextKey.value, newValue)
})

function setSelectedTokensState(tokens, selected) {
    tokens.forEach(token => token.selected = selected)
}

function openEditSelection() {
    const textKey = selectedText.value
    if (!textKey || !selectedTokens.value.length) {
        return
    }
    editSelectedTokens.value = selectedTokens.value.slice()
    if (!replacementTextCache.value.has(textKey)) {
        replacementTextCache.value.set(textKey, textKey)
    } else {
        replacementTextCache.value.get(textKey)
    }
    replacementText.value = replacementTextCache.value.get(textKey)
    replacementTextKey.value = textKey
    floatSelectedOperationPanel.value.improveInputVisible = false
    floatSelectedOperationPanel.value.replacementInputVisible = true
    setSelectedTokensState(editSelectedTokens.value, true)
    nextTick(() => {
        replacementTextareaRef.value?.focus()
        replacementTextareaRef.value?.select()
    })
}

function applyEditSelection() {
    if (replacementText.value == replacementTextKey.value) {
        ElMessage({
            message: 'No changes made',
            type: 'error',
        })
        return
    }
    if (editSelectedTokens.value.length) {
        operationCenter?.editSelection(editSelectedTokens.value, replacementText.value)
    }
    floatSelectedOperationPanel.value.replacementInputVisible = false
    replacementText.value = ""
    replacementTextKey.value = ""
    editSelectedTokens.value = []
}

function cancelEditSelection() {
    floatSelectedOperationPanel.value.replacementInputVisible = false
}

function handleEditSelectionClick() {
    if (floatSelectedOperationPanel.value.replacementInputVisible) {
        cancelEditSelection()
    } else {
        openEditSelection()
    }
}

watch(floatSelectedOperationPanel, (newValue) => {
    if (!newValue.replacementInputVisible && editSelectedTokens.value.length) {
        if (editSelectedTokens.value.length) {
            setSelectedTokensState(editSelectedTokens.value, false)
        }
        replacementTextKey.value = ""
        editSelectedTokens.value = []
    }
}, { deep: true, flush: 'sync' })

</script>

<template>
    <div ref='floatSelectedOperationPanelRef' class="floatSelectedOperationPanel"
        v-show="floatSelectedOperationPanel.visible || floatSelectedOperationPanel.improveInputVisible || floatSelectedOperationPanel.replacementInputVisible"
        :style="{
            left: `${floatSelectedOperationPanel.x}px`,
            top: `${floatSelectedOperationPanel.y}px`,
        }" style="position: fixed; z-index: 10">
        <el-button-group class="floatSelectedOperationPanelButtons" @click="selectedTokens.map(
            token => token.selected = true
        )" :size="globalStore.isMobile ? '' : 'small'">
            <el-tooltip content="Edit selection" placement="bottom">
                <el-button :icon="Edit" :type="floatSelectedOperationPanel.replacementInputVisible ? 'primary' : ''"
                    @mousedown.prevent="handleEditSelectionClick" />
            </el-tooltip>
            <el-tooltip content="(WIP) Improve by AI" placement="bottom">
                <el-button :icon="ChatLineRound"
                    :type="floatSelectedOperationPanel.improveInputVisible ? 'primary' : ''"
                    @click="floatSelectedOperationPanel.improveInputVisible = true; floatSelectedOperationPanel.replacementInputVisible = false" />
            </el-tooltip>
            <el-tooltip content="(WIP) Explain by AI" placement="bottom">
                <el-button :disabled="true" :icon="QuestionFilled" />
            </el-tooltip>
            <el-tooltip content="(WIP) Try again" placement="bottom">
                <el-button :disabled="true" :icon="Refresh" />
            </el-tooltip>
        </el-button-group>
        <div v-show="floatSelectedOperationPanel.replacementInputVisible"
            style="display: flex; flex-direction: column; gap: 4px; background-color: white; padding: 7px;">
            <textarea ref="replacementTextareaRef" v-model="replacementText" type="text"
                placeholder="Edit selection text" style="height: 60px; width:auto;" @focus="$event.target.select()" />
            <div style="display: flex; justify-content: flex-end; gap: 6px;">
                <el-button :size="globalStore.isMobile ? '' : 'small'" @click="cancelEditSelection">cancel</el-button>
                <el-button :size="globalStore.isMobile ? '' : 'small'" type="primary" @click="applyEditSelection">edit
                    selection</el-button>
            </div>
        </div>
        <div v-show="floatSelectedOperationPanel.improveInputVisible"
            style="display: flex; justify-content: space-between;">
            <textarea v-model="floatSelectedOperationPanel.improveInputText" type="text"
                placeholder="(WIP) Instruction for AI to improve" style="height: 25px; width:auto;"
                @focus="$event.target.select()" @keydown.enter="improveSelectedText" />

            <el-button :disabled="true" :icon='Promotion' size="" @click="improveSelectedText"></el-button>
        </div>
    </div>

    <pre v-show="false">{{JSON.stringify(selectedTokens.map(token => token.delta.content), null, 2)}}</pre>
</template>
