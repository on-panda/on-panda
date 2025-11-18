<template>
    <el-dialog v-model="innerVisible" :title="props.title" destroy-on-close append-to-body fullscreen>
        <el-input v-model="localValue" type="textarea" :autosize="{ minRows: 8 }" placeholder="Enter text" />
        <div>
            <div class="dialog-footer">
                <div class="dialog-footer__buttons">
                    <el-button @click="handleCancel">{{ t('common.cancel') }}</el-button>
                    <el-button type="primary" @click="handleConfirm">{{ t('common.confirm') }}</el-button>
                </div>
            </div>
        </div>
        <div v-if="props.documentation">
            <h4>{{ t('common.instructions') }}:</h4>
            <MarkdownRender :content="props.documentation" class="dialog-footer__doc" />
        </div>
    </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import MarkdownRender from './MarkdownRender.vue'
import { ElDialog, ElInput, ElButton } from 'element-plus'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
    modelValue: {
        type: String,
        default: ''
    },
    visible: {
        type: Boolean,
        default: false
    },
    title: {
        type: String,
        default: 'Text Editor'
    },
    documentation: {
        type: String,
        default: ''
    }
})

const emit = defineEmits(['update:modelValue', 'update:visible', 'confirm', 'cancel'])

const innerVisible = ref(props.visible)
const localValue = ref(props.modelValue ?? '')

watch(
    () => props.visible,
    (value) => {
        innerVisible.value = value
    }
)

watch(innerVisible, (value) => {
    emit('update:visible', value)
})

watch(
    () => props.modelValue,
    (value) => {
        if (value !== localValue.value) {
            localValue.value = value ?? ''
        }
    }
)

watch(localValue, (value) => {
    emit('update:modelValue', value)
})

const handleConfirm = () => {
    emit('confirm', localValue.value)
    innerVisible.value = false
}

const handleCancel = () => {
    emit('cancel')
    innerVisible.value = false
}
</script>

<style scoped>
.dialog-footer {
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.dialog-footer__buttons {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
}

.dialog-footer__doc {
    padding: 12px;
    background: #f5f7fa;
    border-radius: 6px;
    max-height: 200px;
    overflow: auto;
}
</style>