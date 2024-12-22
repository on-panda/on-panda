<template>
  <div class="message" style="max-width: 1024px;">
    <div style="display :flex;">
      <MessageRole :message="props.message" />
      <span class="stretch" style="margin-right: auto" />
      <el-tooltip :content="hasContent ? 'Clear' : 'Delete'" placement="top">
        <el-button :icon="hasContent ? Delete : Close" size="small"
          style="width: 24px;height: 15px; margin-top: 13px; margin-right: 5px;" @click="async () => {
            if (usingOpreators) {
              taskQueue.addTask(async () => await sleep(1))
              // if not sleep, will cause element-plus.js Uncaught (in promise) TypeError: Cannot read properties of null (reading 'offsetHeight')
              taskQueue.addTask(async () => props.opreators.clearOrDeleteMessage(messageCache, props.index))
            } else { $emit('deleteMessage') }
          }
            " />
      </el-tooltip>
    </div>
    <div style="display: flex; justify-content: space-between">
      <el-input class="message-content" v-model="contentAsText" type="textarea"
        placeholder="Empty message will be ignored" :autosize="{ minRows: 2, maxRows: 50 }" @keydown.ctrl.enter="() => {
          if (usingOpreators) {
            taskQueue.addTask(async () => opreatorsUpdatePromptContent({ delay: false }))
            taskQueue.addTask(props.opreators.newGenerate)
          } else {
            $emit('sendButton')
          }
        }" @paste="handlePaste" @focus="$emit('focus')"
        @blur="usingOpreators ? taskQueue.addTask(async () => opreatorsUpdatePromptContent({ delay: true })) : $emit('blur', getContent())"
        ref="editor" />

      <button @click="$emit('sendButton'); taskQueue.addTask(props.opreators.newGenerate)" :disabled="!hasContent"
        :style="{
          cursor: hasContent ? 'pointer' : 'not-allowed'
        }" style="margin-left: 5px; background-color: lightskyblue; color:#fff; padding: 8px; border-radius: 7px;">
        <b>Send➡️</b><br>
        <small>ctrl+enter</small> </button>
    </div>
    <div style="padding-left:12px;padding-right:12px;">
      <EditableStringAttribute :obj="props.message" attr="description" :disabled="true"
        v-if="props.message['description']" />
      <EditableStringAttribute :obj="props.message" attr="comment" :disabled="false" v-if="props.message['comment']"
        title="comment:&nbsp;&nbsp;&nbsp;" />
    </div>
    <details>
      <summary>
        <small style="color: #888;">rendered markdown:</small>
      </summary>
      <MessageMarkdown :content="contentAsText" />
      <hr style="margin-top:0px;color:#ccc">
    </details>
  </div>
</template>

<script setup>
import MessageRole from './MessageRole.vue'
import MessageMarkdown from './MessageMarkdown.vue'
import EditableStringAttribute from './EditableStringAttribute.vue'

import { computed, ref } from 'vue'
import { convertImageUrlToBase64, deepCopy, mockObject, sleep, TaskQueue } from '@/utils/commonUtils'
import { Close, Delete } from '@element-plus/icons-vue'

const props = defineProps({
  message: {
    type: Object,
    default: {}
  },
  opreators: {
    type: [Object, Function],
    default: mockObject
  },
  index: {
    type: Number,
    default: -1
  },
})
const emit = defineEmits(['sendButton', 'deleteMessage', 'focus', 'blur',])

// supoort both emit event (sample way using by newMessage) and using opreators (complex way)
const usingOpreators = 'newGenerate' in props.opreators
const messageCache = ref(null)
const DELAY_MS_TO_UPDATE_CONTENT = 200  // avoid update content lead to rerender button and button click event lost
const taskQueue = new TaskQueue()

async function opreatorsUpdatePromptContent({ delay = false }) {
  if (usingOpreators && messageCache.value) {
    // only update if content changed
    if (JSON.stringify(messageCache.value['content']) !== JSON.stringify(props.message['content'])) {
      if (delay) {
        // only delay when update content
        await sleep(DELAY_MS_TO_UPDATE_CONTENT)
      }
      props.opreators.updatePromptContent(getContent(), props.index)
    }
  }
}

const getContent = () => {
  if (usingOpreators) {
    if (!messageCache.value) {
      messageCache.value = deepCopy(props.message)
    }
    return messageCache.value['content']
  } else {
    return props.message['content']
  }
}

const setContent = (content) => {
  if (usingOpreators) {
    messageCache.value['content'] = content
  } else {
    props.message['content'] = content
  }
}

const hasContent = computed(() => {
  return getContent().length > 0
})


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
          if (chunk['blobUrl']) {
            imageUrlShow = chunk['blobUrl']
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
            image.blobUrl = imageUrl
            image.image_url.url = ImageUrlToBase64Cache[imageUrl]
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
const imageCache = []
const ImageUrlToBase64Cache = {}
async function handlePaste(event) {
  const clipboardData = event.clipboardData || window.clipboardData;
  const items = clipboardData.items;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    // console.log('clipboardData.items',item, JSON.parse(JSON.stringify([item.type, item.getAsFile(), item.getAsFile()?.type, item.kind,])))
    if (item.type.indexOf("image") !== -1) {
      event.preventDefault();
      const file = item.getAsFile();
      const imageUrl = cacheImage(file);
      ImageUrlToBase64Cache[imageUrl] = await convertImageUrlToBase64(imageUrl);
      insertImage(imageUrl);
    }
  }
}
function cacheImage(file) {
  const imageUrl = URL.createObjectURL(file);
  imageCache.push({ file, url: imageUrl });
  return imageUrl;
}
function insertImage(imageUrl) {
  if (imageUrl) {
    const markdownImage = `![<|ON_PANDA_IMAGE|>](${imageUrl})`;
    contentAsText.value += markdownImage;
  }
}

</script>
<style scoped>
@media (max-width: 600px) {
  .message-content {
    font-size: 16px;
  }
}
</style>