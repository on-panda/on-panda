<template>
  <div class="message" style="max-width: 1024px;">
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
                taskQueue.addTask(async () => props.operationCenter.clearOrDeleteMessage(messageCache, props.index))
              } else { $emit('deleteMessage') }
            }
              " />
        </el-tooltip>
      </div>
    </div>
    <p v-if="(isRenderRole && !isRenderContentEditing)"
      style="margin-top: 5px;margin-bottom: 0px;color: #555; border-radius: 5px; box-shadow: 0 0 0 1px var(--el-input-border-color,var(--el-border-color)) inset; padding:5px 11px">
      <MarkdownRender :content="contentAsText" @dblclick="handleRenderContent" />
    </p>
    <div v-else class="editorAndDetails">
      <div style="display: flex; justify-content: space-between">
        <el-input class="message-content" v-model="contentAsText" type="textarea"
          :placeholder="t('chatMessage.emptyMessageIgnored')" :autosize="{ minRows: 2, maxRows: 50 }" @keydown.ctrl.enter="() => {
            if (usingOperators) {
              taskQueue.addTask(async () => operationCenterUpdatePromptContent({ delay: false }))
              taskQueue.addTask(props.operationCenter.generateNew)
            } else {
              $emit('sendButton')
            }
          }" @paste="handlePaste" @focus="$emit('focus')"
          @blur="usingOperators ? taskQueue.addTask(async () => operationCenterUpdatePromptContent({ delay: true })) : $emit('blur', getContent())"
          ref="editor" />

        <button @click="$emit('sendButton'); taskQueue.addTask(props.operationCenter.generateNew)" :disabled="!hasContent"
          :style="{
            cursor: hasContent ? 'pointer' : 'not-allowed'
          }" style="margin-left: 5px; background-color: lightskyblue; color:#fff; padding: 8px; border-radius: 7px;">
          <b>{{ t('chatMessage.send') }}</b><br>
          <small>{{ t('chatMessage.ctrlEnter') }}</small> </button>
      </div>
      <details ref="detailsRef">
        <summary>
          <small style="color: #888;">{{ t('chatMessage.renderedMarkdown') }}</small>
        </summary>
        <MarkdownRender :content="contentAsText" />
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
import MarkdownRender from './widgets/MarkdownRender.vue'
import EditableStringAttribute from './EditableStringAttribute.vue'
import MarkdownResponse from './widgets/MarkdownResponse.vue'

import { computed, ref, onMounted, onBeforeUnmount, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { convertImageUrlToBase64, base64ToBlob, deepCopy, mockObject, sleep, TaskQueue } from '@/utils/commonUtils'
import { Close, Delete, Edit } from '@element-plus/icons-vue'
import { getContentTypes } from '@/utils/chatUtils'
import { useGlobalStore } from '@/stores/globalStore.js'

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
  index: {
    type: Number,
    default: -1
  },
})
const emit = defineEmits(['sendButton', 'deleteMessage', 'focus', 'blur',])

// supoort both emit event (sample way using by newMessage) and using operationCenter (complex way)
const usingOperators = 'generateNew' in props.operationCenter
const messageCache = ref(null)
const DELAY_MS_TO_UPDATE_CONTENT = 200  // avoid update content lead to rerender button and button click event lost
const taskQueue = new TaskQueue()

async function operationCenterUpdatePromptContent({ delay = false }) {
  if (usingOperators && messageCache.value) {
    // only update if content changed
    if (JSON.stringify(messageCache.value['content']) !== JSON.stringify(props.message['content'])) {
      if (delay) {
        // only delay when update content
        await sleep(DELAY_MS_TO_UPDATE_CONTENT)
      }
      props.operationCenter.updatePromptContent(getContent(), props.index)
    }
  }
}

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
  return getContent().length > 0
})

const isRenderRole = computed(() => ['assistant', 'context'].includes(getMessage()['role']))

const isRenderContentEditing = ref(false)

const isRenderContentEditingButton = ref(null)

const contentAsText = computed({
  // convert object content to markdown
  get() {
    const content = getContent()
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
        } else {
          str += '<|ON_PANDA_OBJECT_START|>' + JSON.stringify(chunk) + '<|ON_PANDA_OBJECT_END|>'
        }
      }
    }
    return str
  },
  set(value) {
    // Check if the value contains special markers
    if (value.includes('![<|ON_PANDA_IMAGE|>](') || value.includes('<|ON_PANDA_OBJECT_START|>')) {
      const content = [];
      const regex = /(<\|ON_PANDA_OBJECT_START\|>(.*?)<\|ON_PANDA_OBJECT_END\|>)|(!\[<\|ON_PANDA_IMAGE\|>\]\((.*?)\))/gs;
      let lastIndex = 0;
      let match;

      while ((match = regex.exec(value)) !== null) {
        // Add any text before the matched special marker
        if (match.index > lastIndex) {
          const textSegment = value.substring(lastIndex, match.index);
          content.push({ type: 'text', text: textSegment });
        }

        if (match[1]) {
          // Matched an ON_PANDA_OBJECT
          const objStr = match[2];
          try {
            const obj = JSON.parse(objStr);
            content.push(obj);
          } catch (e) {
            console.error('Failed to parse JSON object:', e);
          }
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

      setContent(content)
    } else {
      // If no special markers, treat the value as a simple string
      setContent(value)
    }
  }
})


const editor = ref(null)
function handlePasteImages(event) {
  const clipboardData = event.clipboardData || window.clipboardData;
  const items = clipboardData.items;
  var blobUrls = {}
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    // console.log('clipboardData.items',item, JSON.parse(JSON.stringify([item.type, item.getAsFile(), item.getAsFile()?.type, item.kind,])))
    if (item.type.indexOf("image") !== -1) {
      const file = item.getAsFile();
      const blobUrl = URL.createObjectURL(file);
      blobUrls[blobUrl] = file
    }
  }
  if (Object.keys(blobUrls).length) {
    event.preventDefault();
  }
  return blobUrls
}

async function handlePaste(event) {
  var blobUrls = handlePasteImages(event)
  if (Object.keys(blobUrls).length) {
    for (let blobUrl in blobUrls) {
      globalStore.blobUrlToBase64Cache[blobUrl] = await convertImageUrlToBase64(blobUrl);
    }
    const markdownImage = Object.keys(blobUrls).map(blobUrl => `![<|ON_PANDA_IMAGE|>](${blobUrl})`).join('\n')
    const cursorPosition = event.target.selectionStart
    const currentValue = contentAsText.value
    contentAsText.value = currentValue.slice(0, cursorPosition) +
      markdownImage +
      currentValue.slice(cursorPosition)
  }
}

const detailsRef = ref(null)

watchEffect(() => {
  // auto open details when image detected
  var content = getContent()
  var types = getContentTypes(content)
  for (let type of types) {
    if (type.startsWith('image')) {
      setTimeout(() => {
        if (detailsRef.value) {
          detailsRef.value.open = true
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
    const detailsOpen = globalStore.messageIndexStatus[props.index]?.detailsOpen
    if (detailsOpen == true) {
      detailsRef.value.open = true
    } else if (detailsOpen == false) {
      detailsRef.value.open = false
    }
  }
})

onBeforeUnmount(() => {
  if (detailsRef.value) {
    // set details open status
    globalStore.messageIndexStatus[props.index] = globalStore.messageIndexStatus[props.index] || {}
    globalStore.messageIndexStatus[props.index].detailsOpen = detailsRef.value.open
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