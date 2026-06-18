<template>
  <div ref="onPandaContainerRef" :style="isMobile ? {} : { width: '90%', margin: '1em auto 2em' }"
    class="onPandaContainerRef onPandaContainers">
    <OnPandaHeader>
      <template #customInfoForUser>
        <small style="color: #555;" v-if="customInfoForUser">
          <br>
          <hr>
          <MarkdownRender :content="customInfoForUser" />
        </small>
      </template>
    </OnPandaHeader>

    <el-divider content-position="left">
      {{ t('common.examples') }}:
    </el-divider>
    <OnPandaExamples :dialogWithControlState="dialogWithControlState" ref="onPandaExamplesRef" />

    <el-divider content-position="left" style="margin-bottom: 5px;">
      <b>{{ t('common.dialog') }}:</b>
    </el-divider>
    <OnPandaDialogWithControl :dialogWithControlState="dialogWithControlState" />

    <div v-if="responseState.warningContent.value"
      style="background-color: #fdd;white-space: pre-wrap;overflow-x: scroll; padding: 10px">
      <h3>Error Messages:</h3>
      <div v-html="responseState.warningContent.value"></div>
    </div>
    <br v-for="_ in (isMobile ? 12 : 0)">
  </div>
</template>

<script setup>
// TODO 
// - change Messages render method, support edit and click. ctrl+z

import { ref, computed, watch } from 'vue'
import { onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'

import { deepCopy, p, tryLoadDuplicateWindow, sleep } from './utils/commonUtils.js'
import { useGlobalStore } from './stores/globalStore.js'
import { defaultMessages } from './stores/responseState.js'
import { defaultApiConfig } from './stores/controlParameterState.js'
import { DialogWithControlStateClosure } from './stores/dialogWithControlState.js'
import { TEST_TOOL_CONFIGS } from './utils/toolUtils.js'

import MarkdownRender from './components/widgets/MarkdownRender.vue'
import OnPandaHeader from './components/OnPandaHeader.vue'
import OnPandaExamples from './components/OnPandaExamples.vue'
import OnPandaDialogWithControl from './components/OnPandaDialogWithControl.vue'

const props = defineProps({
  apiConfigs: {
    type: Object,
    default: [],
    description: `API configurations, if not set 'chat_config.model', will get model list by endpoint/models.
e.g.:
[{'support_continue_final_message': true, 'endpoint_name': 'on-panda', 'client_config': {'base_url': 'http://127.0.0.1:8000/v1'}, 'chat_config': {'model': 'meta-llama/Meta-Llama-3-8B-Instruct'}},]`,
  },
  presetToolConfigs: {
    type: Object,
    default: [],
    description: `Preset tool configurations shared across dialogs`,
  },
  modelNameTags: {
    type: Object,
    default: null,
    description: `Model name tags for quick model selection. key is tag name, value is model retrieval name, will find first include retrieval name in apiConfigs`,
  },
  customInfoForUser: {
    type: String,
    default: '',
    description: `Custom info for user, will be rendered as markdown`,
  },
})

const { t } = useI18n()

const globalStore = useGlobalStore()
var isMobile = computed(() => globalStore.isMobile)
const customInfoForUser = computed(() => props.customInfoForUser + globalStore.customInfoForUser)
const defaultModelNameTags = {
  'on-panda': 'on-panda',
  'step3.7': 'step-tag',
  'kimi': 'kimi-tag',
  'DS': 'ds-tag',
  'GPT': 'gpt-tag',
  'claude': 'claude-tag',
  'gemini': 'gemini-tag',
  // 'image': 'image-tag',
  // 'audio': 'step1f-on-policy',
  'test': 'test-tag',
  // 'fast': 'fast-tag',
  // 'groq': 'groq-tag',
}
const modelNameTagsInput = computed(() => {
  // only use defaultModelNameTags if both props.modelNameTags and globalStore.customModelNameTags is not set
  if (props.modelNameTags) {
    var modelNameTags = { ...props.modelNameTags, ...globalStore.customModelNameTags }
  } else {
    var modelNameTags = Object.keys(globalStore.customModelNameTags).length ? globalStore.customModelNameTags : defaultModelNameTags
  }
  return modelNameTags
})

const apiConfigs = computed(() => [defaultApiConfig, ...props.apiConfigs, ...globalStore.customApiConfigs])
const dialogWithControlState = DialogWithControlStateClosure({
  apiConfigs: apiConfigs,
  presetToolConfigs: props.presetToolConfigs,
  modelNameTags: modelNameTagsInput,
})
const { responseState, controlParameterState, toolManageState } = dialogWithControlState


const tokens = responseState.tokens
const agenticLoopStatus = responseState.agenticLoopStatus
const operationCenter = responseState.operationCenter

// Initialize with welcome messages
const onPandaExamplesRef = ref(null)

if (globalStore.isOldUser) {
  operationCenter.loadMessages(defaultMessages, toolManageState.presetToolConfigsInput)
} else {
  const welcomeMessages = [{ role: "system", content: "" }, { role: "user", content: '🍓草莓的英文单词有几个 "R" ?' }]
  operationCenter.loadMessages(welcomeMessages)
}



const modelName = controlParameterState.modelName
const modelNameTagsComputed = controlParameterState.modelNameTagsComputed

watch(modelName, async function watchModelName(newValue) {  // set modelName to page title
  if (document.title.endsWith("onPanda")) {
    document.title = newValue + " | onPanda"
  }
})

// ref="responseState.onPandaContainerRef" does not work
const onPandaContainerRef = ref(null)

onMounted(async () => {
  async function loadRuntimeImport() {
    const runtimeImport = import.meta.env.VITE_ON_PANDA_WEB_RUNTIME_IMPORT
    if (!runtimeImport) {
      return
    }
    try {
      const runtimeUrl = '/on-panda-web-runtime.js'  // Fix endpoint for configurations that are included in `pnpm dev`/`preview` but not in git or build.
      const mod = await import(/* @vite-ignore */ runtimeUrl)
      await mod.default({ globalStore })  // Apply runtime configuration by function
    } catch (error) {
      console.warn(`Runtime config load failed (VITE_ON_PANDA_WEB_RUNTIME_IMPORT).`, error)
    }
  }
  await loadRuntimeImport()
  responseState.onPandaContainerRef.value = onPandaContainerRef.value
  try {
    await import('./utils/defaultCustom.js')  // important: './utils/defaultCustom.js' will be resolve by different vite.config.js according different env var, do not change it.
    // Custom configurations that are included in build, but not in git
  } catch (error) {
    console.error('Failed to load custom.js:', error)
  }

  var exampleToRun = () => { }

  if (tryLoadDuplicateWindow(responseState.pandaState)) { // duplicate window has higher priority
    if (localStorage.getItem('modelNameForDuplicateWindow')) {
      modelName.value = localStorage.getItem('modelNameForDuplicateWindow')
      localStorage.removeItem('modelNameForDuplicateWindow')
      exampleToRun = () => operationCenter.generateNew({ fromUser: true })
    }
  } else {
    if (!globalStore.isOldUser) {
      // Set default model for new users
      modelName.value = modelNameTagsComputed.value['on-panda'] || 'on-panda'
      exampleToRun = operationCenter.generateNew
    }
    if (globalStore.debug) {
      // Use the example via the operationCenter directly
      // operationCenter.loadMessages([{ role: "user", content: "Tell a joke about AI, around 30 words" }])
      // toolManageState.presetToolConfigsInput.value = toolManageState.presetToolConfigsInput.value.concat(deepCopy(TEST_TOOL_CONFIGS))
      // exampleToRun = operationCenter.generateNew
      // exampleToRun = () => {
      //   modelName.value = "k2.6-instruct-wo-parser-tag"
      //   onPandaExamplesRef.value.exampleNameToFunc["tools"](dialogWithControlState)
      // }
      // exampleToRun = onPandaExamplesRef.value.exampleNameToFunc["🤖 browser-agent"]
      // exampleToRun = onPandaExamplesRef.value.exampleNameToFunc["GUI-agent"]
      var exampleToRun = () => {
        var debugMessages = [{ role: "system", content: "You are a helpful assistant." }, { role: "user", content: "Say hi" }, { role: "assistant", content: "Hello!" }]
        var debugMessages = [{ "role": "system", "content": "You are a weather inquiry agent. Add emojis in your response. Must to say something to user before tool_calls (words in content not in thinking)" }, { "role": "user", "content": "call the tool to tell me the tomorrow temperatures(°C) in New York City and San Francisco?" }]
        // var debugMessages = [{ "role": "system", "content": "Any response must start from `I think`" }, { "role": "user", "content": "Screenshot and reply what you see within one word" }]
        operationCenter.loadMessages(debugMessages, TEST_TOOL_CONFIGS)
        if (modelNameTagsComputed.value['test']) {
          modelName.value = modelNameTagsComputed.value['test']
        }
        // modelName.value = "kimi-tag"
        // modelName.value = "doubao-tag"
        // controlParameterState.apiConfigControllable.value.chat_config.max_tool_assets = 1
        controlParameterState.apiConfigControllable.value.chat_config.tool_asset_keep_rounds = 2
        operationCenter.generateNew()
        // operationCenter.refreshResponseProbability()
      }
    }
  }
  async function afterApiAndToolReady() {
    await controlParameterState.apiUpdateCompletedPromise.value
    await toolManageState.presetToolReadyPromise.value.catch(responseState.warning)
    await sleep(5)
    if (!agenticLoopStatus.running && exampleToRun) {
      await exampleToRun(dialogWithControlState)
    }
    if (globalStore.debug) {
      p("tokens", tokens)
    }
  }
  afterApiAndToolReady()
})

onBeforeUnmount(async () => {
  await toolManageState.close()
})
</script>

<style scoped>
/* Avoid automatic enlargement of mobile Web pages */
@media (max-width: 600px) {

  input,
  textarea {
    font-size: 16px;
  }
}

* {
  font-family: Arial, sans-serif;
}
</style>
