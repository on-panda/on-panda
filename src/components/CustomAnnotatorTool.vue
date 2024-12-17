<template>
    <el-form-item :required="props.tool.required">
        <template #label>
            <el-tooltip class="" effect="dark" placement="top" raw-content
                v-if="props.tool.tips || (!props.tool.disabled)">
                <template #content>
                    Type: <b>{{ props.tool.type }}</b><br>
                    <MessageMarkdown :content="props.tool.tips" />
                </template>
                <span>{{ props.tool.name }}</span>
            </el-tooltip>
            <span v-else>{{ props.tool.name }}</span>
        </template>

        <div style="width: 90%; max-width: 950px;">
            <el-button-group v-if="props.tool.type == 'single_choice'" size="">
                <el-button v-for="choice in props.tool.single_choice" :type="choiceToButtonType(choice)"
                    @click="() => { for (let c of props.tool.single_choice) { c.v = c.k == choice.k } }"
                    :disabled="props.tool.disabled">
                    <b>{{ choice.k }}</b>
                </el-button>
            </el-button-group>
            <div v-if="props.tool.type == 'multiple_choice'">
                <el-button v-for="choice in props.tool.multiple_choice" :type="choiceToButtonType(choice)"
                    @click="() => { choice.v = !choice.v }" style="margin-right: -5px;" :disabled="props.tool.disabled">
                    <b>{{ choice.k }}</b>
                </el-button>
            </div>
            <div v-if="props.tool.type == 'checkbox'">
                <CheckboxWidgetSupportNull :checkboxValue="props.tool.checkbox"
                    @updateCheckboxValue="(v) => { props.tool.checkbox = v }" :disabled="props.tool.disabled">
                </CheckboxWidgetSupportNull>
            </div>
            <div v-if="props.tool.type == 'text'">
                <el-input type="textarea" v-model="props.tool.text" :input-style="{ color: '#888' }" :autosize="true"
                    :disabled="props.tool.disabled" />
            </div>
            <div v-if="props.tool.type == 'markdown'" style="color: #555;">
                <MessageMarkdown :content="props.tool.markdown" />
            </div>
        </div>
    </el-form-item>
</template>
<script setup>

import CheckboxWidgetSupportNull from './widgets/CheckboxWidgetSupportNull.vue';
import MessageMarkdown from './MessageMarkdown.vue';


const props = defineProps({
    tool: {
        type: Object,
        default: {}
    },
})

const positiveNames = ['y', 'yes', 'true', 'right', '是', '对']
const negativeNames = ['n', 'no', 'false', 'wrong', '否', '错']

function choiceToButtonType(choice) {
    var value = choice.v
    if (value == true) {
        if (props.tool.type == 'single_choice' && props.tool.single_choice.length <= 3) {
            if (positiveNames.includes(choice.k.toLowerCase())) {
                return 'success'
            } else if (negativeNames.includes(choice.k.toLowerCase())) {
                return 'danger'
            }
        }
        return 'primary'
    } else if (value == false) {
        return 'info'
    } else if (value == null) {
        return 'default'
    } else {
        return 'warning'
    }
}

</script>