<template>
  <div class="annotate-page">
    <aside class="annotate-sidebar">
      <LanguageSwitcher />
      <div class="annotate-project-name">
        <span>{{ t('annotationUi.projectName') }}</span>
        <strong>{{ projectName }}</strong>
      </div>
      <div class="annotate-list">
        <button v-for="item in jsonList" :key="item.id" class="annotate-list-item"
          :class="{ active: item.id === currentId }" type="button" @click="selectItem(item.id)">
          {{ item.id }}
        </button>
      </div>
      <div class="annotate-controls">
        <el-button :disabled="!currentId" @click="runAction(loadNext)">{{ t('annotationUi.next') }}</el-button>
        <el-button :disabled="!currentId" type="danger" plain @click="runAction(deleteCurrent)">{{ t('annotationUi.delete') }}</el-button>
        <el-button :disabled="!currentId" type="primary" @click="runAction(saveCurrent)">{{ t('annotationUi.save') }}</el-button>
      </div>
    </aside>
    <main class="annotate-main">
      <OnPandaDialogWithControl :dialogWithControlState="dialogWithControlState" />
    </main>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { DialogWithControlStateClosure } from './stores/dialogWithControlState.js'
import OnPandaDialogWithControl from './components/OnPandaDialogWithControl.vue'
import LanguageSwitcher from './components/widgets/LanguageSwitcher.vue'

const { t } = useI18n()
const rootUrl = '/on-panda-annotate/'
const jsonList = ref([])
const currentId = ref('')
const projectName = ref('')

const dialogWithControlState = DialogWithControlStateClosure()

function apiUrl(path) {
  return `${rootUrl}${path}`
}

async function request(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    headers: { 'content-type': 'application/json' },
    ...options,
  })
  const result = await response.json()
  if (!response.ok) {
    throw new Error(result.error || `Request failed: ${response.status}`)
  }
  return result
}

function idUrl(id) {
  return `${rootUrl}id/${id.split('/').map(encodeURIComponent).join('/')}`
}

function updateUrl(id) {
  history.pushState({}, '', idUrl(id))
}

function getIdFromUrl() {
  const prefix = `${rootUrl}id/`
  if (!window.location.pathname.startsWith(prefix)) {
    return ''
  }
  return decodeURIComponent(window.location.pathname.slice(prefix.length))
}

async function loadItem(id, { updateHistory = true } = {}) {
  const result = await request('load_panda_json', {
    method: 'POST',
    body: JSON.stringify({ id }),
  })
  dialogWithControlState.operationCenter.loadPandaJson(result)
  currentId.value = id
  if (updateHistory) {
    updateUrl(id)
  }
}

async function selectItem(id) {
  try {
    await loadItem(id)
  } catch (error) {
    ElMessage.error(error.message)
  }
}

async function refreshList() {
  const result = await request('get_json_list', { method: 'POST', body: '{}' })
  projectName.value = result.project_name
  jsonList.value = result.data
  return result.data
}

async function loadInitialItem() {
  const list = await refreshList()
  if (!list.length) {
    ElMessage.error(t('annotationUi.noFiles'))
    return
  }
  const requestedId = getIdFromUrl()
  const id = requestedId || list[0].id
  if (requestedId && !list.some(item => item.id === requestedId)) {
    ElMessage.error(t('annotationUi.missingFile', { id: requestedId }))
    return
  }
  await loadItem(id, { updateHistory: !requestedId })
}

async function loadNext() {
  const index = jsonList.value.findIndex(item => item.id === currentId.value)
  if (index < jsonList.value.length - 1) {
    await loadItem(jsonList.value[index + 1].id)
  }
}

async function deleteCurrent() {
  const deletedId = currentId.value
  const deletedIndex = jsonList.value.findIndex(item => item.id === deletedId)
  await request('delete_panda_json', {
    method: 'POST',
    body: JSON.stringify({ id: deletedId }),
  })
  const list = await refreshList()
  const nextItem = list[Math.min(deletedIndex, list.length - 1)]
  currentId.value = ''
  if (nextItem) {
    await loadItem(nextItem.id)
  } else {
    history.pushState({}, '', rootUrl)
    ElMessage.success(t('annotationUi.deleteEmpty'))
  }
}

async function saveCurrent() {
  const data = await dialogWithControlState.operationCenter.dumpPandaJson({ includeCache: true })
  await request('save_panda_json', {
    method: 'POST',
    body: JSON.stringify({ id: currentId.value, data }),
  })
  ElMessage.success(t('annotationUi.saveSuccess'))
  await refreshList()
  await loadNext()
}

async function runAction(action) {
  try {
    await action()
  } catch (error) {
    ElMessage.error(error.message)
  }
}

async function loadConfig() {
  const result = await request('web_config.json5', { method: 'POST', body: '{}' })
  dialogWithControlState.applyConfig(result)
}

async function initialize() {
  try {
    await loadConfig()
    await loadInitialItem()
  } catch (error) {
    ElMessage.error(error.message)
  }
}

onMounted(() => {
  window.addEventListener('popstate', () => {
    const id = getIdFromUrl()
    if (id) {
      loadItem(id, { updateHistory: false }).catch(error => ElMessage.error(error.message))
    }
  })
  initialize()
})
</script>

<style scoped>
.annotate-page {
  display: flex;
  min-height: 100vh;
  background: #fff;
}

.annotate-sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  display: flex;
  width: 280px;
  flex-direction: column;
  border-right: 1px solid #dcdfe6;
  background: #fff;
}

.annotate-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.annotate-project-name {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 12px;
  border-bottom: 1px solid #dcdfe6;
  color: #606266;
  font-size: 12px;
}

.annotate-project-name strong {
  color: #303133;
  font-size: 16px;
  overflow-wrap: anywhere;
}

.annotate-list-item {
  display: block;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #303133;
  cursor: pointer;
  font-size: 13px;
  text-align: left;
  word-break: break-all;
}

.annotate-list-item:hover,
.annotate-list-item.active {
  background: #fff;
  color: #303133;
}

.annotate-list-item.active {
  box-shadow: inset 3px 0 #409eff;
  font-weight: 600;
}

.annotate-controls {
  display: flex;
  gap: 8px;
  padding: 12px 8px;
  border-top: 1px solid #dcdfe6;
}

.annotate-controls .el-button {
  flex: 1;
  margin: 0;
}

.annotate-main {
  flex: 1;
  min-width: 0;
  margin-left: 280px;
  padding: 1em 2em 2em;
}

@media (max-width: 800px) {
  .annotate-sidebar {
    width: 220px;
  }

  .annotate-main {
    margin-left: 220px;
    padding: 1em 12px 2em;
  }
}
</style>
