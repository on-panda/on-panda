<template>
  <div class="message" :id="messageAnchorId || null" style="max-width: 1024px;">
    <div style="display :flex;">
      <MessageRole :message="props.message" />
      <span class="stretch" style="margin-right: auto" />
      <div>
        <el-button ref="isRenderContentEditingButton" v-if="isRenderRole" :icon="Edit" size="small"
          class="massageOperationButton" @click="isRenderContentEditing = !isRenderContentEditing"
          :type="isRenderContentEditing ? 'primary' : ''"></el-button>
        <el-tooltip :content="hasContent ? t('chatMessage.clear') : t('chatMessage.delete')" placement="top">
          <el-button :icon="hasContent ? Delete : Close" size="small" class="massageOperationButton"
            style="margin-right: 5px;" @click="async () => {
              if (usingOperators) {
                taskQueue.addTask(async () => await sleep(1))
                // if not sleep, will cause element-plus.js Uncaught (in promise) TypeError: Cannot read properties of null (reading 'offsetHeight')
                taskQueue.addTask(async () => props.operationCenter.clearOrDeleteMessage(messageCache, props.messageIndex))
              } else { $emit('deleteMessage') }
            }
            " />
        </el-tooltip>
      </div>
      <a v-if="props.messageIndex >= 0" :href="messageAnchorHref" style="color: #888; margin-top: 12px;font-size: 15px; text-decoration: none;">&nbsp;#{{
        props.messageIndex + 1 }}</a>
    </div>
    <div v-if="showMessageDraftWarning" class="messageDraftWarning">
      {{ messageDraftWarning }}
    </div>
    <p v-if="(isRenderRole && !isRenderContentEditing)"
      style="margin-top: 5px;margin-bottom: 0px;color: #555; border-radius: 5px; box-shadow: 0 0 0 1px var(--el-input-border-color,var(--el-border-color)) inset; padding:5px 11px">
      <MultimodalRender :content="messageAsText" @dblclick="handleRenderContent" />
    </p>
    <div v-else class="editorAndDetails">
      <div style="display: flex; justify-content: space-between">
        <el-input class="message-content" v-model="messageDraft" type="textarea"
          :placeholder="t('chatMessage.emptyMessageIgnored')" :autosize="{ minRows: 2, maxRows: 50 }"
          @keydown.ctrl.enter="handleSend" @paste="handlePaste" @focus="handleEditorFocus"
          @blur="handleEditorBlur"
          ref="editor" />

        <button
          @click="handleSend"
          :disabled="!hasContent" :style="{
            cursor: hasContent ? 'pointer' : 'not-allowed'
          }" style="margin-left: 5px; background-color: lightskyblue; color:#fff; padding: 8px; border-radius: 7px;">
          <b>{{ t('chatMessage.send') }}</b><br>
          <small>{{ t('chatMessage.ctrlEnter') }}</small> </button>
      </div>
      <details ref="detailsRef" @toggle="handleDetailsToggle">
        <summary>
          <small style="color: #888;">{{ t('chatMessage.renderedMarkdown') }}</small>
        </summary>
        <MultimodalRender :content="detailsContent" />
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
import MultimodalRender from './widgets/MultimodalRender.vue'

import { computed, ref, onMounted, onBeforeUnmount, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { convertImageUrlToBase64, base64ToBlob, deepCopy, mockObject, sleep, TaskQueue } from '../utils/commonUtils.js'
import { Close, Delete, Edit } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import JSON5 from 'json5'
import { getContentTypes, MESSAGE_CONTEXT_SECTION_MARKERS, MESSAGE_KEYS_IN_CONTEXT, MESSAGE_META_KEYS } from '../utils/chatUtils'
import { useGlobalStore } from '../stores/globalStore.js'
import { multimodalChunkStringToObject, multimodalChunkObjectToBase64 } from '../utils/multimodalUtils.js'

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
const emit = defineEmits(['sendButton', 'deleteMessage', 'focus', 'blur',])

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
const DELAY_MS_TO_UPDATE_CONTENT = 200
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

const setContent = (content) => {
  var message = getMessage()
  message['content'] = content
}

const hasContent = computed(() => {
  return messageDraft.value.length > 0
})

const showMessageDraftWarning = computed(() => {
  return !isEditorFocused.value && messageDraft.value !== messageAsText.value
})

const messageDraftWarning = computed(() => {
  if (messageDraftError.value) {
    return `${messageDraftError.value} The current message was not updated. Reopen the editor, fix the draft, then blur or send again.`
  }
  return 'The draft differs from the current message. The current message stays unchanged until the draft is parsed successfully.'
})

const isRenderRole = computed(() => ['assistant', 'context'].includes(getMessage()['role']))

const isRenderContentEditing = ref(false)

const isRenderContentEditingButton = ref(null)

function multimodalChunkObjectToMarkdown(chunk) {
  var type = chunk['type']
  if (!globalStore.blobUrlToBase64Cache[type]) {
    globalStore.blobUrlToBase64Cache[type] = {}
  }

  var hashToObjectString = globalStore.blobUrlToBase64Cache[type]
  var hash = JSON.stringify(chunk[type])
  if (!(hash in hashToObjectString)) {
    var typeNumInCache = Object.keys(hashToObjectString).length
    var cacheIndex = `${type}_${typeNumInCache + 1}`
    var base64Object = multimodalChunkObjectToBase64(chunk)
    if (base64Object) {
      globalStore.blobUrlToBase64Cache[base64Object.blob_url] = base64Object.base64_url
    }
    var blob_url = base64Object?.blob_url || "NotImplemented"
    globalStore.blobUrlToBase64Cache[cacheIndex] = chunk
    var objectString = `[${cacheIndex}](${blob_url})`
    hashToObjectString[hash] = objectString
  }
  return hashToObjectString[hash]
}

function formatContentAsText(content) {
  if (typeof content === 'string') {
    return content
  }
  var str = ''
  // if is list, VLM message, convert to markdown
  if (Array.isArray(content)) {
    for (let i = 0; i < content.length; i++) {
      const chunk = content[i]
      if (chunk['type'] === 'text') {
        str += chunk['text']
      } else if (chunk['type'] === 'image_url') {
        var imageUrlShow = chunk['image_url']['url']
        if (chunk['image_url']['url'].startsWith('data:')) { // base64
          if (!globalStore.blobUrlToBase64Cache[chunk['blob_url']]) {
            chunk['blob_url'] = base64ToBlob(chunk['image_url']['url'])
            globalStore.blobUrlToBase64Cache[chunk['blob_url']] = chunk['image_url']['url']
          }
          imageUrlShow = chunk['blob_url']
        }
        str += `![<|ON_PANDA_IMAGE|>](${imageUrlShow})`
      } else if (Object.keys(globalStore.multimodalPlugins).includes(chunk['type'])) {
        str += '<|ON_PANDA_OBJECT_START|>' + multimodalChunkObjectToMarkdown(chunk) + '<|ON_PANDA_OBJECT_END|>'
      } else {
        str += '<|ON_PANDA_OBJECT_START|>' + JSON.stringify(chunk) + '<|ON_PANDA_OBJECT_END|>'
      }
    }
  }
  return str
}

function parseContentAsText(value) {
  // Check if the value contains special markers
  if (value.includes('![<|ON_PANDA_IMAGE|>](') || value.includes('<|ON_PANDA_OBJECT_START|>')) {
    const content = [];
    const regex = /(<\|ON_PANDA_OBJECT_START\|>(.*?)<\|ON_PANDA_OBJECT_END\|>)|(!\[<\|ON_PANDA_IMAGE\|>\]\((.*?)\))/gs;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(value)) !== null) {
      // Add any text before the matched special marker
      if (match.index > lastIndex) {
        const textSegment = value.substring(lastIndex, match.index)
        content.push({ type: 'text', text: textSegment });
      }

      if (match[1]) {
        // Matched an ON_PANDA_OBJECT
        const objStr = match[2];
        const obj = multimodalChunkStringToObject(objStr, globalStore.blobUrlToBase64Cache)
        content.push(obj)
      } else if (match[3]) {
        // Matched an ON_PANDA_IMAGE
        var imageUrl = match[4];
        const image = { type: 'image_url', image_url: { url: imageUrl } }
        if (imageUrl.startsWith('blob:')) {
          image.blob_url = imageUrl
          image.image_url.url = globalStore.blobUrlToBase64Cache[imageUrl]
          console.assert(image.image_url.url, 'blobUrl not found in globalStore.blobUrlToBase64Cache')
        }
        content.push(image);
      }

      lastIndex = regex.lastIndex;
    }

    // Add any remaining text after the last special marker
    if (lastIndex < value.length) {
      const remainingText = value.substring(lastIndex);
      content.push({ type: 'text', text: remainingText });
    }

    return content
  }
  // If no special markers, treat the value as a simple string
  return value
}

function serializeMessageSection(marker, text, { isJson = false } = {}) {
  if (!text) {
    return ''
  }
  if (isJson) {
    return `### ${marker}\n\`\`\`JavaScript\n${text}\n\`\`\``
  }
  return `### ${marker}\n${text}`
}

function splitMessageSections(value) {
  const sectionHeaderRegex = /^###\s+(<\|ON_PANDA_[A-Z_]+\|>)\s*$/gm
  const matches = Array.from(value.matchAll(sectionHeaderRegex))
  if (!matches.length) {
    return null
  }

  const knownMarkers = Object.values(MESSAGE_CONTEXT_SECTION_MARKERS)
  const sections = {}
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]
    const marker = match[1]
    if (!knownMarkers.includes(marker)) {
      throw new Error(`Unsupported message section: ${marker}`)
    }
    if (sections[marker] != null) {
      throw new Error(`Duplicated message section: ${marker}`)
    }
    let contentStart = match.index + match[0].length
    if (value.startsWith('\r\n', contentStart)) {
      contentStart += 2
    } else if (value[contentStart] === '\n') {
      contentStart += 1
    }

    let contentEnd = i + 1 < matches.length ? matches[i + 1].index : value.length
    if (i + 1 < matches.length) {
      if (value.slice(contentEnd - 2, contentEnd) === '\r\n') {
        contentEnd -= 2
      } else if (value[contentEnd - 1] === '\n') {
        contentEnd -= 1
      }
    }
    sections[marker] = value.slice(contentStart, contentEnd)
  }
  return sections
}

function stripJsonCodeFence(value) {
  const trimmed = value.trim()
  const matched = trimmed.match(/^```(?:javascript|js|json)?\s*\n([\s\S]*?)\n```$/i)
  return matched ? matched[1] : trimmed
}

function formatJsonSectionParseError(sectionMarker, error) {
  return `${sectionMarker} should be JSON. JSON5 parse error: ${error.message}`
}

function parseJsonSection(sectionMarker, value) {
  try {
    return JSON5.parse(stripJsonCodeFence(value))
  } catch (error) {
    throw new Error(formatJsonSectionParseError(sectionMarker, error))
  }
}

function replaceMessageContext(message, messageDelta) {
  for (const key of MESSAGE_KEYS_IN_CONTEXT) {
    delete message[key]
  }
  for (const key of MESSAGE_KEYS_IN_CONTEXT) {
    const value = messageDelta[key]
    if (value == null) {
      continue
    }
    if (key !== 'content' && value === '') {
      continue
    }
    if (Array.isArray(value) && value.length === 0) {
      continue
    }
    message[key] = value
  }
  if (!('content' in message)) {
    message.content = ''
  }
}

function parseMessageAsText(value) {
  const nextMessage = Object.fromEntries(MESSAGE_KEYS_IN_CONTEXT.map(key => [key, undefined]))
  const sections = splitMessageSections(value)

  if (!sections) {
    nextMessage.content = parseContentAsText(value)
    return nextMessage
  }

  if (MESSAGE_CONTEXT_SECTION_MARKERS.message_meta in sections) {
    const messageMeta = parseJsonSection(
      MESSAGE_CONTEXT_SECTION_MARKERS.message_meta,
      sections[MESSAGE_CONTEXT_SECTION_MARKERS.message_meta],
    )
    if (Array.isArray(messageMeta) || typeof messageMeta !== 'object' || messageMeta == null) {
      throw new Error(`${MESSAGE_CONTEXT_SECTION_MARKERS.message_meta} should be a JSON object.`)
    }
    const unsupportedKeys = Object.keys(messageMeta).filter(key => !MESSAGE_META_KEYS.includes(key))
    if (unsupportedKeys.length > 0) {
      throw new Error(`Unsupported keys in MESSAGE_META: ${unsupportedKeys.join(', ')}`)
    }
    for (const key of MESSAGE_META_KEYS) {
      if (messageMeta[key]) {
        nextMessage[key] = messageMeta[key]
      }
    }
  }

  if (MESSAGE_CONTEXT_SECTION_MARKERS.reasoning in sections) {
    const reasoning = sections[MESSAGE_CONTEXT_SECTION_MARKERS.reasoning]
    if (reasoning) {
      nextMessage.reasoning = reasoning
    }
  }

  if (MESSAGE_CONTEXT_SECTION_MARKERS.content in sections) {
    nextMessage.content = parseContentAsText(sections[MESSAGE_CONTEXT_SECTION_MARKERS.content])
  }

  if (MESSAGE_CONTEXT_SECTION_MARKERS.tool_calls in sections) {
    const toolCalls = parseJsonSection(
      MESSAGE_CONTEXT_SECTION_MARKERS.tool_calls,
      sections[MESSAGE_CONTEXT_SECTION_MARKERS.tool_calls],
    )
    if (!Array.isArray(toolCalls)) {
      throw new Error(`${MESSAGE_CONTEXT_SECTION_MARKERS.tool_calls} should be a JSON array.`)
    }
    if (toolCalls.length > 0) {
      nextMessage.tool_calls = toolCalls
    }
  }

  return nextMessage
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
    return formatContentAsText(getContent())
  },
  set(value) {
    setContent(parseContentAsText(value))
  }
})

const messageAsText = computed({
  get() {
    const message = getMessage()
    const sections = []

    const messageMeta = {}
    for (const key of MESSAGE_META_KEYS) {
      if (message[key]) {
        messageMeta[key] = message[key]
      }
    }
    if (Object.keys(messageMeta).length > 0) {
      sections.push({
        key: 'message_meta',
        text: serializeMessageSection(
          MESSAGE_CONTEXT_SECTION_MARKERS.message_meta,
          JSON.stringify(messageMeta, null, 2),
          { isJson: true },
        )
      })
    }

    if (message.reasoning) {
      sections.push({
        key: 'reasoning',
        text: serializeMessageSection(MESSAGE_CONTEXT_SECTION_MARKERS.reasoning, message.reasoning),
      })
    }

    const contentText = contentAsText.value
    if (contentText) {
      sections.push({
        key: 'content',
        text: serializeMessageSection(MESSAGE_CONTEXT_SECTION_MARKERS.content, contentText),
        rawText: contentText,
      })
    }

    if (message.tool_calls?.length) {
      sections.push({
        key: 'tool_calls',
        text: serializeMessageSection(
          MESSAGE_CONTEXT_SECTION_MARKERS.tool_calls,
          JSON.stringify(message.tool_calls, null, 2),
          { isJson: true },
        )
      })
    }

    if (sections.length === 1 && sections[0].key === 'content') {
      return sections[0].rawText
    }
    return sections.map(section => section.text).filter(Boolean).join('\n')
  },
  set(value) {
    replaceMessageContext(getMessage(), parseMessageAsText(value))
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
    emit('sendButton')
  }
}


const editor = ref(null)
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
        return '<|ON_PANDA_OBJECT_START|>' + multimodalChunkObjectToMarkdown(chunk) + '<|ON_PANDA_OBJECT_END|>'
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
