<template>
  <div ref="onPandaContainer" :style="isMobile ? {} : { width: '90%', margin: '1em auto 2em' }"
    class="onPandaContainer onPandaContainers">
    <OnPandaHeader />

    <small style="color: #555;" v-if="props.customInfoForUser">
      <br>
      <MarkdownRender :content="props.customInfoForUser" />
    </small>

    <el-divider content-position="left">
      {{ t('common.examples') }}:
    </el-divider>
    <OnPandaExamples :dialogWithControlState="dialogWithControlState" />

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
    default: {
      'on-panda': 'on-panda',
      'test': 'endpoint-name',
      'image': 'image-tag',
      'gpt4o': 'chatgpt-4o-latest',
      'claude': 'claude-tag',
      'r1': 'r1-tag',
      'groq': 'groq-tag',
      'fast': 'llama-3.3-70b-versatile',
    },
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

const dialogWithControlState = DialogWithControlStateClosure({ apiConfigs: props.apiConfigs, modelNameTags: props.modelNameTags })
const { responseState, controlParameterState } = dialogWithControlState

const onPandaContainer = ref(null)
watch(onPandaContainer, (newVal) => {
  // ref="responseState.onPandaContainer" is not work
  responseState.onPandaContainer.value = newVal
})

const tokens = responseState.tokens
const requestStatus = responseState.requestStatus
const operationCenter = responseState.operationCenter

// Initialize with welcome messages
const welcomeMessages = [{ role: "system", content: "" }, { role: "user", content: '🍓草莓的英文单词有几个 "R" ?' }]
let initialMessages = welcomeMessages;

if (globalStore.isOldUser) {
  initialMessages = defaultMessages;
}

operationCenter.loadMessagesWithPandaTree(initialMessages)


const modelName = controlParameterState.modelName
const apiConfigs = controlParameterState.apiConfigs

watch(modelName, async function watchModelName(newValue) {  // set modelName to page title
  if (document.title.endsWith("onPanda")) {
    document.title = newValue + " | onPanda"
  }
})


onMounted(async () => {
  try {
    await import('./assets/secret/custom.js');
  } catch (error) {
    console.error('Failed to load custom.js:', error);
  }

  async function afterApiConfigsReady() {
    var watchApiConfigsLoaded = new Promise(resolve => {
      controlParameterState.watchApiConfigsResolver.value = resolve
    })
    apiConfigs.value = [defaultApiConfig, ...apiConfigs.value, ...globalStore.customApiConfigs]

    let exampleToRun = null;

    if (tryLoadDuplicateWindow(responseState.pandaState)) { // duplicate window has higher priority
      if (localStorage.getItem('modelNameForDuplicateWindow')) {
        modelName.value = localStorage.getItem('modelNameForDuplicateWindow')
        localStorage.removeItem('modelNameForDuplicateWindow')
        exampleToRun = operationCenter.generateNew
      }
    } else {
      if (!globalStore.isOldUser) {
        // Set default model for new users
        modelName.value = props?.modelNameTags['on-panda'] || 'on-panda'
        exampleToRun = operationCenter.generateNew
      }
      if (globalStore.debug) {
        modelName.value = defaultApiConfig.chat_config.model
        // Use the example via the operationCenter directly
        operationCenter.loadMessagesWithPandaTree([{ role: "user", content: "讲一个关于西游记的笑话, 100字" }])
        exampleToRun = operationCenter.generateNew
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