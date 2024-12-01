<template>
  <div class="message" style="max-width: 1024px;">
    <div style="display :flex;">
      <MessageRole :message="props.message" />
      <span class="stretch" style="margin-right: auto" />
      <el-tooltip :content="props.message['content'] ? 'Clear' : 'Delete'" placement="top">
        <el-button :icon="props.message['content'] ? Delete : Close" size="small"
          style="width: 24px;height: 15px; margin-top: 13px; margin-right: 5px;"
          @click="props.message['content'] ? (props.message['content'] = '') : $emit('deleteMessage')" />
      </el-tooltip>
    </div>
    <div style="display: flex; justify-content: space-between">
      <el-input class="message-content" v-model="contentAsText" type="textarea"
        placeholder="Empty message will be ignored" :autosize="{ minRows: 2, maxRows: 50 }"
        @keydown.ctrl.enter="$emit('sendButton')" @paste="handlePaste" ref="editor" />

      <button @click="$emit('sendButton')" :disabled="!props.message['content']" :style="{
        cursor: props.message['content'] ? 'pointer' : 'not-allowed'
      }" style="margin-left: 5px; background-color: lightskyblue; color:#fff; padding: 8px; border-radius: 7px;">
        <b>Send➡️</b><br>
        <small>ctrl+enter</small> </button>
    </div>
    <editableStringAttribute title="description: " :content="props.message['description']" :editable="false"
      v-if="props.message['description']" />
    <editableStringAttribute title="comment: &nbsp;&nbsp;&nbsp;&nbsp;" :content="props.message['comment']"
      :editable="true" v-if="props.message['comment']" />
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
import editableStringAttribute from './editableStringAttribute.vue'

import { Close, Delete } from '@element-plus/icons-vue'
import { computed, ref } from 'vue'
import { convertImageUrlToBase64 } from '@/utils/commonUtils'
const props = defineProps({
  message: {
    type: Object,
    default: {}
  },
})


const contentAsText = computed({
  get() {
    const content = props.message['content']
    if (typeof content === 'string') {
      return content
    }
    var str = ''
    // if is list, VLM message, convert to markdown
    if (Array.isArray(content)) {
      for (let i = 0; i < content.length; i++) {
        const item = content[i]
        if (item['type'] === 'text') {
          str += item['text']
        } else if (item['type'] === 'image_url') {
          var imageUrlShow = item['image_url']['url']
          if (item['blobUrl']) {
            imageUrlShow = item['blobUrl']
          }
          str += `![<|ON_PANDA_IMAGE|>](${imageUrlShow})`
        } else {
          str += '<|ON_PANDA_OBJECT_START|>' + JSON.stringify(item) + '<|ON_PANDA_OBJECT_END|>'
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

      props.message['content'] = content;
    } else {
      // If no special markers, treat the value as a simple string
      props.message['content'] = value;
    }
  }

})


const emit = defineEmits(['sendButton', 'deleteMessage'])


const editor = ref(null)
const imageCache = []
const ImageUrlToBase64Cache = {}
async function handlePaste(event) {
  const clipboardData = event.clipboardData || window.clipboardData;
  const items = clipboardData.items;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.indexOf("image") !== -1) {
      event.preventDefault(); // 阻止默认粘贴行为
      const file = item.getAsFile();

      // 将图像缓存在内存中，并生成 URL
      const imageUrl = cacheImage(file);

      ImageUrlToBase64Cache[imageUrl] = await convertImageUrlToBase64(imageUrl);
      // 插入到编辑器中
      insertImage(imageUrl);
    }
  }
}
function cacheImage(file) {
  // 将文件转换为 Blob URL 并存入缓存
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