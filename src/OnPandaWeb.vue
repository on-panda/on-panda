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

import { p, tryLoadDuplicateWindow, deepCopy, deepEqual, sleep } from './utils/commonUtils.js'
import { useGlobalStore } from './stores/globalStore.js'
import { defaultMessages } from './stores/responseState.js'
import { defaultApiConfig } from './stores/controlParameterState.js'
import { DialogWithControlStateClosure } from './stores/dialogWithControlState.js'

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
  'step3.5': 'step3.5-tag',
  'image': 'image-tag',
  'gpt': 'gpt-tag',
  // 'claude': 'claude-tag',
  // 'audio': 'step1f-on-policy',
  'ds': 'ds-tag',
  // 'groq': 'groq-tag',
  'test': 'test-tag',
  'fast': 'fast-tag',
}
const modelNameTags = computed(() => {
  // only use defaultModelNameTags if both props.modelNameTags and globalStore.customModelNameTags is not set
  if (props.modelNameTags) {
    var modelNameTags = { ...props.modelNameTags, ...globalStore.customModelNameTags }
  } else {
    var modelNameTags = Object.keys(globalStore.customModelNameTags).length ? globalStore.customModelNameTags : defaultModelNameTags
  }
  return modelNameTags
})

const apiConfigs = computed(() => [defaultApiConfig, ...props.apiConfigs, ...globalStore.customApiConfigs])
const dialogWithControlState = DialogWithControlStateClosure({ apiConfigs: apiConfigs, modelNameTags: modelNameTags })
const { responseState, controlParameterState } = dialogWithControlState


const tokens = responseState.tokens
const requestStatus = responseState.requestStatus
const operationCenter = responseState.operationCenter

// Initialize with welcome messages
const onPandaExamplesRef = ref(null)
const welcomeMessages = [{ role: "system", content: "" }, { role: "user", content: '🍓草莓的英文单词有几个 "R" ?' }]
let initialMessages = welcomeMessages;

if (globalStore.isOldUser) {
  initialMessages = defaultMessages;
}

operationCenter.loadMessages(initialMessages)


const modelName = controlParameterState.modelName

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
    await import('./utils/defaultCustom.js');  // important: './utils/defaultCustom.js' will be resolve by different vite.config.js according different env var, do not change it.
    // Custom configurations that are included in build, but not in git
  } catch (error) {
    console.error('Failed to load custom.js:', error);
  }

  async function afterApiConfigsReady() {
    var watchApiConfigsLoaded = new Promise(resolve => {
      controlParameterState.watchApiConfigsResolver.value = resolve
    })

    var exampleToRun = null;

    if (tryLoadDuplicateWindow(responseState.pandaState)) { // duplicate window has higher priority
      if (localStorage.getItem('modelNameForDuplicateWindow')) {
        modelName.value = localStorage.getItem('modelNameForDuplicateWindow')
        localStorage.removeItem('modelNameForDuplicateWindow')
        exampleToRun = operationCenter.generateNew
      }
    } else {
      if (!globalStore.isOldUser) {
        // Set default model for new users
        modelName.value = modelNameTags.value['on-panda'] || 'on-panda'
        exampleToRun = operationCenter.generateNew
      }
      if (globalStore.debug) {
        // Use the example via the operationCenter directly
        // operationCenter.loadMessages([{ role: "user", content: "Tell a joke about AI, around 30 words" }])
        // exampleToRun = operationCenter.generateNew
        // exampleToRun = onPandaExamplesRef.value.exampleNameToFunc["tools"]
        exampleToRun = () => {
          var debugMessages = [{ role: "system", content: "You are a helpful assistant." }, { role: "user", content: "Say hi" }, { role: "assistant", content: "Hello!" }]
          var debugMessages = [{ "role": "system", "content": "You are a weather inquiry agent." }, { "role": "user", "content": "call the tool to tell me the tomorrow temperatures(°C) in New York City and San Francisco?" }]
          var debugMessages = [{ "role": "system", "content": "Any response must start from `I think that`" }, { "role": "user", "content": "Screenshot after sleep(10) and reply what you see within one word" }]
          operationCenter.loadMessages(debugMessages)
          operationCenter.pandaState.currentDialogData.value.tool_configs = [
            {
              type: "mcp", server_url: "http://127.0.0.1:9300/mcp",
              // "require_approval": "always"
              // server_label: "mcp_demo"
            },
            {
              "type": "function",
              "function": {
                "name": "get_weather",
                "description": "Get the current weather in a given location",
                "parameters": {
                  "type": "object",
                  "properties": {
                    "location": {
                      "type": "string",
                      "description": "City and state, e.g., 'San Francisco, CA'"
                    },
                    "unit": {
                      "type": "string",
                      "enum": [
                        "celsius",
                        "fahrenheit"
                      ]
                    }
                  },
                  "required": [
                    "location",
                    "unit"
                  ]
                }
              }
            }
          ]
          if (modelNameTags.value['test']) {
            modelName.value = modelNameTags.value['test']
          }
          modelName.value = "doubao-tag"
          operationCenter.generateNew()
          // operationCenter.refreshResponseProbability()
        }
      }
    }

    await watchApiConfigsLoaded
    await sleep(5)
    if (!requestStatus.value.generating && exampleToRun) {
      await exampleToRun()
    }
    if (globalStore.debug) {
      p("tokens", tokens)
    }
  }
  afterApiConfigsReady()
})

onBeforeUnmount(async () => {
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
