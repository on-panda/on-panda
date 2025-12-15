<script setup>
import { useGlobalStore } from '../stores/globalStore.js'
import { Edit, Refresh, ChatLineRound, QuestionFilled, Promotion } from '@element-plus/icons-vue'

const props = defineProps({
    selectedTextState: {
        type: Object,
        description: 'The selected text state object',
    },
})

const globalStore = useGlobalStore()

const selectedTextState = props.selectedTextState

const floatSelectedOperationPanel = selectedTextState.floatSelectedOperationPanel
const selectedTokens = selectedTextState.selectedTokens
const improveSelectedText = selectedTextState.improveSelectedText
const floatSelectedOperationPanelRef = selectedTextState.floatSelectedOperationPanelRef
</script>

<template>
    <div ref='floatSelectedOperationPanelRef' class="floatSelectedOperationPanel"
        v-show="floatSelectedOperationPanel.visible || floatSelectedOperationPanel.improveInputVisible" :style="{
            left: `${floatSelectedOperationPanel.x}px`,
            top: `${floatSelectedOperationPanel.y}px`,
        }" style="position: fixed">
        <el-button-group class="floatSelectedOperationPanelButtons"
            v-show="!floatSelectedOperationPanel.improveInputVisible" style="z-index: 15;" @click="selectedTokens.map(
                token => token.selected = true
            )" :size="globalStore.isMobile ? '' : 'small'">
            <el-tooltip content="(TBD) Replacement edit" placement="bottom">
                <el-button :disabled="true" :icon="Edit" />
            </el-tooltip>
            <el-tooltip content="(TBD) Improve by AI" placement="bottom">
                <el-button :icon="ChatLineRound" @click="floatSelectedOperationPanel.improveInputVisible = true" />
            </el-tooltip>
            <el-tooltip content="(TBD) Explain by AI" placement="bottom">
                <el-button :disabled="true" :icon="QuestionFilled" />
            </el-tooltip>
            <el-tooltip content="(TBD) Try again" placement="bottom">
                <el-button :disabled="true" :icon="Refresh" />
            </el-tooltip>
        </el-button-group>
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
