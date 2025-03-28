<script>
import 'element-plus/dist/index.css'
</script>

<template>
  <div ref="onPandaContainer" :style="isMobile ? {} : { width: '90%', margin: '1em auto 2em' }"
    class="onPandaContainer">
    <OnPandaHeader />
    <small style="color: #555;" v-if="props.customInfoForUser">
      <br>
      <MarkdownRender :content="props.customInfoForUser" />
    </small>
    <el-divider content-position="left">
      {{ t('common.examples') }}:
    </el-divider>

    <div style="line-height: 2">
      <template v-for="(func, name) in exampleNameToFunc">
        <el-tag type="info" @click="func()" style="cursor: pointer; margin-left: 5px;">
          {{ name }}
        </el-tag>
      </template>
    </div>

    <el-divider content-position="left" style="margin-bottom: 5px;">
      <b>{{ t('common.dialog') }}:</b>
    </el-divider>
    <div class="dialogFixedPosition"
      :style="Object.assign(pandaState?.isDeleted.value ? { backgroundColor: '#ffe8e8' } : {})"
      style="border-radius: 5px;">
      <div class="promptMessages">
        <!-- <Message v-for="(message, index) in messages" :message="message" 
          @sendButton="operationCenter.generateNew()"
          @deleteMessage="operationCenter.clearOrDeleteMessage(message, index)" @focus="operationCenter.editPrompt.before()"
          @blur="operationCenter.editPrompt.after()" /> -->
        <!-- change edit in compoment to edit in operationCenter -->
        <Message v-for="(message, index) in messages" :key="message.role + messageToSeq(message) + index"
          :message="message" :index="index" :operationCenter="operationCenter" />
      </div>

      <OnPandaResponsePanel :responseState="responseState" />

    </div>
    <DataControlPanel :responseState="responseState" />

    <el-divider content-position="left" style="margin-bottom: 5px;">{{ t('common.newMessage') }}:</el-divider>
    <div :style="{ opacity: newRoundMessage.content ? 1 : 0.5 }">
      <Message :message="newRoundMessage" :index="-2" @deleteMessage="newRoundMessage.content = ''"
        @sendButton="operationCenter.startNewRound()" />
    </div>

    <el-divider content-position="left">
      <b>{{ t('common.controlParameter') }}:</b>
    </el-divider>
    <ControlParameterPanel :controlParameterState="controlParameterState"
      @dblclickModelTag="responseState?.operationCenter.generateNew()" />
    <div v-if="warningContent" style="background-color: #fdd;white-space: pre-wrap;overflow-x: scroll; padding: 10px">
      <h3>Error Messages:</h3>
      <div v-html="warningContent"></div>
    </div>
    <br v-for="_ in (isMobile ? 12 : 0)">
  </div>
</template>

<script setup>
// TODO 
// - change Messages render method, support edit and click. ctrl+z

import { ref, computed, watch, provide } from 'vue'
import { onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'

import { p, tryLoadDuplicateWindow, deepCopy, deepEqual, sleep } from './utils/commonUtils.js'
import { messageToSeq } from './utils/chatUtils.js'
import { useGlobalStore } from './stores/globalStore.js'
import { ResponseStateClosure, defaultMessages } from './stores/responseState.js'
import { ControlParameterState, defaultApiConfig } from './stores/ControlParameterState.js'

import Message from './components/Message.vue'
import MarkdownRender from './components/widgets/MarkdownRender.vue'
import OnPandaResponsePanel from './components/OnPandaResponsePanel.vue'
import DataControlPanel from './components/DataControlPanel.vue'
import OnPandaHeader from './components/OnPandaHeader.vue'
import ControlParameterPanel from './components/ControlParameterPanel.vue'

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

const responseState = ResponseStateClosure()
const pandaState = responseState.pandaState

const onPandaContainer = ref(null)
watch(onPandaContainer, (newVal) => {
  // ref="responseState.onPandaContainer" is not work
  responseState.onPandaContainer.value = newVal
})

const warning = responseState.warning
const warningContent = responseState.warningContent


const exampleNameToFunc = {
  "clear": () => {
    operationCenter.pandaState = pandaState
    pandaState.setEmpty()
  },
  "default": () => {
    modelName.value = props?.modelNameTags['on-panda'] || 'on-panda'
    operationCenter.loadMessagesWithPandaTree(welcomeMessages)
    operationCenter.generateNew()
  },
  "R in 🍓": () => {
    operationCenter.loadMessagesWithPandaTree([{ role: "system", content: "" }, { role: "user", content: "🍍菠萝的英文单词有几个 P ?", description: "answer is 3", comment: "`comment` is editable for annotator" }])
    operationCenter.generateNew()
  },
  "image": () => {
    if (props?.modelNameTags['image']) {
      modelName.value = props?.modelNameTags['image']
    }
    operationCenter.loadMessagesWithPandaTree(messagesImageExample)
    operationCenter.generateNew()
  },
  // "audio": () => {
  //   modelName.value = "audio"
  //   operationCenter.loadMessagesWithPandaTree(messagesAudioExample
  //   )
  //   operationCenter.generateNew()
  // },
  "tokenizer": () => {
    operationCenter.loadMessagesWithPandaTree(messagesTokenizerExample
    )
    operationCenter.generateNew()
  },
  "random": () => {
    operationCenter.loadMessagesWithPandaTree([{ role: "user", content: "just output a random float128 number without any words, no code" }]
    )
    operationCenter.generateNew()
  },
  "笑话": () => {
    operationCenter.loadMessagesWithPandaTree([{ role: "user", content: "讲一个关于西游记的笑话, 100字" }]
    )
    operationCenter.generateNew()
  },
  "诗": () => {
    operationCenter.loadMessagesWithPandaTree([{ role: "user", content: "写藏头诗：\n人工智能，大有可为" }]
    )
    operationCenter.generateNew()
  },
  "计算": () => {
    operationCenter.loadMessagesWithPandaTree([{ role: "system", content: "" }, { role: "user", content: "已知小王 2024年30岁，本来预计60岁退休。但现在中央每五年开一次会，每开一次会决定退休年龄延迟3年，求老王的真正退休年龄。" }]
    )
    operationCenter.generateNew()
  },
  "count": () => {
    operationCenter.loadMessagesWithPandaTree([{ role: "system", content: "" }, { role: "user", content: "How many 1 in 01011010101111011011?", description: "Answer is 13" }]
    )
    operationCenter.generateNew()
  },
  "AIME": () => {
    operationCenter.loadMessagesWithPandaTree([{ role: "system", content: "" }, { role: "user", content: "Real numbers $x$ and $y$ with $x,y>1$ satisfy $\log_x(y^x)=\log_y(x^{4y})=10.$ What is the value of $xy$?", description: "Answer is 25" }]
    )
    operationCenter.generateNew()
  },
  "continue": () => {
    loadMessages(messagesContinueExample)
    setTimeout(() => operationCenter.continueGenerating(), 2000)
  },
  "annotate": async () => {
    pandaState.setExample()
    operationCenter.pandaState = pandaState
    await sleep(100)
    operationCenter.continueGenerating()
  }
}
var messages
// var messages = [{ role: "user", content: "just repeat 1 time: `पत्नी`" }]

const welcomeMessages = [{ role: "system", content: "" }, { role: "user", content: '🍓草莓的英文单词有几个 "R" ?' }]

var messagesTokenizerExample = [{ role: "user", content: "Repeat only once, no other words:\n```\n<|磊|>🧎🏿‍♂️‍➡️\\n<hr>\n蘒    𝒀𝒆𝒔पत्नी\n```" }]

var messagesContinueExample = [{ role: "user", content: "Tell me a common saying" }, { "role": "assistant", "content": '"An apple a day, keeps', "finish_reason": "stop" }]

// VLM
var messagesImageExample = [{
  role: "user", content: [
    { type: "text", text: '图中左侧的 "v" 是由什么形状构成？\n' },
    {
      type: "image_url", image_url: {
        url: "https://docs.vllm.ai/en/latest/_static/vllm-logo-text-light.png"
      },
    }
  ]
}]

var messagesAudioExample = [
  {
    "role": "system",
    "content": ""
  },
  {
    "role": "user",
    "content": [
      { type: "text", text: "分两步:\n1. 把这段语音转换为文字\n2. 回答语音中的问题\n" },
      {
        "type": "audio_token",
        "audio_token": "<audio_667><audio_667><audio_4390><audio_1326><audio_3886><audio_993><audio_689><audio_4171><audio_1367><audio_1349><audio_194><audio_853><audio_3690><audio_1044><audio_3123><audio_759><audio_776><audio_2449><audio_2502><audio_3738><audio_573><audio_573><audio_1226><audio_3270><audio_2377><audio_72><audio_35><audio_4106><audio_2267><audio_2930><audio_321><audio_321><audio_1155><audio_3274><audio_3450><audio_866><audio_54><audio_3317><audio_1535><audio_1484><audio_54><audio_925><audio_2264><audio_3593><audio_1089><audio_925><audio_133><audio_1484><audio_1768><audio_1146><audio_634><audio_634><audio_3074><audio_3311><audio_4329><audio_123><audio_936><audio_2265><audio_3172><audio_2317><audio_866><audio_72><audio_1048><audio_5080><audio_2377><audio_72><audio_936><audio_3211><audio_1795><audio_1039><audio_571><audio_431><audio_3186><audio_3186><audio_3186>"
      }
    ]
  }
]

// messages = messagesImageExample
// messages = messagesAudioExample
messages = welcomeMessages
if (globalStore.isOldUser) {
  messages = defaultMessages
}

const controlParameterState = ControlParameterState({ apiConfigs: props.apiConfigs, modelNameTags: props.modelNameTags })
const modelName = controlParameterState.modelName
const apiConfig = controlParameterState.apiConfig
const apiConfigs = controlParameterState.apiConfigs

watch(modelName, async function watchModelName(newValue) {  // set modelName to page title
  if (document.title.endsWith("onPanda")) {
    document.title = newValue + " | onPanda"
  }
})


responseState.bindApiConfig(apiConfig)

var messages = responseState.messages
const tokens = responseState.tokens

const requestStatus = responseState.requestStatus

const operationCenter = responseState.operationCenter
const loadMessages = responseState.loadMessages

provide('operationCenter.editRole', operationCenter.editRole)


const newRoundMessage = responseState.newRoundMessage

operationCenter.loadMessagesWithPandaTree(messages.value)


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
    var exampleFunc = exampleNameToFunc['default']
    if (tryLoadDuplicateWindow(pandaState)) { // duplicate window has higher priority
      exampleFunc = () => { }
      if (localStorage.getItem('modelNameForDuplicateWindow')) {
        modelName.value = localStorage.getItem('modelNameForDuplicateWindow')
        localStorage.removeItem('modelNameForDuplicateWindow')
        exampleFunc = operationCenter.generateNew
      }
    } else if (globalStore.isOldUser) {
      exampleFunc = () => { }
    }
    if (globalStore.debug) {
      // var exampleFunc = exampleNameToFunc['image']
      var exampleFunc = () => {
        // modelName.value = 'doubao-1.5-pro-32k'
        modelName.value = defaultApiConfig.chat_config.model
        exampleNameToFunc['笑话']()
      }
    }

    await watchApiConfigsLoaded
    await sleep(5)
    if (!requestStatus.value.generating) {
      await exampleFunc()
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

<style>
.onPandaContainer {
  summary {
    cursor: pointer;
  }

  summary::marker,
  summary::-webkit-details-marker {
    color: #888;
  }
}
</style>