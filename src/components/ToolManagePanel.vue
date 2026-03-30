<script setup>
import { computed } from 'vue'
import { buildToolConfigTagName, getToolRuntime } from '../utils/toolUtils.js'

const props = defineProps({
    responseState: {
        type: Object,
        required: true,
    },
    toolManageState: {
        type: Object,
        required: true,
    },
})

const { responseState, toolManageState } = props
const pandaState = responseState.pandaState

const configTags = computed(() => [
    ...toolManageState.dataToolConfigs.value.map((toolConfig, index) => ({
        name: buildToolConfigTagName(toolConfig, index, 'data'),
        key: `data-${index}`,
    })),
    ...toolManageState.presetToolConfigsInput.value.map((toolConfig, index) => ({
        name: buildToolConfigTagName(toolConfig, index, 'preset'),
        key: `preset-${index}`,
    })),
])

const candidateTools = computed(() => toolManageState.allTools.value
    .map((tool, index) => ({
        index,
        tool,
        selectedIndex: toolManageState.matchedAllToSelectedIndex.value[index],
    }))
    .filter(item => item.selectedIndex == null))

const selectedTools = computed(() => (toolManageState.currentDialogTools.value || []).map((tool, index) => ({
    index,
    tool,
})))

function getToolTagName(tool = {}) {
    const runtime = getToolRuntime(tool)
    if (runtime.displayName) {
        return runtime.displayName
    }
    if (tool.type === 'mcp') {
        return buildToolConfigTagName(tool, runtime.toolConfigIndex || 0, runtime.source || 'data')
    }
    return tool.function?.name || 'function'
}

async function appendTool(allToolIndex = -1) {
    pandaState.beforeOperation()
    try {
        await toolManageState.appendToolToDialog(allToolIndex)
        pandaState.afterOperation({
            operator: 'edit_tools',
            on_policy: false,
        })
    } catch (error) {
        responseState.warning(error)
    }
}

async function removeTool(selectedToolIndex = -1) {
    pandaState.beforeOperation()
    try {
        await toolManageState.removeSelectedTool(selectedToolIndex)
        pandaState.afterOperation({
            operator: 'edit_tools',
            on_policy: false,
        })
    } catch (error) {
        responseState.warning(error)
    }
}
</script>

<template>
    <div class="tool-manage-panel">
        <div class="tool-manage-section">
            <div class="tool-manage-title">configs</div>
            <div class="tool-manage-tags">
                <el-tag v-for="configTag in configTags" :key="configTag.key" size="small" effect="plain">
                    {{ configTag.name }}
                </el-tag>
                <span v-if="!configTags.length" class="tool-manage-empty">empty</span>
            </div>
        </div>

        <div class="tool-manage-section">
            <div class="tool-manage-title">candidate</div>
            <div class="tool-manage-tags">
                <el-tag v-for="candidate in candidateTools" :key="`candidate-${candidate.index}-${getToolTagName(candidate.tool)}`"
                    size="small" effect="plain" class="tool-manage-tag-clickable" @click="appendTool(candidate.index)">
                    {{ getToolTagName(candidate.tool) }}
                </el-tag>
                <span v-if="!candidateTools.length" class="tool-manage-empty">empty</span>
            </div>
        </div>

        <div class="tool-manage-section">
            <div class="tool-manage-title">selected</div>
            <div class="tool-manage-tags">
                <el-tag v-for="selected in selectedTools" :key="`selected-${selected.index}-${getToolTagName(selected.tool)}`"
                    size="small" type="success" class="tool-manage-tag-clickable" @click="removeTool(selected.index)">
                    {{ getToolTagName(selected.tool) }}
                </el-tag>
                <span v-if="!selectedTools.length" class="tool-manage-empty">empty</span>
            </div>
        </div>
    </div>
</template>

<style scoped>
.tool-manage-panel {
    margin-bottom: 12px;
    padding: 10px 12px;
    border: 1px solid #e4e7ed;
    border-radius: 6px;
    background: #fafafa;
}

.tool-manage-section+.tool-manage-section {
    margin-top: 10px;
}

.tool-manage-title {
    margin-bottom: 6px;
    font-size: 12px;
    font-weight: 600;
    color: #666;
    text-transform: lowercase;
}

.tool-manage-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-height: 24px;
}

.tool-manage-tag-clickable {
    cursor: pointer;
}

.tool-manage-empty {
    font-size: 12px;
    color: #999;
}
</style>
