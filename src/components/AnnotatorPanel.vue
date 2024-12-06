<template>
    <div class="messagesInfoPannel" v-if="pandaState.dialog.value?.info">
        <div style="background-color:antiquewhite; padding: 12px; border-radius: 10px;">
            <b style="color: #aaa">Dialog Pannel</b>
            <editableStringAttribute :obj="pandaState.dialog.value?.info" attr="description" :editable="false"
                v-if="pandaState.dialog.value?.info?.description" />
            <editableStringAttribute :obj="pandaState.dialog.value?.info" attr="comment" :editable="true"
                v-if="pandaState.dialog.value?.info?.comment" title="comment:&nbsp;&nbsp;&nbsp;" />

            <br>
            <el-form label-width="auto" size="small">
                <el-form-item label="chosen">
                    <CheckboxWidgetSupportNull :checkboxValue="pandaState.dialog.value?.info?.chosen"
                        @updateCheckboxValue="(v) => { pandaState.dialog.value.info.chosen = v }">
                    </CheckboxWidgetSupportNull>
                </el-form-item>
                <CustomAnnotatorTool v-for="tool in pandaState.dialog.value.custom" :tool="tool"></CustomAnnotatorTool>
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