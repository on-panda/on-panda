<template>
    <div class="messagesInfoPannel"
        v-if="pandaState.dialog.value?.annotate || pandaState.dialog.value?.description || pandaState.dialog.value?.comment">
        <div style="background-color:antiquewhite; padding: 12px; border-radius: 10px;">
            <b style="color: #aaa">Dialog Pannel</b>
            <editableStringAttribute :obj="pandaState.dialog.value" attr="description" :editable="false"
                v-if="pandaState.dialog.value?.description" />
            <editableStringAttribute :obj="pandaState.dialog.value" attr="comment" :editable="true"
                v-if="pandaState.dialog.value?.comment" title="comment:&nbsp;&nbsp;&nbsp;" />

            <br>
            <el-form label-width="auto" size="small">
                <el-form-item label="chosen">
                    <CheckboxWidgetSupportNull :checkboxValue="pandaState.dialog.value?.annotate?.chosen"
                        @updateCheckboxValue="(v) => { pandaState.dialog.value.annotate.chosen = v }">
                    </CheckboxWidgetSupportNull>
                </el-form-item>
                <CustomAnnotatorTool v-for="tool in pandaState.dialog.value.annotate.customs" :tool="tool">
                </CustomAnnotatorTool>
            </el-form>
            <details>
                <summary>
                    <small style="color: #606266">JSON</small>
                </summary>
                <div style="white-space: pre-wrap;font-family: Monospace;background-color: #fafafa;">{{
                    JSON.stringify(pandaState.dialog.value, null, 2) }}</div>
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