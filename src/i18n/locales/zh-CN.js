export default {
  common: {
    save: '保存',
    delete: '删除',
    edit: '编辑',
    cancel: '取消',
    confirm: '确认',
    continue: '继续',
    stop: '停止',
    copy: '复制',
    paste: '粘贴',
    refresh: '刷新',
    examples: '示例',
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
    promptEngineering: '提示工程'
  },
  userMessages: {
    waiting: '等待中...',
    copied: '已复制到剪贴板',
    responseRefreshed: '响应概率已刷新',
    noPromptLogprobs: '响应中没有 prompt_logprobs，可能当前模型不支持刷新概率和候选',
    dropJsonHere: '拖放JSON文件到这里！',
    onlyOneJsonFile: '只能上传一个JSON文件',
    openAnnotatorPanel: '进入标注模式',
    waitingForModel: '请求，正在等待模型响应：',
    clickSendButton: '➡️ 请点击生成按钮'
  },
  tooltips: {
    saveData: '保存数据',
    previousModification: '上一个修改',
    nextModification: '下一个修改',
    deleteDialog: '删除当前对话',
    restoreDialog: '恢复当前对话',
    uploadFile: '上传 *.panda.json 文件',
    downloadFile: '下载为 panda.json 文件',
    cleanUI: '简洁界面（阅读模式）',
    continueGenerating: '继续生成',
    stopGenerating: '停止生成',
    modelTagClick: '1. 点击标签切换模型\n2. 如果按住 `Ctrl` 键并点击标签，将在新窗口中打开包含相同消息的对话',
    continueGeneratingSupport: '此模型是否原生支持继续生成最终消息？\n\n如果不支持，将使用工程提示进行继续生成：\n\n> ',
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
  header: {
    usage: '使用说明',
    basicFeatures: '基本功能',
    advancedFeatures: '高级功能',
    beginnerTips: '新手提示',
    asDataAnnotator: '作为标注工具',
    asWritingTool: '作为写作工具',
    dataAnnotatorDesc: '在扩大数据规模之前提高数据效率。',
    writingToolDesc: '为大语言模型写作提供精确的字节级控制。',
    instruction: `
### onPanda 标注指南
**基本功能**
- 概率可视化：模型回复由一个一个的词组组成，词组底部的颜色代表模型输出该词组的概率
- 候选续写：将鼠标悬停在回复文本上可查看候选词组，点击候选词组，模型会基于被选择的词组继续生成
- 双击编辑：若模型回复出现错误，可以双击错误的词组对其进行编辑，随后模型会基于编辑后的内容继续生成
- 角色信息：system 是系统消息，user 是用户消息，assistant 是模型回复

**图片功能**
- 输入框可以直接粘贴图片 
- 单击图片放大，双击打开

**标注要求**
- 尽可能用“候选续写”，如果候选词组中没有合适的词组，再考虑“双击编辑”
- 请删掉非标注相关的历史对话后再保存

若您使用 onPanda 不是为了标注数据，推荐点击右上角语言切换为英文界面，有进阶功能介绍
`
  }
} 