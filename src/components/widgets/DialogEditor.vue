<template>
    <el-dialog v-model="innerVisible" :title="props.title" destroy-on-close append-to-body :width="dialogWidth"
        style="max-width: 1024px;">
        <el-input v-model="localValue" type="textarea" :autosize="{ minRows: 8 }" placeholder="Enter text" />
        <div>
            <div class="dialog-footer">
                <div class="dialog-footer__buttons">
                    <el-button @click="handleCancel">{{ t('common.cancel') }}</el-button>
                    <el-button type="primary" @click="handleConfirm">{{ t('common.confirm') }}</el-button>
                </div>
            </div>
        </div>
        <div v-if="props.instructions">
            <h4>{{ t('common.instructions') }}:</h4>
            <MarkdownRender :content="instructions" class="dialog-footer__doc" />
        </div>
    </el-dialog>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import MarkdownRender from './MarkdownRender.vue'
import { ElDialog, ElInput, ElButton } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useGlobalStore } from '../../stores/globalStore'

const { t } = useI18n()
const globalStore = useGlobalStore()
const dialogWidth = computed(() => globalStore.isMobile ? '95%' : '80%')

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
    instructions: {
        type: String,
        default: ''
    }
})

const instructions = computed(() => props.instructions.replaceAll('&#123;', '{').replaceAll('&#125;', '}'))
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
    overflow: auto;
}
</style>
