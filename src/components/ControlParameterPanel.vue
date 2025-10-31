<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { InfoFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useGlobalStore } from '../stores/globalStore'
import MarkdownRender from './widgets/MarkdownRender.vue'
import CustomAnnotatorTool from './widgets/CustomAnnotatorTool.vue'
import { CONTINUE_PROMPT } from '../stores/controlParameterState'

const globalStore = useGlobalStore()
const isMobile = computed(() => globalStore.isMobile)

const props = defineProps({
    controlParameterState: {
        type: Object,
        required: true
    }
})

const emit = defineEmits(['dblclickModelTag', 'duplicateWindowWithModelName'])

const { t } = useI18n()

const modelName = props.controlParameterState.modelName
const modelNameTags = props.controlParameterState.modelNameTags
const keyToApiConfigs = props.controlParameterState.keyToApiConfigs
const apiConfigControllable = props.controlParameterState.apiConfigControllable
const chatConfig = props.controlParameterState.apiConfigControllable.value.chat_config
const extraChatParametersString = props.controlParameterState.extraChatParametersString
const apiConfig = props.controlParameterState.apiConfig

function handleModelTagClick(event, newModelName) {
    if (event.ctrlKey) {
        emit('duplicateWindowWithModelName', newModelName)
    } else {
        modelName.value = newModelName
    }
}

function handleModelTagMousedown(event, modelName_) {
    if (event.button === 1) {
        emit('duplicateWindowWithModelName', modelName_)
    }
}

var requestImageDetial = computed(() => {
    const image_detail_level = apiConfig.value.image_detail_level
    return {
        "name": "image_detail",
        "type": "single_choice",
        "single_choice": [
            {
                "k": "auto",
                "v": image_detail_level && image_detail_level == "auto"
            },
            {
                "k": "low",
                "v": image_detail_level && image_detail_level == "low"
            },
            {
                "k": "high",
                "v": image_detail_level && image_detail_level == "high"
            }
        ],
        "tips": "image_detail parameter for vision language model. Only works when there is image in the prompt."
    }
})

function checkExtraChatParameters() {
    if (extraChatParametersString.value) {
        try {
            var v = JSON.parse(extraChatParametersString.value)
        } catch (error) {
            ElMessage.error(`Invalid extra_parameters
: JSON.parse("${extraChatParametersString.value}") `)
            return
        }
        ElMessage.success(`Set extra_parameters: ${JSON.stringify(v)}`)
    }
}

function modelNameToMobileModelName(modelName) {
    if (globalStore.isMobile) {
        // split modelName by '—'
        const parts = modelName.split('—')
        var mobileModelName = `${parts[parts.length-1]} | ${parts[0]}`
        if (parts.length > 2) {
            mobileModelName += ` | ${parts[1]}`
        }
        return mobileModelName
    }
    return modelName
}

</script>

<template>
    <el-form class="toolbar options" label-width="140px">
        <el-form-item :label="t('controlParameter.model')">
            <el-select-v2 v-model="modelName" filterable :options="Object.keys(keyToApiConfigs).map((x, idx) => ({
                value: x,
                label: modelNameToMobileModelName(x),
            }))" placeholder="Select model" style="width: 440px" size="small" :height='400'
                :class="{ 'mobile-select-model-input': isMobile }" />
        </el-form-item>
        <div v-if="Object.keys(modelNameTags)?.length >= 1" class="ModelNameTags">
            <div style="line-height: 1.85;margin-top: -20px;margin-bottom: -5px;" :align="isMobile ? 'right' : ''">
                <span v-for="_ in (isMobile ? 0 : 30)">&nbsp;</span>
                <template v-for="(modelName_, tag) in modelNameTags">
                    <el-tag :type="modelName.includes(modelName_) ? 'primary' : 'info'"
                        @click="handleModelTagClick($event, modelName_)"
                        @mousedown="handleModelTagMousedown($event, modelName_)" @selectstart.prevent @dblclick="() => {
                            modelName = modelName_
                            $emit('dblclickModelTag', modelName_)
                        }" style="cursor: pointer;margin-left: 5px;user-select: none;">
                        {{ tag }}
                    </el-tag>
                </template>
                <small v-if="!isMobile && modelNameTags && Object.keys(modelNameTags)?.length > 1">
                    &nbsp;
                    <el-tooltip class="" effect="light" placement="top" raw-content>
                        <template #content>
                            <MarkdownRender :content="t('tooltips.modelTagClick')" />
                        </template>
                        <el-icon>
                            <InfoFilled />
                        </el-icon>
                    </el-tooltip>
                </small>
            </div>
            <br>
        </div>

        <el-form-item :label="t('controlParameter.temperature')">
            <el-input-number v-model="chatConfig.temperature" :min="0" :max="10" :step="0.01" size="small" />
        </el-form-item>

        <el-form-item :label="t('controlParameter.maxTokens')">
            <el-input-number v-model="chatConfig.max_tokens" :min="0" :max="1048576" :step="1" size="small" />
        </el-form-item>

        <el-form-item :label="t('controlParameter.topLogprobs')">
            <el-input-number v-model="chatConfig.top_logprobs" :min="0" :max="50" :step="1" size="small" />
        </el-form-item>

        <el-form-item :label="t('controlParameter.continueGenerating')">
            <small>
                <el-tag :type="apiConfig.support_continue_final_message ? 'success' : 'danger'">
                    {{ t(apiConfig.support_continue_final_message ? 'controlParameter.native' :
                        'controlParameter.promptEngineering') }}
                </el-tag>
                &nbsp;
                <el-tooltip class="" effect="light" placement="top" raw-content>
                    <template #content>
                        <MarkdownRender :content="t('tooltips.continueGeneratingSupport') + CONTINUE_PROMPT" />
                    </template>
                    <el-icon>
                        <InfoFilled />
                    </el-icon>
                </el-tooltip>
            </small>
        </el-form-item>
        <details style="margin-top: -10px;margin-bottom: 10px;">
            <summary>
                <small style="color: #bbb;"><b>{{ t('common.advancedControl') }}</b></small>
            </summary>
            <el-form-item label="top_p">
                <el-input-number v-model="chatConfig.top_p" :min="0" :max="1" :step="0.01" size="small" />
            </el-form-item>

            <el-form-item label="frequency_penalty">
                <el-input-number v-model="chatConfig.frequency_penalty" :min="0" :max="10" :step="0.01" size="small" />
            </el-form-item>

            <el-form-item label="extra_parameters">
                <el-input type="textarea" :autosize="{ minRows: 1 }" v-model="extraChatParametersString" size="small"
                    @blur="checkExtraChatParameters" style="width: 220px;" />
                <small>
                    &nbsp;
                    &nbsp;
                    <el-tooltip class="" effect="light" placement="top" raw-content>
                        <template #content>
                            <MarkdownRender
                                :content='"JSON for [Extra Parameters](https://docs.vllm.ai/en/stable/serving/openai_compatible_server.html#chat-api_1), e.g.: \n`{\"stop\": \"\\n\", \"min_tokens\": 256}`\nFor Chrome user, using `F12 -> Network -> completions -> Payload` to check the real request parameters"' />
                        </template>
                        <el-icon>
                            <InfoFilled />
                        </el-icon>
                    </el-tooltip>
                </small>
            </el-form-item>
            <CustomAnnotatorTool :tool="requestImageDetial"
                @updateSingleChoice="(v) => { apiConfigControllable.image_detail_level = v }" size="small" />
        </details>
    </el-form>
</template>
<style>
.mobile-select-model-input .el-select__wrapper {
    font-size: 16px;
}
</style>