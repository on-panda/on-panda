<template>
    <div class="AnnotatorPanel">
        <div style="background-color:antiquewhite; padding: 12px; border-radius: 10px; max-width: 1024px;">
            <b style="color: #aaa">{{ t('annotator.annotatorPanel') }}</b>
            <br>
            <br>
            <el-form label-width="auto" size="small">
                <el-form-item>
                    <template #label>
                        <el-tooltip class="" effect="dark" placement="top" raw-content>
                            <template #content>
                                Type: <b>checkbox</b><br>
                                {{ t('annotator.isGoodTooltip') }}<br>
                                {{ t('annotator.defaultChoice') }}
                            </template>
                            <span>{{ t('annotator.isGood') }}</span>
                        </el-tooltip>
                    </template>
                    <CheckboxWidgetSupportNull
                        :checkboxValue="pandaState.dialogCache.value?.annotate?.is_good === null ? pandaState.dialogMaxIndexRemain.value === pandaState.currentDialogIndex.value : pandaState.dialogCache.value?.annotate?.is_good"
                        @updateCheckboxValue="(x) => pandaState.setCurrentIsGood(x)">
                    </CheckboxWidgetSupportNull>
                    <small style="color: #606266" v-if="pandaState.dialogCache.value?.annotate?.is_good === null">
                        &nbsp; ({{ t('annotator.noChoiceMade') }},
                        <span v-if="pandaState.dialogMaxIndexRemain.value === pandaState.currentDialogIndex.value"
                            v-html="t('annotator.latestDialogDefault')"></span>
                        <span v-else v-html="t('annotator.notLatestDialogDefault')"></span>
                        )
                    </small>


                </el-form-item>
                <CustomAnnotatorTool v-for="tool in pandaState.dialogCache.value.annotate?.customs" :tool="tool">
                </CustomAnnotatorTool>

                <ObjectViewerInDetails :object="pandaState.dialogCache" :summary="t('annotator.currentDialogJson')" />
                <ObjectViewerInDetails :object="pandaState.logprobsTokens" :summary="t('annotator.tokens')" v-if="0" />

                <el-divider class="el-divider-ignore-background-color" content-position="left">
                    <small style="color: #606266; background-color: antiquewhite; padding:10px ">
                        {{ t('annotator.dialogLevel') }}
                    </small>
                </el-divider>

                <CustomAnnotatorTool v-if="pandaState.pandaTree.value?.title" :tool='{
                    name: t("annotator.title"),
                    type: "markdown",
                    markdown: "**" + pandaState.pandaTree.value?.title + "**",
                    disabled: true,
                }'></CustomAnnotatorTool>
                <CustomAnnotatorTool v-if="uploadedJson" :tool='{
                    name: t("annotator.uploadFile"),
                    type: "markdown",
                    markdown: "**" + uploadedJson.name + "**",
                    disabled: true,
                }'></CustomAnnotatorTool>
                <CustomAnnotatorTool :tool='{
                    name: t("annotator.updateTime"),
                    type: "markdown",
                    markdown: pandaState.pandaTree.value?.update_time ? dateStringNow(undefined, pandaState.pandaTree.value?.update_time) : "**" + t("annotator.notSavedYet") + "**",
                    disabled: true,
                    tips: "",
                }'></CustomAnnotatorTool>
                <CustomAnnotatorTool v-if="pandaState.pandaTree.value?.description" :tool='{
                    name: t("annotator.description"),
                    type: "markdown",
                    markdown: pandaState.pandaTree.value?.description,
                    disabled: true,
                }'></CustomAnnotatorTool>
                <CustomAnnotatorTool :tool='editableCommentAsTool'>
                </CustomAnnotatorTool>
            </el-form>
            <ObjectViewerInDetails :object="pandaState.pandaTree" :summary="t('annotator.pandaTreeJson')" />
        </div>
    </div>
</template>
<script setup>
import CustomAnnotatorTool from './widgets/CustomAnnotatorTool.vue';
import CheckboxWidgetSupportNull from './widgets/CheckboxWidgetSupportNull.vue'
import ObjectViewerInDetails from './widgets/ObjectViewerInDetails.vue';

import { ref, watch } from 'vue'
import { dateStringNow } from '../utils/commonUtils.js'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
    responseState: {
        type: Object,
        required: true
    }
})

const pandaState = props.responseState.pandaState
const uploadedJson = props.responseState.uploadedJson

const editableCommentAsTool = ref({
    name: t("annotator.comment"),
    type: "text",
    text: pandaState.pandaTree.value?.comment || "",
    disabled: false,
})

// bind editableCommentAsTool to pandaState.pandaTree.value.comment
watch(() => pandaState.pandaTree.value, (newVal) => {
    if (newVal.comment != editableCommentAsTool.value.text) {
        editableCommentAsTool.value.text = newVal.comment
    }
}, { deep: true })

watch(() => editableCommentAsTool.value, (newVal) => {
    if (pandaState.pandaTree.value.comment != newVal.text) {
        pandaState.pandaTree.value.comment = newVal.text
    }
}, { deep: true })


</script>
<style scoped>
.raw-json-in-annotator-panel {
    white-space: pre-wrap;
    font-family: Monospace;
    background-color: #fafafa;
    /* width: 90%; */
    margin: 10px;
    padding: 10px;
}

.dataPanelRow {
    height: 25px;
}
</style>
<style>
.el-divider-ignore-background-color .el-divider__text {
    background-color: transparent;
}
</style>
