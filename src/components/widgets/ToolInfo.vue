<script setup>
import { computed } from 'vue'
import MarkdownRender from './MarkdownRender.vue'
import { getToolRuntime } from '../../utils/toolUtils.js'

const props = defineProps({
    title: {
        type: String,
        default: '',
    },
    tool: {
        type: Object,
        default: null,
    },
    toolConfig: {
        type: Object,
        default: null,
    },
})

const runtime = computed(() => props.tool ? getToolRuntime(props.tool) : {})
const target = computed(() => props.toolConfig || props.tool || {})
const isMcpPlaceholder = computed(() => props.tool?.type === 'mcp' && runtime.value.isPlaceholder)

const headerTitle = computed(() => {
    if (props.title) {
        return props.title
    }
    if (target.value.type === 'function') {
        return target.value.function.name
    }
    if (target.value.type === 'mcp') {
        return target.value.server_label || target.value.server_url || 'mcp'
    }
    return 'tool'
})

const headerType = computed(() => {
    if (props.toolConfig) {
        return `${props.toolConfig.type} config`
    }
    if (isMcpPlaceholder.value) {
        return 'mcp placeholder'
    }
    return props.tool.type
})

const description = computed(() => {
    if (target.value.type === 'function') {
        return target.value.function.description
    }
    return ''
})

const schemaMarkdown = computed(() => {
    if (target.value.type === 'function') {
        return `\`\`\`json\n${JSON.stringify(target.value.function.parameters, null, 2)}\n\`\`\``
    }
    return ''
})

const infoRows = computed(() => {
    const rows = []
    if (props.toolConfig?.type === 'function') {
        rows.push({ label: 'Type', value: 'function' })
        rows.push({ label: 'Name', value: props.toolConfig.function.name, code: true })
        if (props.toolConfig.require_approval) {
            rows.push({ label: 'Require Approval', value: props.toolConfig.require_approval, code: true })
        }
        if (props.toolConfig.tool_name_format) {
            rows.push({ label: 'Tool Name Format', value: props.toolConfig.tool_name_format, code: true })
        }
        return rows
    }
    if (props.toolConfig?.type === 'mcp') {
        rows.push({ label: 'Type', value: 'mcp' })
        if (props.toolConfig.server_label) {
            rows.push({ label: 'Server Label', value: props.toolConfig.server_label, code: true })
        }
        rows.push({ label: 'Server URL', value: props.toolConfig.server_url, code: true })
        if (props.toolConfig.require_approval) {
            rows.push({ label: 'Require Approval', value: props.toolConfig.require_approval, code: true })
        }
        if (props.toolConfig.tool_name_format) {
            rows.push({ label: 'Tool Name Format', value: props.toolConfig.tool_name_format, code: true })
        }
        return rows
    }
    if (props.tool?.type === 'function') {
        rows.push({ label: 'Type', value: 'function' })
        rows.push({ label: 'Name', value: props.tool.function.name, code: true })
        return rows
    }
    if (props.tool?.type === 'mcp') {
        rows.push({ label: 'Type', value: isMcpPlaceholder.value ? 'mcp placeholder' : 'mcp' })
        if (props.tool.server_label) {
            rows.push({ label: 'Server Label', value: props.tool.server_label, code: true })
        }
        if (props.tool.server_url) {
            rows.push({ label: 'Server URL', value: props.tool.server_url, code: true })
        }
        if (props.tool.require_approval) {
            rows.push({ label: 'Require Approval', value: props.tool.require_approval, code: true })
        }
        if (props.tool.tool_name_format) {
            rows.push({ label: 'Tool Name Format', value: props.tool.tool_name_format, code: true })
        }
        if (runtime.value.source) {
            rows.push({ label: 'Source', value: runtime.value.source, code: true })
        }
        if (runtime.value.toolConfigIndex != null) {
            rows.push({ label: 'Config Index', value: String(runtime.value.toolConfigIndex + 1), code: true })
        }
        return rows
    }
    return rows
})

const summary = computed(() => {
    if (isMcpPlaceholder.value) {
        return 'This MCP config has not been expanded into concrete tools yet.'
    }
    if (props.toolConfig?.type === 'mcp') {
        return 'This tag represents an MCP config instead of a concrete callable tool.'
    }
    return ''
})
</script>

<template>
    <div class="tool-info-panel">
        <div class="tool-info-header">
            <b class="tool-info-title">{{ headerTitle }}</b>
            <small class="tool-info-type">{{ headerType }}</small>
        </div>

        <div v-if="summary" class="tool-info-row">
            <span class="tool-info-label">Summary</span>
            <span class="tool-info-value">{{ summary }}</span>
        </div>

        <div v-if="infoRows.length" class="tool-info-grid">
            <div v-for="row in infoRows" :key="row.label" class="tool-info-row">
                <span class="tool-info-label">{{ row.label }}</span>
                <code v-if="row.code" class="tool-info-value tool-info-code">{{ row.value }}</code>
                <span v-else class="tool-info-value">{{ row.value }}</span>
            </div>
        </div>

        <div v-if="description" class="tool-info-section">
            <div class="tool-info-section-title">Description</div>
            <div class="tool-info-description">{{ description }}</div>
        </div>

        <div v-if="schemaMarkdown" class="tool-info-section">
            <div class="tool-info-section-title">Schema</div>
            <MarkdownRender :content="schemaMarkdown" />
        </div>
    </div>
</template>

<style scoped>
.tool-info-panel {
    width: 100%;
    max-width: 100%;
    color: #666;
    line-height: 1.6;
    box-sizing: border-box;
}

.tool-info-header {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 8px;
}

.tool-info-title {
    flex: none;
    color: #555;
    font-size: 13px;
}

.tool-info-type {
    flex: none;
    color: #999;
    font-size: 11px;
    text-transform: lowercase;
}

.tool-info-grid {
    display: grid;
    gap: 6px;
}

.tool-info-row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
}

.tool-info-label {
    flex: 0 0 112px;
    color: #999;
    font-size: 12px;
    line-height: 1.8;
}

.tool-info-value {
    flex: 1;
    min-width: 0;
    color: #555;
    font-size: 12px;
    overflow-wrap: anywhere;
    line-height: 1.8;
}

.tool-info-code {
    flex: 0 1 auto;
    display: inline-block;
    max-width: 100%;
    padding: 1px 4px;
    font-size: 11px;
    color: #888;
    border: 1px solid #dadada;
    border-radius: 4px;
    background: #fafafa;
    box-sizing: border-box;
    line-height: 1.6;
}

.tool-info-section {
    margin-top: 12px;
}

.tool-info-section-title {
    margin-bottom: 6px;
    color: #999;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
}

.tool-info-description {
    color: #555;
    font-size: 12px;
    white-space: pre-wrap;
}

.tool-info-panel :deep(.on-panda-markdown-content) {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
}

.tool-info-panel :deep(pre) {
    width: 100%;
    max-width: 100%;
}

.tool-info-panel :deep(pre code) {
    width: 100%;
    max-width: 100%;
    max-height: 320px;
    overflow: auto;
    box-sizing: border-box;
}
</style>
