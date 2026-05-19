<template>
    <div class="DataControlPanel" ref="dataControlPanelRef" v-if="pandaState.dialogKeys.value?.length">
        <div ref="dataControlPanelButtonRowRef" style="line-height:2; margin-bottom:10px;"
            class="DataControlPanelButtonRow">
            <!-- <span class="stretch" style="margin-right: auto" /> -->
            <el-tooltip :content="agenticLoopStatus.running ? t('tooltips.stopAgenticLoop') : t('tooltips.regenerate')"
                raw-content placement="bottom">
                <el-button class="agenticControlButton" size="small" :plain="showAgenticPauseControl"
                    :type="showAgenticPauseControl ? 'danger' : ''" @mouseenter="isAgenticControlButtonHovering = true"
                    @mouseleave="isAgenticControlButtonHovering = false" @click="handleAgenticControlButtonClick">
                    <span v-if="agenticLoopStatus.running" class="agenticControlIconStack">
                        <el-icon class="is-loading agenticControlRunningIcon">
                            <Loading />
                        </el-icon>
                        <el-icon class="agenticControlPauseIcon">
                            <VideoPause />
                        </el-icon>
                    </span>
                    <el-icon v-else>
                        <Refresh />
                    </el-icon>
                </el-button>
            </el-tooltip>
            <el-tooltip :content="t('tooltips.saveData')" raw-content placement="bottom" v-if="0">
                <el-button plain type="success" :icon="Select" size="small" @click="pandaState.dump({})" />
            </el-tooltip>
            <el-tooltip :content="t('tooltips.clearAndReset')" raw-content placement="bottom">
                <el-button plain type="danger" :icon="CloseBold" size="small" @click="pandaState.setEmpty()" />
            </el-tooltip>
            <!-- TODO mv left, right button to keys foooter -->
            <!-- <el-tooltip :content="t('tooltips.previousModification') + '<br>(Shortcut key: left)'" raw-content
                placement="bottom">
                <el-button id="switchToPreviousDialog" :icon="Back" size="small"
                    @click="pandaState.switchToPreviousDialog()" />
            </el-tooltip>
            <el-tooltip :content="t('tooltips.nextModification') + '<br>(Shortcut key: right)'" raw-content
                placement="bottom">
                <el-button id="switchToNextDialog" :icon="Right" size="small"
                    @click="pandaState.switchToNextDialog()" />
            </el-tooltip> -->
            <el-tooltip :content="t('tooltips.deleteDialog')" raw-content placement="bottom"
                v-if="!pandaState.isDeleted.value">
                <el-button plain type="" :icon="Delete" size="small" @click="pandaState.deleteCurrentDialog()" />
            </el-tooltip>
            <el-tooltip :content="t('tooltips.restoreDialog')" raw-content placement="bottom"
                v-if="pandaState.isDeleted.value">
                <el-button plain type="success" :icon="Help" size="small" @click="pandaState.restoreDeletedDialog()" />
            </el-tooltip>
            <el-tooltip :content="t('tooltips.eraseDialog')" raw-content placement="bottom"
                v-if="pandaState.isDeleted.value">
                <el-button default type="danger" :icon="Delete" size="small" @click="pandaState.eraseCurrentDialog()" />
            </el-tooltip>
            <el-tooltip :content="t('tooltips.uploadFile') + '<br>' + t('userMessages.dropFilesHere')" raw-content
                placement="bottom">
                <el-button :icon="UploadFilled" size="small" @click="uploadFile"
                    :style="isDragged ? { backgroundColor: 'rgb(158, 218, 255)' } : {}" />
            </el-tooltip>
            <el-tooltip :content="t('tooltips.downloadFile')" raw-content placement="bottom">
                <el-button :icon="Download" size="small" @click="clickToDownload" />
            </el-tooltip>
            <el-tooltip :content="t('userMessages.openAnnotatorPanel')" raw-content placement="bottom"
                v-if="!('is_good' in (pandaState.currentDialogData.value?.annotate || {}))">
                <el-button :icon="Postcard" size="small"
                    @click="() => { pandaState.currentDialogData.value.annotate = { is_good: null } }" />
            </el-tooltip>
            <el-tooltip :content="t('tooltips.cleanUI')" raw-content placement="bottom">
                <el-button :icon="Reading" size="small" :type="globalStore.cleanMode ? 'success' : 'default'"
                    @click="globalStore.cleanMode = !globalStore.cleanMode" />
            </el-tooltip>
            <el-tooltip :content="t('tooltips.downloadFile')" raw-content placement="bottom" v-if="0">
                <el-dropdown split-button
                    @click="async () => downloadJsonFile(await pandaState.dump({}), uploadedJson && uploadedJson.name)"
                    size=small>
                    <el-icon>
                        <Download />
                    </el-icon>
                    <template #dropdown>
                        <el-dropdown-menu>
                            <el-dropdown-item
                                @click="async () => downloadJsonFile(await pandaState.dump({ includeCache: true }), uploadedJson && uploadedJson.name)">Download
                                with cache</el-dropdown-item>
                        </el-dropdown-menu>
                    </template>
                </el-dropdown>
            </el-tooltip>
        </div>


        <AnnotatorPanel
            v-if="pandaState.dialogCache.value?.annotate || pandaState.pandaTree.value?.description || pandaState.pandaTree.value?.comment || globalStore.debug"
            :responseState="responseState" />

        <el-dialog v-model="isDragged" style="width: 80%;">
            <el-upload v-show="isDragged" class="on-panda-dropzone" :drag="true" :auto-upload="false"
                :on-change="handleDropJson" :multiple="false" @drop.capture.prevent.stop="handleDropFiles">
                <el-icon class="el-icon--upload"><upload-filled /></el-icon>
                <div class="el-upload__text">
                    {{ t('userMessages.dropFilesHere') }}
                </div>
                <template #tip>
                    <div class="el-upload__tip">
                        {{ t('userMessages.localFilesUploadTip') }}
                    </div>
                </template>
            </el-upload>
        </el-dialog>
    </div>
</template>
<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useGlobalStore } from '../stores/globalStore.js'
import { Select, Back, Right, RefreshLeft, RefreshRight, Delete, Help, CloseBold, Download, UploadFilled, Postcard, Reading, VideoPause, Refresh, Loading } from '@element-plus/icons-vue'
import { registerKeyActions, downloadJsonFile } from '../utils/commonUtils.js'
import AnnotatorPanel from './AnnotatorPanel.vue'

const { t } = useI18n()

const props = defineProps({
    responseState: {
        type: Object,
        required: true
    }
})

const pandaState = props.responseState.pandaState
const uploadedJson = props.responseState.uploadedJson
const onPandaContainerRef = props.responseState.onPandaContainerRef
const messages = props.responseState.messages
const agenticLoopStatus = props.responseState.agenticLoopStatus
const operationCenter = props.responseState.operationCenter

const globalStore = useGlobalStore()

registerKeyActions({
    ArrowLeft: pandaState.switchToPreviousDialog,
    ArrowRight: pandaState.switchToNextDialog,
})


async function uploadFile() {
    isDragged.value = false;
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.onchange = async () => {
        const file = fileInput.files[0]
        if (isPandaJsonFile(file)) {
            await loadPandaJsonFile(file)
        } else {
            operationCenter.addUserLocalFiles([{ path: file.name, handleOrEntry: file }])
        }
    }
    fileInput.click()
}

function isPandaJsonFile(file) {
    const name = file.name
    return name.includes('.panda') && name.endsWith('.json')
}

function loadPandaJsonFile(file) {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(reader.result);

                pandaState.load(data);
                uploadedJson.value = { name: file.name, file, data, }
                ElMessage.success('JSON file uploaded successfully.');
                jumpToLatestUserIfNeeded()
            } catch (error) {
                ElMessage.error('Invalid JSON file!');
                console.error(error);
            }
            resolve()
        };
        reader.readAsText(file);
        isDragged.value = false;
    })
}

const handleDropJson = async (uploadFile) => {
    const file = uploadFile.raw;
    if (!isPandaJsonFile(file)) {
        operationCenter.addUserLocalFiles([{ path: file.name, handleOrEntry: file }])
        return;
    }
    await loadPandaJsonFile(file)
};

const clickToDownload = async () => {
    var name = null
    if (uploadedJson.value) {
        var name = uploadedJson.value.name
        if (!name.includes('.panda.json')) {
            name = name.replace('.json', '.panda.json')
        }
    }
    downloadJsonFile(await pandaState.dump({ includeCache: true }), name)
}


async function getFileFromHandleOrEntry(handleOrEntry) {
    if (handleOrEntry.getFile) {
        return await handleOrEntry.getFile()
    }
    return await new Promise(resolve => handleOrEntry.file(resolve))
}

async function getDroppedFileItem(item) {
    if (item.getAsFileSystemHandle) {
        const handle = await item.getAsFileSystemHandle()
        return {
            path: handle.name,
            handleOrEntry: handle,
            file: handle.kind === 'file' ? await getFileFromHandleOrEntry(handle) : null,
        }
    }
    const entry = item.webkitGetAsEntry()
    return {
        path: (entry.fullPath || entry.name).replace(/^\//, ''),
        handleOrEntry: entry,
        file: entry.isFile ? await getFileFromHandleOrEntry(entry) : null,
    }
}

async function handleDropFiles(event) {
    isDragged.value = false
    const items = Array.from(event.dataTransfer.items || [])
    const droppedFilePromises = items
        .filter(item => item.kind === 'file' && (item.getAsFileSystemHandle || item.webkitGetAsEntry))
        .map(item => getDroppedFileItem(item))
    const droppedFiles = await Promise.all(droppedFilePromises)
    if (!droppedFiles.length) {
        for (const file of Array.from(event.dataTransfer.files || [])) {
            droppedFiles.push({ path: file.name, handleOrEntry: file, file })
        }
    }

    if (droppedFiles.length === 1 && droppedFiles[0].file && isPandaJsonFile(droppedFiles[0].file)) {
        await loadPandaJsonFile(droppedFiles[0].file)
        return
    }
    operationCenter.addUserLocalFiles(droppedFiles.map(({ path, handleOrEntry }) => ({ path, handleOrEntry })))
}

const isDragged = ref(false)
watch(onPandaContainerRef, (newContainer) => {
    // TODO: removeEventListener for old container
    if (newContainer) {
        // can not use addEventListner, no need unmount
        newContainer.addEventListener('dragover', function (event) {
            event.preventDefault();
            event.stopPropagation();
            if (Array.from(event.dataTransfer.types).includes('Files')) {
                isDragged.value = true;
            }
        });

        newContainer.addEventListener('drop', function (event) {
            // prevent default drop event(open file in browser)
            event.preventDefault();
            event.stopPropagation();
            isDragged.value = false;
        })

        newContainer.addEventListener('dragleave', function (event) {
            if (event.target.tagName == 'HTML') { // only when drag out of the window
                event.preventDefault();
                event.stopPropagation();
                isDragged.value = false;
            }
        })
    }
})

const dataControlPanelRef = ref(null)
const dataControlPanelButtonRowRef = ref(null)
const isAgenticControlButtonHovering = ref(false)
const tokens = props.responseState.tokens
const showAgenticPauseControl = computed(() => agenticLoopStatus.running && isAgenticControlButtonHovering.value)

function handleAgenticControlButtonClick() {
    if (agenticLoopStatus.running) {
        operationCenter.stopAgenticLoop()
    } else {
        operationCenter.generateNew()
    }
}

const buttonRowAutoFollow = {
    enabled: true,
    shouldFollow: false,
    isPinned: false,
    isStoppedByUser: false,
    bottomBeforeUpdate: 0,
    isScheduled: false,
    userScrollFrame: 0,
    stabilizeFrame: 0,
    endTimer: 0,
    schedule() {
        if (!buttonRowAutoFollow.enabled || !buttonRowAutoFollow.shouldFollow || !dataControlPanelButtonRowRef.value || buttonRowAutoFollow.isScheduled) {
            return
        }
        const targetBottom = window.innerHeight - 8
        const rect = dataControlPanelButtonRowRef.value.getBoundingClientRect()
        buttonRowAutoFollow.bottomBeforeUpdate = buttonRowAutoFollow.isPinned ? targetBottom : rect.bottom
        buttonRowAutoFollow.isScheduled = true
        nextTick(buttonRowAutoFollow.follow)
    },
    follow() {
        buttonRowAutoFollow.isScheduled = false
        if (!buttonRowAutoFollow.enabled || !dataControlPanelButtonRowRef.value) {
            return
        }
        const rect = dataControlPanelButtonRowRef.value.getBoundingClientRect()
        const targetBottom = window.innerHeight - 8
        const shouldPin = buttonRowAutoFollow.isPinned || buttonRowAutoFollow.bottomBeforeUpdate > targetBottom || rect.bottom > targetBottom
        if (!shouldPin) {
            return
        }
        buttonRowAutoFollow.isPinned = true
        buttonRowAutoFollow.scrollToBottom()
        buttonRowAutoFollow.stabilize(2)
    },
    scrollToBottom() {
        const rect = dataControlPanelButtonRowRef.value.getBoundingClientRect()
        const targetScrollTop = window.scrollY + rect.bottom - (window.innerHeight - 8)
        if (Math.abs(window.scrollY - targetScrollTop) >= 1) {
            window.scrollTo({ top: targetScrollTop })
        }
    },
    reset() {
        if (!buttonRowAutoFollow.enabled || !dataControlPanelButtonRowRef.value || buttonRowAutoFollow.isStoppedByUser) {
            return
        }
        const rect = dataControlPanelButtonRowRef.value.getBoundingClientRect()
        buttonRowAutoFollow.shouldFollow = rect.top < window.innerHeight && rect.bottom > 0
        buttonRowAutoFollow.isPinned = false
        buttonRowAutoFollow.schedule()
    },
    handleUserScroll() {
        cancelAnimationFrame(buttonRowAutoFollow.userScrollFrame)
        buttonRowAutoFollow.userScrollFrame = requestAnimationFrame(() => {
            buttonRowAutoFollow.userScrollFrame = 0
            if (!buttonRowAutoFollow.enabled || !dataControlPanelButtonRowRef.value || !agenticLoopStatus.running && !buttonRowAutoFollow.shouldFollow) {
                return
            }
            const rect = dataControlPanelButtonRowRef.value.getBoundingClientRect()
            buttonRowAutoFollow.shouldFollow = rect.top < window.innerHeight && rect.bottom > 0
            buttonRowAutoFollow.isPinned = false
            buttonRowAutoFollow.isStoppedByUser = !buttonRowAutoFollow.shouldFollow
        })
    },
    stabilize(retryTimes) {
        cancelAnimationFrame(buttonRowAutoFollow.stabilizeFrame)
        buttonRowAutoFollow.stabilizeFrame = requestAnimationFrame(() => {
            buttonRowAutoFollow.stabilizeFrame = 0
            if (!buttonRowAutoFollow.enabled || !buttonRowAutoFollow.shouldFollow || !buttonRowAutoFollow.isPinned || !dataControlPanelButtonRowRef.value) {
                return
            }
            buttonRowAutoFollow.scrollToBottom()
            if (retryTimes > 0) {
                buttonRowAutoFollow.stabilize(retryTimes - 1)
            }
        })
    },
    start() {
        if (!buttonRowAutoFollow.enabled) {
            return
        }
        document.documentElement.style.overflowAnchor = 'none'
        window.addEventListener('wheel', buttonRowAutoFollow.handleUserScroll, { passive: true })
        window.addEventListener('touchmove', buttonRowAutoFollow.handleUserScroll, { passive: true })
        if (agenticLoopStatus.running) {
            nextTick(buttonRowAutoFollow.reset)
        }
    },
    stop() {
        if (!buttonRowAutoFollow.enabled) {
            return
        }
        document.documentElement.style.overflowAnchor = ''
        window.removeEventListener('wheel', buttonRowAutoFollow.handleUserScroll)
        window.removeEventListener('touchmove', buttonRowAutoFollow.handleUserScroll)
        cancelAnimationFrame(buttonRowAutoFollow.userScrollFrame)
        cancelAnimationFrame(buttonRowAutoFollow.stabilizeFrame)
        clearTimeout(buttonRowAutoFollow.endTimer)
    },
}

watch(() => agenticLoopStatus.running, (isRunning) => {
    if (!buttonRowAutoFollow.enabled) {
        return
    }
    clearTimeout(buttonRowAutoFollow.endTimer)
    if (isRunning) {
        nextTick(buttonRowAutoFollow.reset)
    } else {
        buttonRowAutoFollow.endTimer = setTimeout(() => {
            buttonRowAutoFollow.shouldFollow = false
            buttonRowAutoFollow.isPinned = false
            buttonRowAutoFollow.isStoppedByUser = false
        }, 1000)
    }
})

watch([
    () => tokens.value.length,
    () => messages.value.length,
    () => agenticLoopStatus.running,
], buttonRowAutoFollow.schedule)

async function jumpToLatestUserIfNeeded() {
    await nextTick()
    await nextTick()
    const currentMessages = messages?.value || []
    const userIndices = []
    currentMessages.forEach((message, index) => {
        if (message.role === 'user') {
            userIndices.push(index)
        }
    })
    if (currentMessages.length >= 10 && userIndices.length) {
        const anchorId = `message-${userIndices[userIndices.length - 1] + 1}`
        setTimeout(() => {
            requestAnimationFrame(() => {
                const target = document.getElementById(anchorId)
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
            })
        }, 100)
    }
}
onMounted(() => {
    if (dataControlPanelRef.value) {
        props.responseState.onPandaContainerRef.value = dataControlPanelRef.value
    }
    buttonRowAutoFollow.start()
})

onBeforeUnmount(() => {
    buttonRowAutoFollow.stop()
})

</script>
<style>
.on-panda-dropzone .el-upload .el-upload-dragger {
    background-color: rgb(158, 218, 255)
}

.agenticControlButton .agenticControlIconStack {
    position: relative;
    display: inline-flex;
    width: 1em;
    height: 1em;
    align-items: center;
    justify-content: center;
}

.agenticControlButton .agenticControlIconStack .el-icon {
    position: absolute;
}

.agenticControlButton .agenticControlRunningIcon {
    opacity: 1;
    color: var(--el-text-color-regular);
}

.agenticControlButton .agenticControlPauseIcon {
    opacity: 0;
}

.agenticControlButton:hover .agenticControlRunningIcon {
    opacity: 0.2;
}

.agenticControlButton:hover .agenticControlPauseIcon {
    opacity: 0.8;
}
</style>
