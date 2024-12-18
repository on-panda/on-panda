<template>
    <div class="AnnotatorPannel"
        v-if="pandaState.dialogCache.value?.annotate || pandaState.pandaTree.value?.description || pandaState.pandaTree.value?.comment">
        <div style="background-color:antiquewhite; padding: 12px; border-radius: 10px; max-width: 1024px;">
            <b style="color: #aaa">Data Pannel</b>
            <br>
            <br>
            <el-form label-width="auto" size="small">
                <el-form-item>
                    <template #label>
                        <el-tooltip class="" effect="dark" placement="top" raw-content>
                            <template #content>
                                Type: <b>checkbox</b><br>
                                Is the last assistant's response good?<br>
                                If no choice was made, 'Y' is the default if it is the latest dialog, otherwise 'N' is
                                the default.
                            </template>
                            <span>is_good</span>
                        </el-tooltip>
                    </template>
                    <CheckboxWidgetSupportNull
                        :checkboxValue="pandaState.dialogCache.value?.annotate?.is_good === null ? pandaState.dialogMaxIndexRemain.value === pandaState.currentDialogIndex.value : pandaState.dialogCache.value?.annotate?.is_good"
                        @updateCheckboxValue="(v) => { pandaState.dialogCache.value.annotate.is_good = v }">
                    </CheckboxWidgetSupportNull>
                    <small style="color: #606266" v-if="pandaState.dialogCache.value?.annotate?.is_good === null">
                        &nbsp; No choice was made,
                        <span v-if="pandaState.dialogMaxIndexRemain.value === pandaState.currentDialogIndex.value"> as
                            it is the <b>latest</b> dialog, so 'Y' is the default.</span>
                        <span v-else> as it is <b>NOT</b> the latest dialog, so 'N' is the default.</span>
                    </small>


                </el-form-item>
                <CustomAnnotatorTool v-for="tool in pandaState.dialogCache.value.annotate?.customs" :tool="tool">
                </CustomAnnotatorTool>

                <ObjectViewerInDetails :object="pandaState.dialogCache.value" summary="current dialog JSON"
                    tips="This dialogCache may not be updated in time. Try switching the dialog to refresh it." />
                <ObjectViewerInDetails :object="pandaState.tokens.value" summary="tokens" v-if="0" />

                <el-divider class="el-divider-ignore-background-color" content-position="left">
                    <small style="color: #606266; background-color: antiquewhite; padding:10px ">
                        dialog level / data level
                    </small>
                </el-divider>

                <CustomAnnotatorTool v-if="pandaState.pandaTree.value?.title" :tool='{
                    name: "title",
                    type: "markdown",
                    markdown: "**" + pandaState.pandaTree.value?.title + "**",
                    disabled: true,
                }'></CustomAnnotatorTool>
                <CustomAnnotatorTool v-if="uploadedJson" :tool='{
                    name: "upload file",
                    type: "markdown",
                    markdown: "**" + uploadedJson.name + "**",
                    disabled: true,
                }'></CustomAnnotatorTool>
                <CustomAnnotatorTool :tool='{
                    name: "has ever saved",
                    type: "checkbox",
                    checkbox: pandaState.pandaTree.value?.has_ever_saved,
                    disabled: true,
                    tips: "Has this data ever been saved by on-panda? Automatically set by on-panda."
                }'></CustomAnnotatorTool>
                <CustomAnnotatorTool v-if="pandaState.pandaTree.value?.description" :tool='{
                    name: "description",
                    type: "markdown",
                    markdown: pandaState.pandaTree.value?.description,
                    disabled: true,
                }'></CustomAnnotatorTool>
                <CustomAnnotatorTool v-if="pandaState.pandaTree.value?.comment" :tool='editableCommentAsTool'>
                </CustomAnnotatorTool>
            </el-form>
            <ObjectViewerInDetails :object="pandaState.pandaTree.value" summary="panda tree JSON" />
        </div>
    </div>
</template>
<script setup>
import EditableStringAttribute from './EditableStringAttribute.vue'
import CustomAnnotatorTool from './CustomAnnotatorTool.vue';
import CheckboxWidgetSupportNull from './widgets/CheckboxWidgetSupportNull.vue'
import ObjectViewerInDetails from './widgets/ObjectViewerInDetails.vue';
import { pandaState, uploadedJson } from '../stores/pandaState'

import { ref, watch } from 'vue'


const editableCommentAsTool = ref({
    name: "comment",
    type: "text",
    text: pandaState.pandaTree.value?.comment,
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

.dataPannelRow {
    height: 25px;
}
</style>