<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ToolInfo from './widgets/ToolInfo.vue'
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
const { t } = useI18n()
const detailsRef = ref(null)
const panelOpen = ref(false)
const hasPanelToggled = ref(false)
const toolInfoTrigger = ['hover', 'contextmenu']
const toolInfoPopoverStyle = {
    width: 'min(80vw, 1024px)',
    maxWidth: 'calc(100vw - 24px)',
}

const configTags = computed(() => toolManageState.visibleToolConfigItems.value.map(({ toolConfig, index, source }) => ({
    name: buildToolConfigTagName(toolConfig, index, source),
    toolConfig: toolConfig,
    key: `${source}-${index}`,
})))

const candidateTools = computed(() => toolManageState.allTools.value
    .map((tool, index) => ({
        index,
        tool,
        selectedIndex: toolManageState.matchedAllToSelectedIndex.value[index],
    }))
    .filter(item => item.selectedIndex == null))

const selectedTools = computed(() => toolManageState.currentDialogTools.value.map((tool, index) => ({
    index,
    tool,
})))
const selectedToolCount = computed(() => selectedTools.value.length)
const allToolCount = computed(() => toolManageState.allTools.value.length)

watch(selectedToolCount, function watchSelectedToolCount(nextSelectedToolCount) {
    if (hasPanelToggled.value || panelOpen.value || !nextSelectedToolCount) {
        return
    }
    panelOpen.value = true
}, { immediate: true })

function getToolTagName(tool) {
    const runtime = getToolRuntime(tool)
    if (runtime.displayName) {
        return runtime.displayName
    }
    if (tool.type === 'mcp') {
        return buildToolConfigTagName(tool, runtime.toolConfigIndex, runtime.source)
    }
    return tool.function.name
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

function handlePanelToggle() {
    panelOpen.value = detailsRef.value.open
    hasPanelToggled.value = true
}
</script>

<template>
    <details ref="detailsRef" class="tool-manage-panel" :open="panelOpen" @toggle="handlePanelToggle">
        <summary class="tool-manage-summary">
            Tools
            <template v-if="allToolCount">
                <code>{{ selectedToolCount }}/{{ allToolCount }}</code>
            </template>
        </summary>
        <div class="tool-manage-body">
            <div class="tool-manage-section">
                <div class="tool-manage-title">{{ t('toolManagePanel.configs') }}</div>
                <div class="tool-manage-tags">
                    <el-popover v-for="configTag in configTags" :key="configTag.key" :trigger="toolInfoTrigger"
                        placement="bottom-start" enterable effect="light" :show-after="500"
                        :popper-style="toolInfoPopoverStyle">
                        <template #reference>
                            <el-tag size="small" effect="plain">
                                {{ configTag.name }}
                            </el-tag>
                        </template>
                        <ToolInfo :title="configTag.name" :tool-config="configTag.toolConfig" />
                    </el-popover>
                    <span v-if="!configTags.length" class="tool-manage-empty">{{ t('toolManagePanel.empty') }}</span>
                </div>
            </div>

            <div class="tool-manage-section">
                <div class="tool-manage-title">{{ t('toolManagePanel.candidate') }}</div>
                <div class="tool-manage-tags">
                    <el-popover v-for="candidate in candidateTools"
                        :key="`candidate-${candidate.index}-${getToolTagName(candidate.tool)}`" :trigger="toolInfoTrigger"
                        placement="bottom-start" enterable effect="light" :show-after="500"
                        :popper-style="toolInfoPopoverStyle">
                        <template #reference>
                            <el-tag size="small" effect="plain" type="info" class="tool-manage-tag-clickable"
                                @click="appendTool(candidate.index)">
                                {{ getToolTagName(candidate.tool) }}
                            </el-tag>
                        </template>
                        <ToolInfo :title="getToolTagName(candidate.tool)" :tool="candidate.tool" />
                    </el-popover>
                    <span v-if="!candidateTools.length" class="tool-manage-empty">{{ t('toolManagePanel.empty')
                        }}</span>
                </div>
            </div>

            <div class="tool-manage-section">
                <div class="tool-manage-title">{{ t('toolManagePanel.selected') }}</div>
                <div class="tool-manage-tags">
                    <el-popover v-for="selected in selectedTools"
                        :key="`selected-${selected.index}-${getToolTagName(selected.tool)}`" :trigger="toolInfoTrigger"
                        placement="bottom-start" enterable effect="light" :show-after="500"
                        :popper-style="toolInfoPopoverStyle">
                        <template #reference>
                            <el-tag size="small" type="success" class="tool-manage-tag-clickable"
                                @click="removeTool(selected.index)">
                                {{ getToolTagName(selected.tool) }}
                            </el-tag>
                        </template>
                        <ToolInfo :title="getToolTagName(selected.tool)" :tool="selected.tool" />
                    </el-popover>
                    <span v-if="!selectedTools.length" class="tool-manage-empty">{{ t('toolManagePanel.empty') }}</span>
                </div>
            </div>
        </div>
    </details>
</template>

<style scoped>
.tool-manage-panel {
    max-width: 1024px;
    margin-top: 20px;
    margin-bottom: -5px;
    border: 1px solid #e4e7ed;
    border-radius: 6px;
    background: #f8f8f8;
    overflow: hidden;
}

.tool-manage-summary {
    padding: 6px 12px;
    font-size: 14px;
    font-weight: 600;
    color: #999;
    background: #f8f8f8;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
}

.tool-manage-summary code {
    margin-left: 4px;
    padding: 1px 4px;
    color: #888;
    font-size: 11px;
    border: 1px solid #dadada;
    border-radius: 4px;
}

.tool-manage-panel[open] .tool-manage-summary {
    border-bottom: 1px solid #e4e7ed;
}

.tool-manage-body {
    padding: 10px 12px;
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
