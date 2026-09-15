<script setup>
import { DialogWithControlStateClosure, OnPandaDialogWithControl } from '@on-panda/on-panda'

import { testApiConfigs, testModelNameTags } from './testApiConfig.js'

const messages = [
  {
    role: 'user',
    content: 'Tell a joke about robot, around 50 words long.',
  },
]

const examplePandaJson = {
  dialogs: {
    1: {
      messages: [
        {
          role: 'user',
          content: `Write a lipogrammatic acrostic poem about "onPanda":
- Restriction 1: the first letters vertically form the name "onPanda"
- Restriction 2: entire text strictly omits the letter "e" (or "E")
- Background: \`onPanda: Efficient Annotation of On-Policy Alignment Data for LLMs and Agents via Token-Level Correction\``,
        },
        {
          role: 'assistant',
          content: `Odd minds craft bright art,
Noisy minds craft bold art,
Pandas roam in moonlit dark,
Artists draw with calm hands,
Night falls on calm land,
Daring minds build bright plans,
All join in a grand arc.`,
          finish_reason: 'stop',
        },
      ],
      annotate: {
        is_good: null,
      },
      operations: [],
    },
  },
  version: '2.0',
  uuid: 'integration-example',
  hash_map: {},
  deleted_dialogs: {},
  update_time: null,
}

const dialogWithControlState = DialogWithControlStateClosure({
  apiConfigs: testApiConfigs,
  modelNameTags: testModelNameTags,
})

const { operationCenter } = dialogWithControlState

async function dumpPandaJson() {
  document.getElementById('panda-json-output').textContent = JSON.stringify(
    await operationCenter.dumpPandaJson(),
    null,
    2,
  )
}
</script>

<template>
  <p>
    The state closure exposes the same operations used by <code>OnPandaWeb</code> while leaving the page layout to the host app.
  </p>
  <p>
    <el-button type="primary" plain @click="operationCenter.loadMessages(messages)">
      Load messages
    </el-button>
    <el-button type="primary" plain @click="operationCenter.loadPandaJson(examplePandaJson)">
      Load Panda JSON
    </el-button>
    <el-button type="primary" plain @click="dumpPandaJson">
      Export Panda JSON
    </el-button>
  </p>
  <pre id="panda-json-output"></pre>
  <OnPandaDialogWithControl :dialogWithControlState="dialogWithControlState" />
</template>

<style scoped>
pre {
  min-height: 80px;
  padding: 12px;
  overflow-x: auto;
  background: #f5f7fa;
  white-space: pre-wrap;
}
</style>
