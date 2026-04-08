<template>
  <div style="line-height: 2">
    <template v-for="(func, name) in exampleNameToFunc">
      <el-tag type="info" @click="func(props.dialogWithControlState)" style="cursor: pointer; margin-left: 5px;">
        {{ name }}
      </el-tag>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { sleep } from '../utils/commonUtils.js'
import { useGlobalStore } from '../stores/globalStore.js'

const globalStore = useGlobalStore()

const props = defineProps({
  dialogWithControlState: {
    type: Object,
    required: true
  }
})

const { responseState, controlParameterState } = props.dialogWithControlState

const operationCenter = responseState.operationCenter
const pandaState = responseState.pandaState

const modelName = controlParameterState.modelName
const modelNameTags = controlParameterState.modelNameTagsComputed
// Example message templates
const welcomeMessages = [{ role: "system", content: "" }, { role: "user", content: '🍓草莓的英文单词有几个 "R" ?' }]

const messagesTokenizerExample = [{ role: "user", content: "Repeat only once, no other words:\n```\n<|磊|>🧎🏿‍♂️‍➡️\\n<hr>\n蘒    𝒀𝒆𝒔पत्नी\n```" }]

const messagesContinueExample = [{ role: "user", content: "Tell me a common saying" }, { "role": "assistant", "content": '"An apple a day, keeps', "finish_reason": "stop" }]

// VLM
const messagesImageExample = [{
  role: "user", content: [
    { type: "text", text: '图中左侧的 "v" 是由什么形状构成？\n' },
    {
      type: "image_url", image_url: {
        url: "https://docs.vllm.ai/en/latest/assets/logos/vllm-logo-text-light.png"
      },
    }
  ]
}]

const messagesAudioExample = [
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

const messagesToolsExample = [
  { "role": "system", "content": "You are a weather inquiry agent." },
  {
    "role": "user",
    "content": "Say hi first, and then call the tool to tell me the current temperatures(°C) in New York City and San Francisco?"
  },
  {
    "role": "assistant",
    "reasoning": "Okay, I see the only tool available is get_weather, I will say hi and call tools.",
    "content": "Hi! Let me get the current temperatures for you.",
    "tool_calls": [
      {
        "id": "functions.get_weather:0",
        "type": "function",
        "index": 0,
        "function": {
          "name": "get_weather",
          "arguments": "{\"location\": \"New York City, NY\", \"unit\": \"celsius\"}"
        }
      },
      {
        "id": "functions.get_weather:1",
        "type": "function",
        "index": 1,
        "function": {
          "name": "get_weather",
          "arguments": "{\"location\": \"San Francisco, CA\", \"unit\": \"celsius\"}"
        }
      }
    ]
  },
  {
    "role": "tool",
    "content": "Weather in New York City, NY: -4°C, snowy.",
    "tool_call_id": "functions.get_weather:0",
    "name": "get_weather"
  },
  {
    "role": "tool",
    "content": "Weather in San Francisco, CA: 13°C, sunny.",
    "tool_call_id": "functions.get_weather:1",
    "name": "get_weather"
  }
]

// Define all example functions
const defaultExampleNameToFunc = {
  "clear": () => {
    operationCenter.pandaState = pandaState
    pandaState.setEmpty()
  },
  "default": () => {
    modelName.value = modelNameTags.value['on-panda'] || 'on-panda'
    operationCenter.loadMessages(welcomeMessages)
    operationCenter.generateNew()
  },
  "R in 🍓": () => {
    operationCenter.loadMessages([{ role: "system", content: "" }, { role: "user", content: "🍍菠萝的英文单词有几个 P ?", description: "answer is 3", comment: "`comment` is editable for annotator" }])
    operationCenter.generateNew()
  },
  "image": () => {
    if (modelNameTags.value['image']) {
      modelName.value = modelNameTags.value['image']
    }
    operationCenter.loadMessages(messagesImageExample)
    operationCenter.generateNew()
  },
  "tools": () => {
    operationCenter.loadMessages(messagesToolsExample)
    operationCenter.pandaState.currentDialogData.value.tool_configs = [
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
      },
    ]
    operationCenter.generateNew()
  },
  "js": async () => {
    operationCenter.loadMessages([{ role: "user", content: "Using JavaScript to solve 10086**4" }])
    const { localFetchConfig } = await import('./plugins/JavaScriptEnvironmentMcp.js')
    operationCenter.toolManageState.localFetchs[localFetchConfig.server_url] = localFetchConfig.fetch
    operationCenter.pandaState.currentDialogData.value.tool_configs = [{
      type: 'mcp',
      server_url: localFetchConfig.server_url,
    }]
    operationCenter.generateNew()
  },
  "tokenizer": () => {
    operationCenter.loadMessages(messagesTokenizerExample)
    operationCenter.generateNew()
  },
  // "random": () => {
  //   operationCenter.loadMessages([{ role: "user", content: "just output a random float128 number without any words, no code" }])
  //   operationCenter.generateNew()
  // },
  "笑话": () => {
    operationCenter.loadMessages([{ role: "user", content: "讲一个关于西游记的笑话, 100字左右" }])
    operationCenter.generateNew()
  },
  "诗": () => {
    operationCenter.loadMessages([{ role: "user", content: "写藏头诗：\n人工智能，大有可为" }])
    operationCenter.generateNew()
  },
  // "计算": () => {
  //   operationCenter.loadMessages([{ role: "system", content: "" }, { role: "user", content: "已知小王 2024年30岁，本来预计60岁退休。但现在中央每五年开一次会，每开一次会决定退休年龄延迟3年，求老王的真正退休年龄。" }])
  //   operationCenter.generateNew()
  // },
  "count": () => {
    operationCenter.loadMessages([{ role: "system", content: "" }, { role: "user", content: "How many 1 in 01011010101111011011?", description: "Answer is 13" }])
    operationCenter.generateNew()
  },
  "AIME": () => {
    operationCenter.loadMessages([{ role: "system", content: "" }, { role: "user", content: "Real numbers $x$ and $y$ with $x,y>1$ satisfy $\log_x(y^x)=\log_y(x^{4y})=10.$ What is the value of $xy$?", description: "Answer is 25" }])
    operationCenter.generateNew()
  },
  "continue": () => {
    operationCenter.loadMessages(messagesContinueExample)
    setTimeout(() => operationCenter.continueGenerating(), 2000)
  },
  "multi-turn": () => {
    // operationCenter.loadMessages([{ role: "system", content: "You are a helpful assistant." }, { role: "user", content: "How many letter “r”s are there in the English word for 🍓?" }, { role: "assistant", content: "The English word for “strawberry” contains two letter “r”s." }, { role: "user", content: "You're wrong, you should break the word into letters and count them one by one." }])
    // { role: "user", content: "“p”s in 🍍?" }
    operationCenter.loadMessages([{ role: "system", content: "You are a helpful assistant." }, { role: "user", content: "List three types of fruits." }, { role: "assistant", content: "Apple, potato, banana." }, { role: "user", content: "Potato is not fruit." }])
    operationCenter.generateNew()
  },
  "annotate": async () => {
    pandaState.setExample()
    operationCenter.pandaState = pandaState
    await sleep(100)
    operationCenter.continueGenerating()
  },
}

const exampleNameToFunc = computed(() => {
  return {
    ...defaultExampleNameToFunc,
    ...globalStore.customExampleNameToFunc
  }
})

defineExpose({
  exampleNameToFunc
})

</script>
