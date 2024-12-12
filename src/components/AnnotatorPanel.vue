<template>
    <div class="messagesInfoPannel"
        v-if="pandaState.dialogCache.value?.annotate || pandaState.dialogCache.value?.description || pandaState.dialogCache.value?.comment">
        <div style="background-color:antiquewhite; padding: 12px; border-radius: 10px;">
            <b style="color: #aaa">Dialog Pannel</b>
            <br>
            <editableStringAttribute :obj="pandaState.dialogCache.value" attr="description" :editable="false"
                v-if="pandaState.dialogCache.value?.description" />
            <editableStringAttribute :obj="pandaState.dialogCache.value" attr="comment" :editable="true"
                v-if="pandaState.dialogCache.value?.comment" title="comment:&nbsp;&nbsp;&nbsp;" />

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
                <CustomAnnotatorTool v-for="tool in pandaState.dialogCache.value.annotate.customs" :tool="tool">
                </CustomAnnotatorTool>
            </el-form>
            <details>
                <summary>
                    <small style="color: #606266">JSON</small>
                </summary>
                <div style="white-space: pre-wrap;font-family: Monospace;background-color: #fafafa;">{{
                    JSON.stringify(pandaState.dialogCache.value, null, 2) }}</div>
            </details>
            <details v-if="0">
                <summary>
                    <small style="color: #606266">tokens</small>
                </summary>
                <div style="white-space: pre-wrap;font-family: Monospace;background-color: #fafafa;">{{
                    JSON.stringify(pandaState.tokens.value, null, 2) }}</div>
            </details>
        </div>
    </div>
</template>
<script setup>
import editableStringAttribute from './editableStringAttribute.vue'
import CustomAnnotatorTool from './CustomAnnotatorTool.vue';
import CheckboxWidgetSupportNull from './widgets/CheckboxWidgetSupportNull.vue'
import { pandaState } from '../stores/pandaState'

</script>