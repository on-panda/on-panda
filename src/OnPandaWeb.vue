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

import { p, tryLoadDuplicateWindow, sleep } from './utils/commonUtils.js'
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
[{'endpoint_name': 'on-panda', 'client_config': {'base_url': 'http://127.0.0.1:8000/v1'}, 'chat_config': {'model': 'meta-llama/Meta-Llama-3-8B-Instruct'}},]`,
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
const modelNameTagsInput = computed(() => {
  if (props.modelNameTags) {
    return { ...props.modelNameTags, ...globalStore.customModelNameTags }
  }
  return globalStore.customModelNameTags
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

const onPandaExamplesRef = ref(null)

if (globalStore.isOldUser) {
  operationCenter.loadMessages(defaultMessages, toolManageState.presetToolConfigsInput)
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

// Default debug run: the browser-agent weather card. require_approval 'always' keeps the agentic loop from running unattended.
function defaultDebugRun({ responseState, controlParameterState }) {
  const { operationCenter } = responseState
  controlParameterState.modelName.value = controlParameterState.modelNameTagsComputed.value['default-agent-tag'] || 'default-agent-tag'
  operationCenter.loadMessages(
    [{ role: "user", content: "What's the weather in New York City? Build an animated weather card in the top-right corner." }],
    [{ type: 'mcp', server_url: 'local-fetch://browser-agent-mcp', require_approval: 'always' }]
  )
  operationCenter.generateNew()
}

onMounted(async () => {
  if (!globalStore.isOldUser) {
    onPandaExamplesRef.value.loadWelcomeMessages()
  }
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

  var onMountedRun = () => { }

  if (tryLoadDuplicateWindow(responseState.pandaState)) { // duplicate window has higher priority
    if (localStorage.getItem('modelNameForDuplicateWindow')) {
      modelName.value = localStorage.getItem('modelNameForDuplicateWindow')
      localStorage.removeItem('modelNameForDuplicateWindow')
      onMountedRun = () => operationCenter.generateNew({ fromUser: true })
    }
  } else {
    if (!globalStore.isOldUser) {
      // Set default model for new users
      modelName.value = modelNameTagsComputed.value['on-panda'] || 'on-panda'
      onMountedRun = operationCenter.generateNew
    }
    if (globalStore.debug) {
      onMountedRun = globalStore.debugRun || defaultDebugRun
    }
  }
  async function afterApiAndToolReady() {
    await controlParameterState.apiUpdateCompletedPromise.value
    await toolManageState.presetToolReadyPromise.value.catch(responseState.warning)
    await sleep(5)
    if (!agenticLoopStatus.running && onMountedRun) {
      await onMountedRun(dialogWithControlState, onPandaExamplesRef.value.exampleNameToFunc)
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
