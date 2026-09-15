<script setup>
import { ref } from 'vue'
import {
  Message,
  OnPandaResponsePanel,
  OnPandaResponseText,
  ResponseStateClosure,
} from '@on-panda/on-panda'

import { testApiConfig } from './testApiConfig.js'

const messages = ref([
  {
    role: 'system',
    content: 'You are a helpful assistant.',
  },
  {
    role: 'user',
    content: 'Tell a joke about robot, around 50 words long.',
  },
])

const apiConfig = ref(testApiConfig)
const responseState = ResponseStateClosure({ messages, apiConfig })
</script>

<template>
  <p>
    This example creates the response state directly, then passes it to the text and panel components.
  </p>
  <el-button type="primary" @click="responseState.operationCenter.generateNew()">
    Generate response
  </el-button>

  <h3>Messages</h3>
  <Message v-for="(message, index) in messages" :key="index" :message="message" />

  <h3>OnPandaResponseText</h3>
  <OnPandaResponseText :responseState="responseState" />

  <h3>OnPandaResponsePanel</h3>
  <OnPandaResponsePanel :responseState="responseState" />

  <h3>Final message</h3>
  <pre>{{ responseState.finalMessage.value }}</pre>
</template>

<style scoped>
pre {
  padding: 12px;
  overflow-x: auto;
  background: #f5f7fa;
  white-space: pre-wrap;
}
</style>
