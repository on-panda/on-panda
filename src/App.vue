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
      style="border-radius: 5px; padding-bottom: 20px;">
      <div class="promptMessages">
        <!-- <Message v-for="(message, index) in messages" :message="message" 
          @sendButton="opreators.newGenerate()"
          @deleteMessage="opreators.clearOrDeleteMessage(message, index)" @focus="opreators.editPrompt.before()"
          @blur="opreators.editPrompt.after()" /> -->
        <!-- change edit in compoment to edit in opreators -->
        <Message v-for="(message, index) in messages" :key="message.role + messageToSeq(message) + index"
          :message="message" :index="index" :opreators="opreators" />
      </div>

      <div class="responsePannel" :style="globalStore.cleanMode ? { maxWidth: '1024px' } : {}">
        <div class="finalMessageHeadBar" style="display: flex; justify-content: space-between;"
          :style="isMobile ? {} : { width: '50%' }">
          <MessageRole :message="finalMessage" />
          <span class="stretch" style="margin-right: auto" />
          <footer class="finalMessageControlButtons" style="display :flex; margin-top:5px; margin-bottom:-5px">
            <span class="stretch" style="margin-right: auto" />
            <el-tooltip v-if="!requestStatus.generating" :content="t('tooltips.continueGenerating')" placement="top">
              <el-button :icon="DArrowRight" size="small" :disabled="!tokens?.length"
                @click="opreators.continueGenerating()" />
            </el-tooltip>
            <el-tooltip v-if="requestStatus.generating" :content="t('tooltips.stopGenerating')" placement="top">
              <el-button :icon="VideoPause" size="small" @click="opreators.stopGenerating()" />
            </el-tooltip>
            <!-- <el-tooltip content="try again" placement="top">
              <el-button :icon="Refresh" size="small" @click="opreators.newGenerate()" />
            </el-tooltip> -->
            <el-tooltip v-if="0" content="edit (TBD)" placement="top">
              <el-button :icon="Edit" size="small" :disabled="true || !finalMessage.content" />
            </el-tooltip>
            <el-tooltip placement="top" effect="light">
              <template #content>
                {{ t('tooltips.refreshTokenProb') }}, <br>
                {{ t('tooltips.dblclickToPasteAndRefresh') }}
                <el-button size="small" @click="pasteThenRequestPromptLogprobs">
                  {{ t('tooltips.pasteAndRefresh') }}
                </el-button>
              </template>
              <el-button :icon="View" size="small" :disabled="!finalMessage.content || requestStatus.generating"
                @click="responseState.requestPromptLogprobs()" @dblclick="pasteThenRequestPromptLogprobs" />
            </el-tooltip>
            <el-tooltip placement="top-end" effect="light">
              <template #content>
                Click to copy response, <br>Or double-click to <br>
                <el-button size="small" @click="duplicateWindow(pandaState)">
                  Duplicate Window
                </el-button>
              </template>
              <el-button :icon="DocumentCopy" size="small" :disabled="!finalMessage.content"
                @click="copyToClipboard(finalMessage.content)" @dblclick="duplicateWindow(pandaState)" />
            </el-tooltip>
            &nbsp;&nbsp;&nbsp;
            <hr v-if="!isMobile" style="color:#eee; margin-top: -5px; margin-bottom: 4px">
          </footer>
          <el-switch v-if="isMobile" v-model="scrollSwitch.isSwitched.value" inline-prompt active-text="raw"
            inactive-text="MD" @change="scrollSwitch.scrollToPosition"
            style="margin-right: 8px;--el-switch-on-color: #aaa; --el-switch-off-color: #aaa; width:45px" />
        </div>
        <div class="replayStatisticsSubtitle" style="display: flex; justify-content: space-between;">
          <small style="color: #888;"> model:
            <code>{{ tokensModelNames }}</code>
            <span v-if="tokens.length">
              <span v-if="tokens[tokens.length - 1]?.usage?.prompt_tokens">
                ｜ tokens:
                {{ tokens[tokens.length - 1]?.usage?.prompt_tokens }} +
                {{ tokens[tokens.length - 1]?.usage?.completion_tokens }}
              </span>
              <span v-else-if="bitTokens.length <= 1"> ｜ tokens: {{ tokens.length }} </span>
            </span>
            <span v-if="bitTokens.length > 1"> ｜
              <el-tooltip class="" effect="light" placement="bottom" raw-content>
                <template #content>
                  <MarkdownRender
                    content="${\text{bits}} = - \sum_{i} \log_2(p_i)$. // note for vLLM server model: 
                  Logprob value are affected by sampling parameters, click: [🔗URL](https://github.com/vllm-project/vllm/issues/9453)" />
                </template>
                bits
              </el-tooltip>
              / tokens: {{ bitTotal.toFixed(1) }} ÷ {{ bitTokens.length }} = {{ (bitTotal /
                bitTokens.length).toFixed(2)
              }}
              <!-- <el-icon>
            <QuestionFilled style="height: 11px;" />
          </el-icon> -->
            </span>


          </small>
          <small style="color: #888;" v-if="!isMobile"> rendered markdown </small>
        </div>

        <div class="finalMessageTwoPannel" v-if="!globalStore.cleanMode"
          style="width: 100%;overflow:scroll;overflow-y:hidden; padding-bottom: 3px;" ref="scrollDiv">
          <div style="display: flex; justify-content: space-between;" :style="{ 'width': isMobile ? '195%' : '100%' }">
            <div class="final-message-half-pannel">
              <div style="background-color: #eee;white-space: pre-wrap;cursor: default;">
                <p style="color: #444" v-if="!tokens.length">
                  <span v-html="WaitingInfo"></span>
                </p>
                <OnPandaResponseText :responseState="responseState" />
              </div>
            </div>
            <hr style="color:#eee">
            <div class="final-message-half-pannel">
              <MarkdownResponse :content="finalMessage.content" :WaitingInfo="WaitingInfo" />
            </div>
          </div>
        </div>
        <div v-if="globalStore.cleanMode">
          <MarkdownResponse :content="finalMessage.content" :WaitingInfo="WaitingInfo" />
        </div>
      </div>
    </div>

    <DialogControlPannel :responseState="responseState" />
    <AnnotatorPanel
      v-if="pandaState.dialogCache.value?.annotate || pandaState.pandaTree.value?.description || pandaState.pandaTree.value?.comment || globalStore.debug"
      :responseState="responseState" />

    <el-divider content-position="left" style="margin-bottom: 5px;">{{ t('common.newMessage') }}:</el-divider>
    <div :style="{ opacity: newTurnMessage.content ? 1 : 0.5 }">
      <Message :message="newTurnMessage" :index="-2" @deleteMessage="newTurnMessage.content = ''"
        @sendButton="opreators.newRoundMessage()" />
    </div>

    <!-- <div v-html="warningContent" style="background-color: #fdd;white-space: pre-wrap;cursor: default;"></div> -->

    <el-divider content-position="left">
      <b>{{ t('common.controlParameter') }}:</b>
    </el-divider>

    <el-form class="toolbar options" label-width="140px">
      <el-form-item :label="$t('controlParameter.model')">
        <el-select-v2 v-model="modelName" filterable :options="Object.keys(apiConfigs).map((x, idx) => ({
          value: x,
          label: x,
        }))" placeholder="Select model" style="width: 440px" size="small" :height='400'
          :class="{ 'mobile-select-model-input': isMobile }" />
      </el-form-item>

      <div style="line-height: 1.85;margin-top: -20px;margin-bottom: -5px;" :align="isMobile ? 'right' : ''">
        <span v-for="_ in (isMobile ? 0 : 30)">&nbsp;</span>
        <template v-for="(modelName_, tag) in props.modelNameTags">
          <el-tag :type="modelName.includes(modelName_) ? 'primary' : 'info'"
            @click="handleModelTagClick($event, modelName_)" style="cursor: pointer;margin-left: 5px;">
            {{ tag }}
          </el-tag>
        </template>
        <small v-if="!isMobile">
          &nbsp;
          <el-tooltip class="" effect="light" placement="top" raw-content>
            <template #content>
              <MarkdownRender :content="$t('tooltips.modelTagClick')" />
            </template>
            <el-icon>
              <InfoFilled />
            </el-icon>
          </el-tooltip>
        </small>
      </div>
      <br>

      <el-form-item :label="$t('controlParameter.temperature')">
        <el-input-number v-model="chatConfig.temperature" :min="0" :max="10" :step="0.01" size="small" />
      </el-form-item>

      <el-form-item :label="$t('controlParameter.maxTokens')">
        <el-input-number v-model="chatConfig.max_tokens" :min="1" :max="1048576" :step="1" size="small" />
      </el-form-item>

      <el-form-item :label="$t('controlParameter.topLogprobs')">
        <el-input-number v-model="chatConfig.top_logprobs" :min="0" :max="50" :step="1" size="small" />
      </el-form-item>

      <el-form-item :label="$t('controlParameter.continueGenerating')">
        <small>
          <el-tag :type="apiConfig.support_continue_final_message ? 'success' : 'danger'">
            {{ $t(apiConfig.support_continue_final_message ? 'controlParameter.native' :
              'controlParameter.promptEngineering') }}
          </el-tag>
          &nbsp;
          <el-tooltip class="" effect="light" placement="top" raw-content>
            <template #content>
              <MarkdownRender :content="$t('tooltips.continueGeneratingSupport') + CONTINUE_PROMPT" />
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

        <!-- <el-form-item label="stop">
          <el-input v-model="chatConfig.stop" size="small" style="width: 120px;" />
          <small>
            &nbsp;
            &nbsp;
            <el-tooltip class="" effect="light" placement="top" raw-content>
              <template #content>
                <MarkdownRender
                  :content="'Similar to [stop item of OpenAI API](https://platform.openai.com/docs/api-reference/chat/create#chat-create-stop)\nIf input JSON string, will parse as JSON. \nFor Chrome user, using `F12 -> Network -> completions` to check the parse result'" />
              </template>
              <el-icon>
                <InfoFilled />
              </el-icon>
            </el-tooltip>
          </small>
        </el-form-item> -->

        <el-form-item label="extra_parameters">
          <el-input type="textarea" :autosize="{ minRows: 1 }" v-model="extraParametersString" size="small"
            style="width: 220px;" />
          <small>
            &nbsp;
            &nbsp;
            <el-tooltip class="" effect="light" placement="top" raw-content>
              <template #content>
                <MarkdownRender
                  :content='"JSON for [Extra Parameters](https://docs.vllm.ai/en/stable/dev/sampling_params.html), e.g.: \n`{\"stop\": \"\\n\", \"min_tokens\": 256}`\nFor Chrome user, using `F12 -> Network -> completions` to check the request"' />
              </template>
              <el-icon>
                <InfoFilled />
              </el-icon>
            </el-tooltip>
          </small>
        </el-form-item>
      </details>

    </el-form>
    <div v-if="warningContent"
      style="background-color: #fdd;white-space: pre-wrap;cursor: default;overflow-x: scroll; padding: 10px">
      <h3>Error Messages:</h3>
      <div v-html="warningContent"></div>
    </div>
    <br v-for="_ in (isMobile ? 12 : 0)">
  </div>
</template>

<script setup>
import { ref, computed, watch, toValue, provide } from 'vue'
import { onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import Message from './components/Message.vue'
import MessageRole from './components/widgets/MessageRole.vue'
import MarkdownRender from './components/widgets/MarkdownRender.vue'
import AnnotatorPanel from './components/AnnotatorPanel.vue'
import DialogControlPannel from './components/DialogControlPannel.vue'
import OnPandaHeader from './components/OnPandaHeader.vue'
import OnPandaResponseText from './components/OnPandaResponseText.vue'

import { OpenAI } from './utils/fetchOpenaiApi.js'
import { useGlobalStore } from './stores/globalStore.js'
import { useEventListener, closeFloatPannelMeta, buildMockObject } from '@/utils/commonUtils.js'
import { p, escapeHTML, copyToClipboard, duplicateWindow, tryLoadDuplicateWindow, deepCopy, deepEqual, ObjctKeyToCamelCaseNaming } from '@/utils/commonUtils.js'
import { tokensToSeq, convertMessageToTokens, normalizeRequest, messageToSeq, probOfToken } from './utils/chatUtils.js'
import { useScrollSwitchSync, useSelectedNodes } from '@/utils/userInterfaceUtils.js'

import { DocumentCopy, Edit, Refresh, VideoPause, DArrowRight, ChatLineRound, QuestionFilled, Promotion, View, Close, InfoFilled } from '@element-plus/icons-vue'


import { sleep } from '@/utils/commonUtils'
import MarkdownResponse from '@/components/widgets/MarkdownResponse.vue'
import { ResponseStateClassWithoutThis, defaultApiConfig, defaultChatConfig, CONTINUE_PROMPT } from '@/stores/responseState'


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
      // 'o1': 'oone',
      'r1': 'deepseek-r1',
      'image': 'image',
      // 'audio': 'audio',
      // 'llama': 'others-llama3p1-70b-chat',
      // 'qwen': 'others-qwen2p5-72b-chat',
      'gpt4o': 'chatgpt-4o-latest',
      'claude': 'claude',
      'groq': 'groq',
      'fast': 'llama-3.3-70b-versatile',
    },
    description: `Model name tags for quick selection`,
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

const responseState = ResponseStateClassWithoutThis()
const pandaState = responseState.pandaState

const onPandaContainer = ref(null)
watch(onPandaContainer, (newVal) => {
  // ref="responseState.onPandaContainer" is not work
  responseState.onPandaContainer.value = newVal
})




var bitTokens = computed(() => tokens.value.filter(token => typeof token.logprobs?.content[0]?.logprob === "number"))

var bitTotal = computed(
  () => bitTokens.value.reduce((sum, token) => sum + - Math.log2(probOfToken(token)), 0)
)


async function pasteThenRequestPromptLogprobs() {
  var pasteText = await navigator.clipboard.readText()
  if (tokens.value.length == 0) {
    tokens.value = [{ delta: { role: "assistant", content: "" } }]
  }
  opreators.applyInputChange(tokens.value[0], pasteText)
  responseState.requestPromptLogprobs()
}



const scrollDiv = ref(null)
const scrollSwitch = useScrollSwitchSync(scrollDiv); // { isSwitched, scrollToPosition }

const warning = responseState.warning
const warningContent = responseState.warningContent

const chatConfig = ref(defaultChatConfig)

const extraParametersString = ref("")
const extraParameters = computed(() => {
  try {
    return extraParametersString.value ? JSON.parse(extraParametersString.value) : {}
  } catch (error) {
    return {}
  }
})

const exampleNameToFunc = {
  "clear": () => {
    opreators.pandaState = pandaState
    pandaState.setEmpty()
  },
  "default": () => {
    modelName.value = props?.modelNameTags['on-panda'] || 'on-panda'
    opreators.loadMessagesWithPandaTree(messagesDefaultExample)
    opreators.newGenerate()
  },
  "R in 🍓": () => {
    opreators.loadMessagesWithPandaTree([{ role: "system", content: "" }, { role: "user", content: "🍍菠萝的英文单词有几个 P ?", description: "answer is 3", comment: "`comment` is editable for annotator" }])
    opreators.newGenerate()
  },
  "image": () => {
    if (props?.modelNameTags['image']) {
      modelName.value = props?.modelNameTags['image']
    }
    opreators.loadMessagesWithPandaTree(messagesImageExample)
    opreators.newGenerate()
  },
  // "audio": () => {
  //   modelName.value = "audio"
  //   opreators.loadMessagesWithPandaTree(messagesAudioExample
  //   )
  //   opreators.newGenerate()
  // },
  "tokenizer": () => {
    opreators.loadMessagesWithPandaTree(messagesTokenizerExample
    )
    opreators.newGenerate()
  },
  "random": () => {
    opreators.loadMessagesWithPandaTree([{ role: "user", content: "just output a random float128 number without any words, no code" }]
    )
    opreators.newGenerate()
  },
  "笑话": () => {
    opreators.loadMessagesWithPandaTree([{ role: "user", content: "讲一个关于西游记的笑话, 100字" }]
    )
    opreators.newGenerate()
  },
  "诗": () => {
    opreators.loadMessagesWithPandaTree([{ role: "user", content: "写藏头诗：\n人工智能，大有可为" }]
    )
    opreators.newGenerate()
  },
  "计算": () => {
    opreators.loadMessagesWithPandaTree([{ role: "system", content: "" }, { role: "user", content: "已知小王 2024年30岁，本来预计60岁退休。但现在中央每五年开一次会，每开一次会决定退休年龄延迟3年，求老王的真正退休年龄。" }]
    )
    opreators.newGenerate()
  },
  "count": () => {
    opreators.loadMessagesWithPandaTree([{ role: "system", content: "" }, { role: "user", content: "How many 1 in 01011010101111011011?", description: "Answer is 13" }]
    )
    opreators.newGenerate()
  },
  "AIME": () => {
    opreators.loadMessagesWithPandaTree([{ role: "system", content: "" }, { role: "user", content: "Real numbers $x$ and $y$ with $x,y>1$ satisfy $\log_x(y^x)=\log_y(x^{4y})=10.$ What is the value of $xy$?", description: "Answer is 25" }]
    )
    opreators.newGenerate()
  },
  "continue": () => {
    loadMessages(messagesContinueExample)
    setTimeout(() => opreators.continueGenerating(), 2000)
  },
  "annotate": async () => {
    pandaState.setExample()
    opreators.pandaState = pandaState
    await sleep(100)
    opreators.continueGenerating()
  }
}
var messages
// var messages = [{ role: "user", content: "just repeat 1 time: `पत्नी`" }]
var messagesDefaultExample = [{ role: "system", content: "" }, { role: "user", content: "🍓草莓的英文单词有几个 R ?" }]

var messagesCleared = [{ role: "system", content: "" }, { role: "user", content: "" }]

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
messages = messagesDefaultExample
if (globalStore.isOldUser) {
  messages = messagesCleared
}



var metaApiConfigs = ref([defaultApiConfig, ...props.apiConfigs])

const apiConfigs = ref({});

watch(metaApiConfigs, async function watchMetaApiConfigs(newValue) {
  const configs = [];
  for (let apiConfig of newValue) {
    apiConfig = deepCopy(apiConfig);
    if (!apiConfig.chat_config) {
      apiConfig.chat_config = {}
    }
    if (apiConfig.chat_config.model) {
      configs.push(apiConfig);
    } else {
      try {
        const openai = new OpenAI(ObjctKeyToCamelCaseNaming(apiConfig.client_config));
        const list = await openai.models.list();
        for await (const model of list) {
          const apiConfigWithModel = deepCopy(apiConfig);
          apiConfigWithModel.chat_config.model = model.id;
          configs.push(apiConfigWithModel);
        }
      } catch (error) {
        warning(error)
        console.log("Error in fetching models list");
        console.log(error);
      }
    }
  }
  apiConfigs.value = configs.reduce((obj, config, index) => {
    var key = `${index + 1}—` + (config.endpoint_name ? config.endpoint_name + "—" : "") + (config.chat_config.model || '<|None|>')
    if (isMobile.value) {
      key = `${index + 1} | ` + (config.chat_config.model || '<|None|>') + ' | ' + (config.endpoint_name ? config.endpoint_name : "")
    }
    obj[key] = config;
    return obj;
  }, {});
}, { immediate: true });

var modelName = ref(props?.modelNameTags['on-panda'] || 'on-panda')  // using endpoint_name == 'on-panda' as default model
// var modelName = ref('llama3')
// var modelName = ref('image')
// var modelName = ref('audio')

// setTimeout(requestPromptLogprobs, 3000)

watch(modelName, async function watchModelName(newValue) {  // set modelName to page title
  if (document.title.endsWith("onPanda")) {
    document.title = newValue + " | onPanda"
  }
})

const chatConfigKeys = Object.keys(chatConfig.value)

const apiConfigChosen = computed(() => {
  var apiConfigChosen = defaultApiConfig
  for (const [key, config] of Object.entries(apiConfigs.value)) {
    if (key.includes(modelName.value)) {
      apiConfigChosen = config
      break
    }
  }
  const changedChatConfig = {}
  for (const key of chatConfigKeys) { // apply apiConfigChosen.chat_config
    if (key in apiConfigChosen.chat_config) {
      if (key !== 'model' && JSON.stringify(apiConfigChosen.chat_config[key]) !== JSON.stringify(chatConfig.value[key])) {
        changedChatConfig[key] = apiConfigChosen.chat_config[key]
      }
      chatConfig.value[key] = apiConfigChosen.chat_config[key]
    }
  }
  if (Object.keys(changedChatConfig).length > 0) {
    // If ElMessage is poped up at beginning, will raise error:
    // TypeError: Cannot read properties of null (reading 'insertBefore')
    ElMessage.warning(`Change the control parameter: ${JSON.stringify(changedChatConfig)}`)
  }
  return apiConfigChosen
})

const apiConfig = computed(() => {
  // update apiConfig with defaultApiConfig
  var apiConfig = { ...apiConfigChosen.value }  // copy instead of reference
  apiConfig.client_config = { ...defaultApiConfig.client_config, ...apiConfig.client_config }
  apiConfig.chat_config = { ...defaultApiConfig.chat_config, ...apiConfig.chat_config, ...chatConfig.value, ...extraParameters.value }
  apiConfig = { ...defaultApiConfig, ...apiConfig }
  apiConfig.client_config.base_url = apiConfig.client_config.base_url.replace('${origin}', window.location.origin)

  return apiConfig
})

responseState.bindApiConfig(apiConfig)

var messages = responseState.messages
const tokens = responseState.tokens

const tokensModelNames = computed(() => {

  var tokensModelNames = []
  tokens.value.map(token => {
    if (token.model && !tokensModelNames.includes(token.model)) {
      tokensModelNames.push(token.model)
    }
  })

  if (tokensModelNames.length === 0) {
    return "unknown_model"
  }
  return tokensModelNames.join(", ")
})

const requestStatus = responseState.requestStatus

const WaitingInfo = computed(() => {
  if (requestStatus.value.generating) {
    return `⏳ <b>No.${requestStatus.value.requestTimes}</b> ${t('userMessages.waitingForModel')} <br>  <code style='margin-left:30px'> ${apiConfig.value.chat_config.model} </code>`
  } else {
    return t('userMessages.clickSendButton')
  }
})




const opreators = responseState.opreators
const loadMessages = responseState.loadMessages

provide('opreators.editRole', opreators.editRole)

var handleScrollDivFunctions = []
provide('handleScrollDivFunctions', handleScrollDivFunctions)
function handleScrollDivFunction(e) {
  for (const func of handleScrollDivFunctions) {
    func(e)
  }
}


const newTurnMessage = responseState.newTurnMessage
const finalMessage = responseState.finalMessage


opreators.loadMessagesWithPandaTree(messages.value)

function handleModelTagClick(event, newModelName) {
  if (event.ctrlKey) {
    localStorage.setItem('modelNameForDuplicateWindow', newModelName)
    duplicateWindow(pandaState)
  } else {
    modelName.value = newModelName
  }
}

onMounted(async () => {
  scrollDiv.value.addEventListener('scroll', handleScrollDivFunction);
  try {
    await import('@/assets/secret/custom.js');
  } catch (error) {
    console.error('Failed to load custom.js:', error);
  }
  metaApiConfigs.value = [...metaApiConfigs.value, ...globalStore.customMetaApiConfigs]
  var exampleFunc = exampleNameToFunc['default']
  if (tryLoadDuplicateWindow(pandaState)) { // duplicate window has higher priority
    exampleFunc = () => { }
    if (localStorage.getItem('modelNameForDuplicateWindow')) {
      modelName.value = localStorage.getItem('modelNameForDuplicateWindow')
      localStorage.removeItem('modelNameForDuplicateWindow')
      exampleFunc = opreators.newGenerate
    }
  } else if (globalStore.isOldUser) {
    exampleFunc = () => { }
  }
  if (globalStore.debug) {
    // var exampleFunc = exampleNameToFunc['image']
    // var exampleFunc = () => {
    //   modelName.value = 'deepseek-r1-distill-qwen-32b'
    //   // modelName.value = 'doubao-1.5-pro-32k'
    //   opreators.newGenerate()
    // }
  }
  setTimeout(async function launchExampleFunc() {
    if (!requestStatus.value.generating) {
      await exampleFunc()
    }
    if (globalStore.debug) {
      p("tokens", tokens)
    }
  }, 3000)
})

onBeforeUnmount(async () => {
  scrollDiv.value.removeEventListener('scroll', handleScrollDivFunction);
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

.final-message-half-pannel {
  display: inline-block;
  width: 49.5%;
}


* {
  font-family: Arial, sans-serif;
}
</style>

<style>
.mobile-select-model-input .el-select__wrapper {
  font-size: 16px;
}

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