<template>
  <div class="message" :id="messageAnchorId || null" style="max-width: 1024px;">
    <div style="display :flex;">
      <MessageRole :message="props.message" />
      <span class="stretch" style="margin-right: auto" />
      <div>
        <el-button ref="isRenderContentEditingButton" v-if="isRenderRole" :icon="Edit" size="small"
          class="massageOperationButton" @click="handleToggleRenderContentEditing"
          :type="isRenderContentEditing ? 'primary' : ''"></el-button>
        <el-tooltip :content="messageActionTooltip" placement="top">
          <el-button :icon="messageActionIcon" size="small" class="massageOperationButton" style="margin-right: 5px;"
            @click="handleDeleteMessage" />
        </el-tooltip>
      </div>
      <a v-if="props.messageIndex >= 0" :href="messageAnchorHref"
        style="color: #888; margin-top: 12px;font-size: 15px; text-decoration: none;">&nbsp;#{{
          props.messageIndex + 1 }}</a>
    </div>
    <div v-if="showMessageDraftWarning" class="messageDraftWarning">
      {{ messageDraftWarning }}
    </div>
    <div v-if="(isRenderRole && !isRenderContentEditing)">
      <div v-if="showPrimaryActionButton" class="messagePrimaryActionRow">
        <div class="messageRenderContent messagePrimaryActionContent">
          <MessageAsTextRender :messageAsText="messageAsText" @dblclick="handleRenderContent" />
        </div>
        <button @click="handlePrimaryAction" :disabled="isPrimaryActionDisabled" :style="primaryActionButtonStyle"
          class="messagePrimaryActionButton">
          <b>{{ primaryActionLabel }}</b>
          <template v-if="showPrimaryActionShortcut">
            <br>
            <small>{{ t('chatMessage.ctrlEnter') }}</small>
          </template>
        </button>
      </div>
      <div v-else class="messageRenderContent">
        <MessageAsTextRender :messageAsText="messageAsText" @dblclick="handleRenderContent" />
      </div>
    </div>
    <div v-else class="editorAndDetails">
      <div class="messagePrimaryActionRow">
        <el-input ref="messageContentInput" class="message-content messagePrimaryActionContent" v-model="messageDraft"
          type="textarea" :placeholder="t('chatMessage.emptyMessageIgnored')" :autosize="{ minRows: 2, maxRows: 50 }"
          @keydown.ctrl.enter="handlePrimaryAction" @paste="handlePaste" @focus="handleEditorFocus"
          @blur="handleEditorBlur" />

        <button v-if="showPrimaryActionButton" @click="handlePrimaryAction" :disabled="isPrimaryActionDisabled"
          :style="primaryActionButtonStyle" class="messagePrimaryActionButton">
          <b>{{ primaryActionLabel }}</b>
          <template v-if="showPrimaryActionShortcut">
            <br>
            <small>{{ t('chatMessage.ctrlEnter') }}</small>
          </template>
        </button>
      </div>
      <details ref="detailsRef" @toggle="handleDetailsToggle">
        <summary>
          <small style="color: #888;">{{ t('chatMessage.renderedMarkdown') }}</small>
        </summary>
        <MessageAsTextRender :messageAsText="detailsContent" />
        <hr style="margin-top:0px;color:#ccc">
      </details>
    </div>
    <div style="padding-left:12px;padding-right:12px;">
      <EditableStringAttribute :obj="props.message" attr="description" :disabled="true"
        v-if="props.message['description']" />
      <EditableStringAttribute :obj="props.message" attr="comment" :disabled="false" v-if="props.message['comment']"
        title="comment:&nbsp;&nbsp;&nbsp;" />
    </div>
  </div>
</template>

<script setup>
import MessageRole from './widgets/MessageRole.vue'
import EditableStringAttribute from './widgets/EditableStringAttribute.vue'
import MessageAsTextRender from './widgets/MessageAsTextRender.vue'

import { computed, ref, nextTick, onMounted, onBeforeUnmount, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { convertImageUrlToBase64, deepCopy, mockObject, sleep, TaskQueue } from '../utils/commonUtils.js'
import { Close, Delete, Edit } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { getContentTypes, messageToSeq } from '../utils/chatUtils.js'
import {
  MESSAGE_KEYS_IN_CONTEXT,
  formatContentAsText,
  getMessageOutput,
  parseContentAsText,
  formatMessageAsText,
  parseMessageAsText,
  multimodalChunkObjectToMarkdown,
  replaceMessageContext,
} from '../utils/messageTextCodec.js'
import { useGlobalStore } from '../stores/globalStore.js'

const globalStore = useGlobalStore()
const { t } = useI18n()

const props = defineProps({
  message: {
    type: Object,
    default: {}
  },
  operationCenter: {
    type: [Object, Function],
    default: mockObject
  },
  messageIndex: {
    type: Number,
    default: -1
  },
})
const emit = defineEmits(['sendButton', 'deleteMessage', 'focus', 'blur'])

// supoort both emit event (sample way using by newMessage) and using operationCenter (complex way)
const usingOperators = 'generateNew' in props.operationCenter
const messageCache = ref(null)
const messageAnchorId = computed(() => props.messageIndex >= 0 ? `message-${props.messageIndex + 1}` : '')
const messageAnchorHref = computed(() => messageAnchorId.value ? `#${messageAnchorId.value}` : undefined)

const currentUuid = globalStore.uuid
const PLACEHOLDER = '<|PLACEHOLDER|>'
const detailsContent = ref(PLACEHOLDER)
const messageDraft = ref('')
const isEditorFocused = ref(false)
const messageDraftError = ref('')

const syncDetailsContent = () => {
  if (detailsRef.value?.open) {
    detailsContent.value = messageDraft.value
  } else {
    detailsContent.value = PLACEHOLDER
  }
}

const handleDetailsToggle = () => {
  syncDetailsContent()
}

// avoid update content lead to rerender button and button click event lost
// when user edit content, and then click button right now, what thing happens?
// 1. text area blur event is triggered, add a async task to taskQueue for updating content with a delay
// 2. button click event is triggered, add a async task to taskQueue for updatePromptMessage and generating new message
const DELAY_MS_TO_UPDATE_CONTENT = 600
const taskQueue = new TaskQueue()

const getMessage = () => {
  if (usingOperators) {
    if (!messageCache.value) {
      messageCache.value = deepCopy(props.message)
    }
    return messageCache.value
  } else {
    return props.message
  }
}

const getContent = () => {
  return getMessage()['content'] || ''
}

const messageToolCalls = computed(() => getMessage()['tool_calls'] || [])
const hasToolCalls = computed(() => usingOperators && messageToolCalls.value.length > 0)
const hasClearableMessageContent = computed(() => {
  return Boolean(messageToSeq(getMessageOutput(getMessage()), { includeFinishReason: false }))
})

const setContent = (content) => {
  var message = getMessage()
  message['content'] = content
}

const hasContent = computed(() => {
  return messageDraft.value.length > 0
})
const canRunToolCalls = computed(() => {
  if (!hasToolCalls.value) {
    return false
  }
  return props.operationCenter.toolManageState.checkCallReady(messageToolCalls.value).allReady
})
const isRunPrimaryAction = computed(() => hasToolCalls.value)
const showPrimaryActionButton = computed(() => {
  return isRunPrimaryAction.value || getMessage()['role'] === 'tool' || !isRenderRole.value || isRenderContentEditing.value
})
const primaryActionLabel = computed(() => {
  return isRunPrimaryAction.value ? t('toolCallControl.run') + "▶️" : t('chatMessage.send') + "➡️"
})
const showPrimaryActionShortcut = computed(() => isEditorFocused.value)
const isPrimaryActionDisabled = computed(() => {
  return isRunPrimaryAction.value ? !canRunToolCalls.value : !hasContent.value
})
const messageActionIcon = computed(() => hasClearableMessageContent.value ? Delete : Close)
const messageActionTooltip = computed(() => hasClearableMessageContent.value ? t('chatMessage.clear') : t('chatMessage.delete'))
const primaryActionButtonStyle = computed(() => ({
  cursor: isPrimaryActionDisabled.value ? 'not-allowed' : 'pointer',
  'background-color': isPrimaryActionDisabled.value ? 'rgb(185, 228, 255)' : "lightskyblue",
}))

const showMessageDraftWarning = computed(() => {
  return !isEditorFocused.value && messageDraft.value !== messageAsText.value
})

const messageDraftWarning = computed(() => {
  if (messageDraftError.value) {
    return `${messageDraftError.value} The current message was not updated. Reopen the editor, fix the draft, then blur or send again.`
  }
  return 'The draft differs from the current message. The current message stays unchanged until the draft is parsed successfully.'
})

const isRenderRole = computed(() => ['assistant', 'context', 'tool'].includes(getMessage()['role']))

const isRenderContentEditing = ref(false)

const isRenderContentEditingButton = ref(null)
const messageContentInput = ref(null)

function focusMessageContentInput() {
  nextTick(() => {
    const textarea = messageContentInput.value || document.getElementById(messageAnchorId.value).querySelector('textarea')
    textarea.focus()
  })
}

function getCodecContext() {
  return {
    blobUrlToBase64Cache: globalStore.blobUrlToBase64Cache,
    multimodalPlugins: globalStore.multimodalPlugins,
  }
}

function formatRichContentAsText(content) {
  return formatContentAsText(content, getCodecContext())
}

function parseRichContentAsText(value) {
  return parseContentAsText(value, getCodecContext())
}

function getMessageDelta() {
  const message = getMessage()
  return Object.fromEntries(MESSAGE_KEYS_IN_CONTEXT.map(key => [key, message[key]]))
}

function isMessageContextChanged() {
  return MESSAGE_KEYS_IN_CONTEXT.some(key => {
    return JSON.stringify(messageCache.value?.[key]) !== JSON.stringify(props.message?.[key])
  })
}

const contentAsText = computed({
  // convert object content to markdown
  get() {
    return formatRichContentAsText(getContent())
  },
  set(value) {
    setContent(parseRichContentAsText(value))
  }
})

const messageAsText = computed({
  get() {
    return formatMessageAsText(getMessage(), {
      formatContentAsText: formatRichContentAsText,
    })
  },
  set(value) {
    replaceMessageContext(getMessage(), parseMessageAsText(value, {
      parseContentAsText: parseRichContentAsText,
    }))
  }
})

async function operationCenterUpdatePromptMessage({ delay = false } = {}) {
  try {
    messageAsText.value = messageDraft.value
    messageDraftError.value = ''
  } catch (error) {
    messageDraftError.value = error.message
    ElMessage({
      showClose: true,
      message: error.message,
      type: 'error',
      duration: 10000,
    })
    return false
  }

  if (usingOperators && messageCache.value && isMessageContextChanged()) {
    if (delay) {
      // only delay when update message
      await sleep(DELAY_MS_TO_UPDATE_CONTENT)
    }
    props.operationCenter.updatePromptMessage(getMessageDelta(), props.messageIndex)
  }
  return true
}

function handleToggleRenderContentEditing() {
  isRenderContentEditing.value = !isRenderContentEditing.value
}

function queueDeleteMessageTask({ focusTextareaAfterClear = false } = {}) {
  taskQueue.addTask(async () => await sleep(1))
  // if not sleep, will cause element-plus.js Uncaught (in promise) TypeError: Cannot read properties of null (reading 'offsetHeight')
  taskQueue.addTask(async () => props.operationCenter.clearOrDeleteMessage(getMessage(), props.messageIndex))
  if (focusTextareaAfterClear) {
    taskQueue.addTask(focusMessageContentInput)
  }
}

function handleDeleteMessage() {
  const shouldFocusTextareaAfterClear = hasClearableMessageContent.value && !isRenderRole.value
  if (usingOperators) {
    queueDeleteMessageTask({ focusTextareaAfterClear: shouldFocusTextareaAfterClear })
  } else {
    emit('deleteMessage')
    if (shouldFocusTextareaAfterClear) {
      focusMessageContentInput()
    }
  }
}

function handleEditorFocus() {
  isEditorFocused.value = true
  emit('focus')
}

async function handleEditorBlur() {
  isEditorFocused.value = false
  if (usingOperators) {
    taskQueue.addTask(async () => await operationCenterUpdatePromptMessage({ delay: true }))
  } else if (await operationCenterUpdatePromptMessage()) {
    emit('blur', getMessage())
  }
}

async function handleSend() {
  if (usingOperators) {
    taskQueue.addTask(async () => {
      const updated = await operationCenterUpdatePromptMessage({ delay: false })
      if (updated) {
        props.operationCenter.generateNew({ messageIndex: props.messageIndex })
      }
    })
  } else if (await operationCenterUpdatePromptMessage()) {
    isEditorFocused.value = false
    emit('sendButton')
  }
}

async function handleRunToolCalls() {
  if (!usingOperators) {
    return
  }
  taskQueue.addTask(async () => {
    const updated = await operationCenterUpdatePromptMessage({ delay: false })
    if (updated) {
      await props.operationCenter.runToolCalls({
        messageIndex: props.messageIndex,
      })
    }
  })
}

async function handlePrimaryAction() {
  if (isRunPrimaryAction.value) {
    await handleRunToolCalls()
    return
  }
  await handleSend()
}


function handlePasteMultimodal(event) {
  const clipboardData = event.clipboardData || window.clipboardData;
  const items = clipboardData.items;
  var blobUrls = {}
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    // console.log('clipboardData.items',item, JSON.parse(JSON.stringify([item.type, item.getAsFile(), item.getAsFile()?.type, item.kind,])))
    if (item.type.indexOf("image") !== -1 || item.type.indexOf("audio") !== -1) {
      // console.log('type', item.type) // image/png
      const file = item.getAsFile();
      const blobUrl = URL.createObjectURL(file);
      var chunkType = item.type.split("/")[0] + '_url'
      var chunk = { type: chunkType, [chunkType]: { url: blobUrl } }
      blobUrls[blobUrl] = chunk
    }
  }
  if (Object.keys(blobUrls).length) {
    event.preventDefault();
  }
  return blobUrls
}

async function handlePaste(event) {
  var blobUrls = handlePasteMultimodal(event)
  if (Object.keys(blobUrls).length) {
    for (let blobUrl in blobUrls) {
      globalStore.blobUrlToBase64Cache[blobUrl] = await convertImageUrlToBase64(blobUrl);
    }
    const markdownInsert = Object.keys(blobUrls).map(blobUrl => {
      var chunk = blobUrls[blobUrl]
      if (chunk['type'].indexOf("image") !== -1) {
        return `![<|ON_PANDA_IMAGE|>](${blobUrl})`
      } else if (chunk['type'].indexOf("audio") !== -1) {
        if (chunk?.audio_url?.url && chunk.audio_url.url.startsWith('blob:')) {
          chunk.audio_url.url = globalStore.blobUrlToBase64Cache[chunk.audio_url.url]
        }
        // convert audio_url to input_audio "data:image/png;base64,iVBO...
        var base64Split = chunk.audio_url.url.split(';base64,')
        var format = base64Split[0].split('/')[1]
        if (["mp3", "wav"].includes(format)) {  // input_audio of vLLM only support those formats, and gpt-4o-audio-preview only support input_audio
          chunk = { type: 'input_audio', input_audio: { data: base64Split[1], format: format } }
        }
        return '<|ON_PANDA_OBJECT_START|>' + multimodalChunkObjectToMarkdown(chunk, getCodecContext()) + '<|ON_PANDA_OBJECT_END|>'
      }
    }).join('\n')
    const cursorPosition = event.target.selectionStart
    const currentValue = messageDraft.value
    messageDraft.value = currentValue.slice(0, cursorPosition) +
      markdownInsert +
      currentValue.slice(cursorPosition)
  }
}

const detailsRef = ref(null)

watch(messageAsText, (value) => {
  if (!isEditorFocused.value) {
    messageDraft.value = value
  }
  if (messageDraft.value === value) {
    messageDraftError.value = ''
  }
})

watch(messageDraft, () => {
  if (detailsRef.value?.open) {
    detailsContent.value = messageDraft.value
  }
})

watchEffect(() => {
  // auto open details when none text detected
  var content = getContent()
  var types = getContentTypes(content)
  for (let type of types) {
    if (type.startsWith('image') || globalStore.multimodalPlugins[type]) {
      setTimeout(() => {
        if (detailsRef.value) {
          detailsRef.value.open = true
          syncDetailsContent()
        }
      }, 100)
      break
    }
  }
})

const handleRenderContent = () => {
  if (isRenderContentEditingButton.value) {
    isRenderContentEditingButton.value.ref.classList.remove('shake-button')
    setTimeout(() => {
      isRenderContentEditingButton.value.ref.classList.add('shake-button')
    }, 100)
  }
}

onMounted(() => {
  // to avoid details open status lost when rerender
  // special for after edit content, details open status will lost
  if (detailsRef.value) {
    const detailsOpen = globalStore.messageIndexStatus[props.messageIndex]?.detailsOpen
    if (detailsOpen == true) {
      detailsRef.value.open = true
    } else if (detailsOpen == false) {
      detailsRef.value.open = false
    }
  }
  messageDraft.value = messageAsText.value
  syncDetailsContent()
})

onBeforeUnmount(() => {
  if (detailsRef.value && currentUuid.value === globalStore.uuid) {
    // set details open status
    globalStore.messageIndexStatus[props.messageIndex] = globalStore.messageIndexStatus[props.messageIndex] || {}
    globalStore.messageIndexStatus[props.messageIndex].detailsOpen = detailsRef.value.open
  }
})

</script>
<style scoped>
@media (max-width: 600px) {
  .message-content {
    font-size: 16px;
  }
}

.massageOperationButton {

  width: 24px;
  height: 15px;
  margin-top: 13px;
}

.messagePrimaryActionRow {
  display: flex;
  justify-content: space-between;
}

.messagePrimaryActionContent {
  flex: 1;
  min-width: 0;
}

.messagePrimaryActionButton {
  min-width: 59px;
  margin-left: 5px;
  color: #fff;
  padding: 5px;
  font-size: 0.75em;
  border-radius: 7px;
  border: 1px solid #dcdfe6;
}

.messageRenderContent {
  margin-top: 0px;
  margin-bottom: 0px;
  color: #555;
  border-radius: 5px;
  border: 1px solid #dcdfe6;
  padding: 7px;
  box-sizing: border-box;
  line-height: 1.5;
  min-height: calc(3em + 16px);
  max-height: calc(75em + 16px);
  overflow-y: auto;
}

.messageDraftWarning {
  margin-top: 6px;
  margin-bottom: 8px;
  padding: 8px 10px;
  color: #b42318;
  background: #fef3f2;
  border: 1px solid #fecdca;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  white-space: pre-wrap;
}


.shake-button {
  animation: shake 1s;
}

@keyframes shake {

  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }

  10% {
    transform: translate(-9px, -2px) scale(2);
  }

  20% {
    transform: translate(7px, 5px) scale(2);
  }

  30% {
    transform: translate(-5px, -8px) scale(2);
  }

  40% {
    transform: translate(4px, 6px) scale(2);
  }

  50% {
    transform: translate(-4px, -4px) scale(2);
  }

  60% {
    transform: translate(-6px, 8px) scale(2);
  }

  70% {
    transform: translate(9px, -6px) scale(2);
  }

  80% {
    transform: translate(7px, 3px) scale(2);
  }

  90% {
    transform: translate(-2px, -6px) scale(2);
  }
}
</style>
