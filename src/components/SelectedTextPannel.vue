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
const replacementSelectedTokens = ref([])
const replacementTextareaRef = ref(null)

const replacementText = ref("")
watch(replacementText, (newValue) => {
    replacementTextCache.value.set(replacementTextKey.value, newValue)
})

function setSelectedTokensState(tokens, selected) {
    tokens.forEach(token => token.selected = selected)
}

function openReplacementEdit() {
    const textKey = selectedText.value
    if (!textKey || !selectedTokens.value.length) {
        return
    }
    replacementSelectedTokens.value = selectedTokens.value.slice()
    if (!replacementTextCache.value.has(textKey)) {
        replacementTextCache.value.set(textKey, textKey)
    } else {
        replacementTextCache.value.get(textKey)
    }
    replacementText.value = replacementTextCache.value.get(textKey)
    replacementTextKey.value = textKey
    floatSelectedOperationPanel.value.improveInputVisible = false
    floatSelectedOperationPanel.value.replacementInputVisible = true
    setSelectedTokensState(replacementSelectedTokens.value, true)
    nextTick(() => {
        replacementTextareaRef.value?.focus()
        replacementTextareaRef.value?.select()
    })
}

function applyReplacementEdit() {
    if (replacementText.value == replacementTextKey.value) {
        ElMessage({
            message: 'No changes made',
            type: 'error',
        })
        return
    }
    if (replacementSelectedTokens.value.length) {
        operationCenter?.replacementEdit(replacementSelectedTokens.value, replacementText.value)
    }
    floatSelectedOperationPanel.value.replacementInputVisible = false
    replacementText.value = ""
    replacementTextKey.value = ""
    replacementSelectedTokens.value = []
}

function cancelReplacementEdit() {
    floatSelectedOperationPanel.value.replacementInputVisible = false
}

function handleReplacementEditClick() {
    if (floatSelectedOperationPanel.value.replacementInputVisible) {
        cancelReplacementEdit()
    } else {
        openReplacementEdit()
    }
}

watch(floatSelectedOperationPanel, (newValue) => {
    if (!newValue.replacementInputVisible && replacementSelectedTokens.value.length) {
        if (replacementSelectedTokens.value.length) {
            setSelectedTokensState(replacementSelectedTokens.value, false)
        }
        replacementTextKey.value = ""
        replacementSelectedTokens.value = []
    }
}, { deep: true, flush: 'sync' })

</script>

<template>
    <div ref='floatSelectedOperationPanelRef' class="floatSelectedOperationPanel"
        v-show="floatSelectedOperationPanel.visible || floatSelectedOperationPanel.improveInputVisible || floatSelectedOperationPanel.replacementInputVisible"
        :style="{
            left: `${floatSelectedOperationPanel.x}px`,
            top: `${floatSelectedOperationPanel.y}px`,
        }" style="position: fixed">
        <el-button-group class="floatSelectedOperationPanelButtons"
            v-show="!floatSelectedOperationPanel.improveInputVisible" style="z-index: 15;" @click="selectedTokens.map(
                token => token.selected = true
            )" :size="globalStore.isMobile ? '' : 'small'">
            <el-tooltip content="Replacement edit" placement="bottom">
                <el-button :icon="Edit" @mousedown.prevent="handleReplacementEditClick" />
            </el-tooltip>
            <el-tooltip content="(TBD) Improve by AI" placement="bottom">
                <el-button :icon="ChatLineRound"
                    @click="floatSelectedOperationPanel.improveInputVisible = true; floatSelectedOperationPanel.replacementInputVisible = false" />
            </el-tooltip>
            <el-tooltip content="(TBD) Explain by AI" placement="bottom">
                <el-button :disabled="true" :icon="QuestionFilled" />
            </el-tooltip>
            <el-tooltip content="(TBD) Try again" placement="bottom">
                <el-button :disabled="true" :icon="Refresh" />
            </el-tooltip>
        </el-button-group>
        <div v-show="floatSelectedOperationPanel.replacementInputVisible"
            style="display: flex; flex-direction: column; gap: 4px; background-color: white; padding: 7px;">
            <textarea ref="replacementTextareaRef" v-model="replacementText" type="text" placeholder="Replacement text"
                style="height: 60px; width:auto;" @focus="$event.target.select()" />
            <div style="display: flex; justify-content: flex-end; gap: 6px;">
                <el-button :size="globalStore.isMobile ? '' : 'small'" @click="cancelReplacementEdit">cancel</el-button>
                <el-button :size="globalStore.isMobile ? '' : 'small'" type="primary"
                    @click="applyReplacementEdit">replacement</el-button>
            </div>
        </div>
        <div v-show="floatSelectedOperationPanel.improveInputVisible"
            style="display: flex; justify-content: space-between;">
            <textarea v-model="floatSelectedOperationPanel.improveInputText" type="text"
                placeholder="(TBD) Instruction for AI to improve" style="height: 25px; width:auto;"
                @focus="$event.target.select()" @keydown.enter="improveSelectedText" />

            <el-button :disabled="true" :icon='Promotion' size="" @click="improveSelectedText"></el-button>
        </div>
    </div>

    <pre v-show="false">{{JSON.stringify(selectedTokens.map(token => token.delta.content), null, 2)}}</pre>
</template>
