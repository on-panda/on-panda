<script setup>
import { useI18n } from 'vue-i18n'
import { InfoFilled } from '@element-plus/icons-vue'
import MarkdownRender from './MarkdownRender.vue'

const { t } = useI18n()

const props = defineProps({
    pandaState: {
        type: Object,
        required: true
    }
})

function isDialogKeyBelongGenerateNew(key) {
    var dialog = pandaState.pandaTree.value.dialogs[key]
    // only show generated new hint when the dialog is annotated
    // otherwise, it's visually confusing
    if (dialog?.annotate?.is_good === undefined) {
        return
    }
    return dialog?.operations[0]?.operator === "generate_new"
}

var pandaState = props.pandaState
</script>
<template>
    <div class='dialogKeysFooter' style="color:#555;margin-bottom: 10px;">
        &nbsp;
        <small v-for="(key, idx) in pandaState.dialogKeys.value"
            style="cursor: pointer;width: 30px; display: inline-block;text-align: center;"
            @click="pandaState.switchDialogByIndex(idx)" :style="(key in pandaState.pandaTree.value.dialogs) ? {} : {
                textDecorationLine: 'line-through',
                textDecorationColor: 'red', color: '#bbb'
            }">
            <span
                :style="idx == pandaState.currentDialogIndex.value ? { color: '#409eff', fontWeight: 550, fontSize: 'medium' } : {}">
                &#8202; {{ key }}<div
                    style="width: 0px; height: 0px; overflow:visible;display: inline-block;position: relative;left: 2px;bottom: 10px;align-items: bottom;">
                    <!-- color dots for hinting, must remove all spaces before and after the dot div -->
                    <!-- hinting is_good dialog -->
                    <div class="onPandaDotHint"
                        :style="pandaState.isDialogKeyIsGood(key) ? { backgroundColor: '#07c20a' } : { backgroundColor: 'rgba(0,0,255,0)' }">
                    </div>
                    <div style="height:3px"></div>
                    <!-- hinting generate_new dialog -->
                    <div class="onPandaDotHint"
                        :style="isDialogKeyBelongGenerateNew(key) ? { backgroundColor: '#409eff' } : { backgroundColor: 'rgba(0,0,255,0)' }">
                    </div>
                </div>&#8202;
            </span>
        </small>
        <small style="margin-left: 12px;" v-if="pandaState.dialogCache.value?.annotate?.is_good !== undefined">
            <el-tooltip class="" effect="light" placement="bottom" raw-content>
                <template #content>
                    <MarkdownRender :content="t('tooltips.dialogKeyHint')" />
                </template>
                <el-icon>
                    <InfoFilled style="width: 11px;height: 11px;" />
                </el-icon>
            </el-tooltip>
        </small>
    </div>
</template>

<style scoped>
.onPandaDotHint {
    height: 4px;
    width: 4px;
    border-radius: 50%;
}
</style>