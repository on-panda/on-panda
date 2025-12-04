export default {
  common: {
    save: '保存',
    delete: '删除',
    close: '关闭',
    edit: '编辑',
    cancel: '取消',
    confirm: '确认',
    continue: '继续',
    stop: '停止',
    copy: '复制',
    paste: '粘贴',
    refresh: '刷新',
    examples: '示例',
    instructions: '说明',
    dialog: '对话',
    newMessage: '新消息',
    controlParameter: '控制参数',
    errorMessages: '错误信息',
    advancedControl: '高级控制'
  },
  controlParameter: {
    model: '模型',
    temperature: '采样温度',
    maxTokens: '最大生成长度',
    topLogprobs: '候选词数量',
    continueGenerating: '续写方案',
    native: '原生',
    promptEngineering: '提示工程',
    refreshModelList: '刷新模型列表',
    editLocalStorageApiConfigs: '自定义 API 配置',
    editLocalStorageApiConfigsInstructions: `
- 将您自己的自定义 API 接入 onPanda
- 支持 JSON5 格式（一种宽泛的 JSON 格式）
- 外层必须是数组
- 复制粘贴就能跑的例子：
\`\`\`js
[
    { // openAI chat completion API 格式
      "client_config": {
          "base_url": "https://vllm-test-api.diyer22.com/v1",
          "api_key": "ak-onPandaTestKey",  // API 密钥
      },
      "chat_config": {  // chat completion 请求的参数
          // 若未指定 model，则会自动访问 /models 接口获取模型列表
          "model": "Qwen/Qwen2.5-7B-Instruct-GPTQ-Int4",
          "top_logprobs": 5,  // 候选词数量，为 0 则关闭 logprobs 功能
          // ... 支持其他任何 chat 参数
      },
      // 以下为非必填项：
      // 是否支持原生续写 assistant 消息（比如：开源模型、Claude 支持、OpenAI 不支持），默认 true
      "support_continue_final_message": true,
      "endpoint_name": "example",  // API 别名
      "tag_name": "custom",  // 在 onPanda UI 上添加模型快捷标签
      "low_priority": false,  // 是否为低优先级。将排在模型列表中最后，被匹配的优先级也最低
    },
    // { ... } 另一个 API 配置
]
\`\`\`
- 可以从 \`高级控制\` -> \`Current API config JSON\` 中查看当前 API 的配置

**隐私声明：**
- 自定义 API 配置文件存储在您的浏览器本地（localStorage）
- 使用自定义 API 配置时，onPanda 会通过您的浏览器直接向 API 发起请求，不会上传到任何第三方服务器
`.replaceAll('{', '&#123;').replaceAll('}', '&#125;')
  },
  userMessages: {
    waiting: '等待中...',
    copied: '已复制',
    copyFailed: '复制失败',
    responseRefreshed: '响应概率已刷新',
    modelsRefreshed: '模型列表刷新完成',
    noPromptLogprobs: '响应中没有 prompt_logprobs，可能当前模型不支持刷新概率和候选',
    dropJsonHere: '拖放JSON文件到这里！',
    onlyOneJsonFile: '只能上传一个JSON文件',
    openAnnotatorPanel: '打开标注面板',
    waitingForModel: '请求，正在等待模型响应：',
    clickSendButton: '➡️ 请点击生成按钮'
  },
  tooltips: {
    dialogKeyHint: `对话标签页说明：
1. 鼠标点击标签，切换至对应对话
2. 也可以使用左右方向键切换对话
3. 绿色小圆点表示对应对话是良好对话
4. 蓝色小圆点表示对应对话的答复是新生成的，而不是基于续写的`,
    saveData: '保存数据',
    previousModification: '上一个修改',
    nextModification: '下一个修改',
    deleteDialog: '删除当前对话',
    eraseDialog: '彻底删除当前对话',
    clearAndReset: '清空并重置整条数据',
    restoreDialog: '恢复当前对话',
    uploadFile: '上传 *.panda.json 文件',
    downloadFile: '下载为 panda.json 文件',
    cleanUI: '简洁界面（阅读模式）',
    continueGenerating: '继续生成',
    stopGenerating: '停止生成',
    modelTagClick: '1. 单击标签切换模型；双击标签切换模型并重新生成。\n2. 如果按住 `Ctrl` 键并点击或者用鼠标中键点击，将打开新窗口并用对应模型重新生成',
    continueGeneratingSupport: '此模型是否支持原生续写 assistant 消息？\n\n如果不支持，将使用提示工程(prompt engineering)进行续写：\n\n> ',
    refreshTokenProb: '更新词组概率和候选',
    dblclickToPasteAndRefresh: '或双击',
    pasteAndRefresh: '粘贴并更新'
  },
  placeholders: {
    submitEnter: '提交: `↵`; 换行: `shift+↵`',
  },
  annotator: {
    annotatorPanel: '标注面板',
    isGood: '是否良好',
    isGoodTooltip: '最后一次助手的回复是否良好？',
    defaultChoice: '如果没有被标注，对于最新对话默认为"Y"，否则默认为"N"',
    noChoiceMade: '没有被标注',
    latestDialogDefault: '由于这是最新的对话，所以默认为"Y"',
    notLatestDialogDefault: '由于这不是最新的对话，所以默认为"N"',
    currentDialogJson: '当前对话 JSON',
    dialogCacheTips: '这个对话缓存可能没有及时更新。可以尝试切换对话来刷新它',
    tokens: '令牌',
    dialogLevel: '当前对话 / 当前标注',
    notSavedYet: '尚未保存',
    pandaTreeJson: '标注 JSON 预览',
    title: '标题',
    uploadFile: '上传文件',
    updateTime: '更新时间',
    description: '描述',
    comment: '评论'
  },
  chatMessage: {
    emptyMessageIgnored: '空内容会被忽略',
    renderedMarkdown: '格式渲染:',
    clear: '清空',
    delete: '删除该对话',
    send: '生成➡️',
    ctrlEnter: 'ctrl+enter'
  },
  dialogPanel: {
    promptLogprobsTooltip: '更新词组概率后，可查看整条 prompt 的 logprobs 可视化（chat templates）',
    promptVisualizationLabel: '整条 prompt 可视化 🪄'
  },
  header: {
    usage: '使用说明',
    basicFeatures: '基本功能',
    advancedFeatures: '高级功能',
    beginnerTips: '新手提示',
    asDataAnnotator: '作为标注工具',
    asWritingTool: '作为写作工具',
    asDrivingMode: '作为模型 API',
    dataAnnotatorDesc: 'Token-level 标注，提高数据效率，开启 reasoning 新范式。',
    writingToolDesc: '为大语言模型写作提供精确的字符级控制。',
    drivingModeDesc: '你将伪装成 API 并指导模型完成任务。',
    instruction: `
### onPanda 数据标注指南
**基本功能**
- 概率可视化：模型回复由一个一个的词组组成，词组底部的颜色代表模型输出该词组的概率，绿色代表概率高，红色代表概率低
- 候选续写：将鼠标悬停在回复文本上可查看候选词组，点击任意候选词组，模型会基于该词组续写回答
- 双击修改：可以双击词组对其进行修改，随后模型会基于修改后的内容续写回答
- 角色信息：system 是系统消息，user 是用户消息，assistant 是模型回复

**图片功能**
- 输入框可以直接粘贴图片和音频
- 单击图片会放大/缩小图片，双击图片会打开图片
- 注意：只有特定的模型才支持图片输入功能

**标注要求**
- 尽可能用“候选续写”，如果候选词组中没有合适的词组，再考虑“双击修改”问题词组
- 请删掉非标注相关的历史对话后再保存

若您使用 onPanda 不是为了标注数据，推荐点击右上角语言切换为英文界面，有进阶功能介绍
`
  }
} 
