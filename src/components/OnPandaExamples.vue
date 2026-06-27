<template>
  <div style="line-height: 2" class="onPandaExamples">
    <template v-for="(func, name) in exampleNameToFunc">
      <el-tag type="info" @click="func(props.dialogWithControlState)" style="cursor: pointer; margin-left: 5px;">
        {{ name }}
      </el-tag>
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { sleep } from '../utils/commonUtils.js'
import { useGlobalStore } from '../stores/globalStore.js'

const globalStore = useGlobalStore()
const { t } = useI18n()

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
const modelNameTagsComputed = controlParameterState.modelNameTagsComputed
// Example message templates
const welcomeMessages = [{ role: "system", content: "" }, { role: "user", content: '🍓草莓的英文单词有几个 "R" ?' }]

const messagesTokenizerExample = [{ role: "user", content: "Repeat only once, no other words:\n```\n<|磊|>🧎🏿‍♂️‍➡️\\n<hr>\n蘒    𝒀𝒆𝒔पत्नी\n// Test repeated emojis\ntest ⭐ 1024\ntest ⭐ 1024\ntest ⭐ 1024\n```" }]

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

// Edit this helper to try different marker styles (e.g. `<${name}>`, `[[${name}]]`).
// Each semantic slot becomes a unique string so you can locate it after the chat template is applied.
const m = name => `_${name}_`

const messagesTemplateExample = [
  {
    role: "system",
    content: m('system_content1'),
    comment: "Check the model's chat template via `prompt_logprobs`. Each field in the request data serves as a unique marker."
  },
  { role: "user", content: m('user_content1') },
  {
    role: "assistant",
    reasoning: m('assistant_reasoning1'),
    content: m('assistant_content1')
  },
  { role: "user", content: m('user_content2') },
  {
    role: "assistant",
    reasoning: m('assistant_reasoning2'),
    content: m('assistant_content2'),
    tool_calls: [
      {
        id: `functions.${m('function_name1')}:0`,
        type: "function",
        index: 0,
        function: {
          name: m('function_name1'),
          arguments: JSON.stringify({
            [m('argument_name1')]: m('argument_value1'),
            [m('argument_name2')]: m('argument_enum1')
          })
        }
      },
      {
        id: `functions.${m('function_name2')}:1`,
        type: "function",
        index: 1,
        function: {
          name: m('function_name2'),
          arguments: JSON.stringify({
            [m('argument_name3')]: [m('argument_value2')],
            [m('argument_name4')]: {
              [m('argument_name5')]: m('argument_value3')
            },
            [m('argument_name6')]: m('argument_enum3')
          })
        }
      }
    ]
  },
  {
    role: "tool",
    content: m('tool_content1'),
    tool_call_id: `functions.${m('function_name1')}:0`,
    name: m('function_name1')
  },
  {
    role: "tool",
    content: m('tool_content2'),
    tool_call_id: `functions.${m('function_name2')}:1`,
    name: m('function_name2')
  },
  {
    role: "assistant",
    reasoning: m('assistant_reasoning3'),
    content: m('assistant_content3'),
    finish_reason: "stop"
  }
]

const templateToolConfigs = [
  {
    type: "function",
    function: {
      name: m('function_name1'),
      description: m('function_description1'),
      parameters: {
        type: "object",
        properties: {
          [m('argument_name1')]: {
            type: "string",
            description: m('argument_description1')
          },
          [m('argument_name2')]: {
            type: "string",
            enum: [m('argument_enum1'), m('argument_enum2')]
          }
        },
        required: [m('argument_name1'), m('argument_name2')]
      }
    }
  },
  {
    type: "function",
    function: {
      name: m('function_name2'),
      description: m('function_description2'),
      parameters: {
        type: "object",
        properties: {
          [m('argument_name3')]: {
            type: "array",
            items: { type: "string" },
            description: m('argument_description3')
          },
          [m('argument_name4')]: {
            type: "object",
            description: m('argument_description4'),
            properties: {
              [m('argument_name5')]: {
                type: "string",
                description: m('argument_description5')
              }
            },
            required: [m('argument_name5')]
          },
          [m('argument_name6')]: {
            type: "string",
            enum: [m('argument_enum3'), m('argument_enum4')],
            default: m('argument_enum3')
          }
        },
        required: [m('argument_name3'), m('argument_name4')]
      }
    }
  }
]


const isZh = computed(() => globalStore.currentLocale.toLowerCase().indexOf('zh-cn') != -1)
function switchDefaultToAgentTag() {
  const defaultModel = modelNameTagsComputed.value['on-panda'] || 'on-panda'
  if (modelName.value.indexOf(defaultModel) != -1) {
    modelName.value = modelNameTagsComputed.value['default-agent-tag'] || 'default-agent-tag'
  }
}

function checkLocalhostMcpSupport() {
  const userAgent = navigator.userAgent
  const isIosWebKitBrowser = /CriOS|FxiOS|EdgiOS/.test(userAgent)
  const isSafari = userAgent.includes('Safari')
    && !/Chrome|Chromium|CriOS|FxiOS|Edg|EdgiOS|OPR|Opera/.test(userAgent)
  if ((!isSafari && !isIosWebKitBrowser) || window.location.protocol !== 'https:') {
    return
  }
  ElMessageBox.alert(
    t('localMcp.safariUnsupportedMessage'),
    t('localMcp.safariUnsupportedTitle'),
    {
      customClass: 'on-panda-local-mcp-message-box',
      confirmButtonText: 'OK',
      buttonSize: 'small',
      showClose: true,
      type: 'warning',
    },
  ).catch(() => { })
  throw new Error(t('localMcp.safariUnsupportedTitle'))
}

// Define all example functions
const defaultExampleNameToFunc = {
  "clear": () => {
    operationCenter.pandaState = pandaState
    pandaState.setEmpty()
  },
  "default": () => {
    modelName.value = modelNameTagsComputed.value['on-panda'] || 'on-panda'
    operationCenter.loadMessages(welcomeMessages)
    operationCenter.generateNew()
  },
  // "R in 🍓": () => {
  //   operationCenter.loadMessages([{ role: "system", content: "" }, { role: "user", content: "🍍菠萝的英文单词有几个 P ?", description: "answer is 3", comment: "`comment` is editable for annotator" }])
  //   operationCenter.generateNew()
  // },
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
  "🤖 browser-agent": () => {
    switchDefaultToAgentTag()
    var JsExampleMessages = [{
      role: "user", content: "AI news in the past week.", comment: `[Task Examples]
- Search for information about the step-3.7-flash model, then build an Apple.com-style introduction page.
- Use render_svg to draw an SVG image of "a panda riding a llama" and iterate 3 times.
- What's the weather in Beijing? Build an animated weather card in the top-right corner.
- View the screenshot of the paper's first page and evaluate the design and color palette of Figure 1: https://arxiv.org/pdf/2401.00036
- Take a photo of me, then crop it while viewing the photo so my face is centered. Draw sunglasses that fit both eyes, then create a photo booth-style portrait for me to download.
- Organize the PDF files in a folder by topic, move them into matching subfolders, and finally create index.html to summarize the information. (Requires the user to drag and drop the folder.)
- Review the uncommitted changes in this repo and directly fix any bugs. (Requires the user to drag and drop the repo.)` }]
    if (isZh.value) {
      JsExampleMessages = [{
        role: "user", content: "汇总最近一周的 AI 新闻。", comment: `【任务例子】
- 搜索 step-3.7-flash 模型信息，然后实现一个苹果官网风格的介绍网页。
- 用 render_svg 绘制："熊猫骑在羊驼上" 的 SVG 图像，并迭代 3 次。
- 北京的天气如何？实现一个带动效的天气小卡片放在右上角。
- 查看论文第一页的截图，评价图1的设计和配色: https://arxiv.org/pdf/2401.00036
- 给我拍个照，然后你边看照片边裁剪，让头像居中，你再画一个贴合双眼的墨镜，做个大头贴下载给我。
- 整理文件夹内的 PDF 文件，按照主题归类并移入对应的子文件夹，最后创建 index.html 来汇总信息（需用户拖拽分享文件夹）
- review 这个 repo 未 commit 的改动，有 BUG 请直接修改（需用户拖拽分享 repo）` }]
    }
    operationCenter.loadMessages(JsExampleMessages)
    operationCenter.pandaState.currentDialogData.value.tool_configs = [{
      type: 'mcp',
      server_url: 'local-fetch://browser-agent-mcp',
    }]
    // operationCenter.generateNew()
  },
  "🐱 pet": () => {
    switchDefaultToAgentTag()
    var JsExampleMessages = [{ role: "user", content: "Create an interactive desktop pet placed in the bottom-right corner of the current page." }]
    if (isZh.value) {
      JsExampleMessages = [{ role: "user", content: "创建一个可交互的桌面宠物，放在当前页面右下角。" }]
    }
    operationCenter.loadMessages(JsExampleMessages)
    operationCenter.pandaState.currentDialogData.value.tool_configs = [{
      type: 'mcp',
      server_url: 'local-fetch://browser-agent-mcp',
    }]
    operationCenter.generateNew()
  },
  "codex/cc": () => {
    switchDefaultToAgentTag()
    var HarnessMessages = [
      { role: "user", content: "1. List the current directory structure\n2. Read the key files\n3. Summarize and give suggestions", comment: "[onPanda + Local Harness]\n - Setup: pip3 install -U harness_to_mcp && harness_to_mcp codex # or claude/openclaw/opencode\n - Purpose: Expose the harness's internal tools as a standard MCP server and bridge them into onPanda\n - Details: https://github.com/on-panda/harness_to_mcp" },
    ]
    if (isZh.value) {
      HarnessMessages = [
        { role: "user", content: "1. 列出当前目录结构\n2. 阅读关键文件\n3. 汇总信息并给出建议", comment: "【onPanda 连接本地 Harness】\n - 部署命令: pip3 install -U harness_to_mcp && harness_to_mcp codex # or claude/openclaw/opencode\n - 作用: 将 harness 的内部 tools 暴露成标准 MCP server 并接入 onPanda\n - 详细信息: https://github.com/on-panda/harness_to_mcp" },
      ]
    }
    operationCenter.loadMessages(HarnessMessages)
    operationCenter.pandaState.currentDialogData.value.tool_configs = [{
      type: 'mcp',
      server_url: 'http://127.0.0.1:9330/mcp',
    }]
    checkLocalhostMcpSupport()
    // operationCenter.generateNew()
  },
  "GUI-agent": () => {
    switchDefaultToAgentTag()
    // modelName.value = 'gui-tag'
    var GuiMessages = [
      { role: "system", content: "", comment: "[Simple Computer Use Agent]\n - Usage: requires a local MCP server at http://127.0.0.1:9300/mcp\n - Setup: pip3 install -U pyautogui_mcp_server && python3 -m pyautogui_mcp_server\n - Details: https://github.com/on-panda/pyautogui_mcp_server" },
      { role: "user", content: "Get the news:\n1. Take a screenshot of the desktop to understand the current environment\n2. Open any news website in a browser and screenshot its homepage\n3. Extract 5 news headlines so I can pick which one to read in detail" },
    ]
    if (isZh.value) {
      GuiMessages = [
        { role: "system", content: "", comment: "【简易 Computer Use Agent】\n - 使用说明: 需要用户在本机的 http://127.0.0.1:9300/mcp 提供 MCP server\n - 部署命令: pip3 install -U pyautogui_mcp_server && python3 -m pyautogui_mcp_server\n - 详细信息: https://github.com/on-panda/pyautogui_mcp_server" },
        { role: "user", content: "获取新闻：\n1. 先截图查看电脑屏幕，了解环境和情况\n2. 用浏览器随便打开一个国内的新闻网站，截图看其首页\n3. 提取 5 个新闻关键词，我再来选择看那一条的正文" },
      ]
    }
    operationCenter.loadMessages(GuiMessages)
    operationCenter.pandaState.currentDialogData.value.tool_configs = [{
      type: 'mcp',
      server_url: 'http://127.0.0.1:9300/mcp',
      require_approval: 'always',
    }]
    checkLocalhostMcpSupport()
    // operationCenter.generateNew()
  },
  // "svg": () => {
  //   var SvgExampleMessages = [{ role: "user", content: "Generate svg image and iterate 3 times, draw content: A panda is riding on a llama" }]
  //   operationCenter.loadMessages(SvgExampleMessages)
  //   operationCenter.pandaState.currentDialogData.value.tool_configs = [{
  //     type: 'mcp',
  //     server_url: 'local-fetch://browser-agent-mcp',
  //   }]
  //   operationCenter.generateNew()
  // },
  "tokenizer": () => {
    operationCenter.loadMessages(messagesTokenizerExample)
    operationCenter.generateNew()
  },
  "template": () => {
    operationCenter.loadMessages(messagesTemplateExample, templateToolConfigs)
    operationCenter.refreshResponseProbability().then(async () => {
      await nextTick()
      document.querySelectorAll('.prompt-logprobs-details').forEach(d => { d.open = true })
    })
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
  "image": () => {
    modelName.value = "image-tag"
    operationCenter.loadMessages(messagesImageExample)
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

<style>
.on-panda-local-mcp-message-box {
  max-width: min(420px, calc(100vw - 32px));
  border-radius: 6px;
  font-family: Arial, sans-serif;
}
</style>
