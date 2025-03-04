<template>
    <div class="dialogControlPannel" v-if="pandaState.dialogKeys.value?.length">
        <div style="margin-top:-10px; margin-bottom:10px; line-height:2">
            <!-- <span class="stretch" style="margin-right: auto" /> -->
            <el-tooltip :content="t('tooltips.saveData')" raw-content placement="top">
                <el-button plain type="success" :icon="Select" size="small" @click="pandaState.dump({})" />
            </el-tooltip>
            <el-tooltip :content="t('tooltips.previousModification') + '<br>(Shortcut key: left)'" raw-content
                placement="top">
                <el-button id="switchToPreviousDialog" :icon="Back" size="small"
                    @click="pandaState.switchToPreviousDialog()" />
            </el-tooltip>
            <el-tooltip :content="t('tooltips.nextModification') + '<br>(Shortcut key: right)'" raw-content
                placement="top">
                <el-button id="switchToNextDialog" :icon="Right" size="small"
                    @click="pandaState.switchToNextDialog()" />
            </el-tooltip>
            <el-tooltip :content="t('tooltips.deleteDialog')" raw-content placement="top"
                v-if="!pandaState.isDeleted.value">
                <el-button plain type="danger" :icon="Delete" size="small" @click="pandaState.deleteCurrentDialog()" />
            </el-tooltip>
            <el-tooltip :content="t('tooltips.restoreDialog')" raw-content placement="top"
                v-if="pandaState.isDeleted.value">
                <el-button plain type="success" :icon="Help" size="small" @click="pandaState.restoreDeletedDialog()" />
            </el-tooltip>
            <el-tooltip :content="t('common.delete') + ' ' + t('tooltips.deleteDialog')" raw-content placement="top"
                v-if="pandaState.isDeleted.value">
                <el-button plain type="danger" :icon="CloseBold" size="small"
                    @click="pandaState.eraseCurrentDialog()" />
            </el-tooltip>
            <el-tooltip :content="t('tooltips.uploadFile') + '<br>' + t('userMessages.dropJsonHere')" raw-content
                placement="top">
                <el-button :icon="UploadFilled" size="small" @click="uploadAndLoadJson"
                    :style="isDragged ? { backgroundColor: 'rgb(158, 218, 255)' } : {}" />
            </el-tooltip>
            <el-tooltip :content="t('tooltips.downloadFile')" raw-content placement="top">
                <el-button :icon="Download" size="small" @click="clickToDownload" />
            </el-tooltip>
            <el-tooltip :content="t('userMessages.openAnnotatorPanel')" raw-content placement="top"
                v-if="!('is_good' in (pandaState.currentDialogData.value?.annotate || {}))">
                <el-button :icon="Postcard" size="small"
                    @click="() => { pandaState.currentDialogData.value.annotate = { is_good: null } }" />
            </el-tooltip>
            <el-tooltip :content="t('tooltips.cleanUI')" raw-content placement="top">
                <el-button :icon="Reading" size="small" :type="globalStore.cleanMode ? 'success' : 'default'"
                    @click="globalStore.cleanMode = !globalStore.cleanMode" />
            </el-tooltip>
            <el-tooltip :content="t('tooltips.downloadFile')" raw-content placement="top" v-if="0">
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

        <el-dialog v-model="isDragged" style="width: 80%;">
            <el-upload v-show="isDragged" class="dropzone" :drag="true" :auto-upload="false" :on-change="handleDropJson"
                accept=".json" :multiple="false">
                <el-icon class="el-icon--upload"><upload-filled /></el-icon>
                <div class="el-upload__text">
                    {{ t('userMessages.dropJsonHere') }}
                </div>
                <template #tip>
                    <div class="el-upload__tip">
                        {{ t('userMessages.onlyOneJsonFile') }}
                    </div>
                </template>
            </el-upload>
        </el-dialog>

        <!-- TODO mv left, right button to keys foooter -->
        <div class='dialogKeysFooter' style="color:#555;margin-bottom: 10px;">
            &nbsp;
            <small v-for="(key, idx) in pandaState.dialogKeys.value"
                style="cursor: pointer;width: 30px; display: inline-block;text-align: center;"
                @click="pandaState.switchDialogByIndex(idx)" :style="(key in pandaState.pandaTree.value.dialogs) ? {} : {
                    textDecorationLine: 'line-through',
                    textDecorationColor: 'red', color: '#bbb'
                }">
                <span
                    :style="idx == pandaState.currentDialogIndex.value ? { color: '#409eff', fontWeight: 550, fontSize: 'medium' } : {}">
                    &#8202; {{ key }} &#8202;</span>
            </small>
        </div>
    </div>
</template>
<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useGlobalStore } from '../stores/globalStore.js'
import { PandaState, pandaState, uploadedJson } from '../stores/pandaState'
import { Select, Back, Right, RefreshLeft, RefreshRight, Delete, Help, CloseBold, Download, UploadFilled, Postcard, Reading } from '@element-plus/icons-vue'
import { registerKeyActions, downloadJsonFile, uploadJsonFile, useEventListener } from '../utils/commonUtils'
import { useI18n } from 'vue-i18n'

const globalStore = useGlobalStore()
const { t } = useI18n()

registerKeyActions({
    ArrowLeft: pandaState.switchToPreviousDialog,
    ArrowRight: pandaState.switchToNextDialog,
})


async function uploadAndLoadJson() {
    isDragged.value = false;
    uploadedJson.value = await uploadJsonFile()
    pandaState.load(uploadedJson.value.data)
    ElMessage.success('JSON file uploaded successfully.');
}

const handleDropJson = (uploadFile) => {
    const file = uploadFile.raw;
    if (!file.type.includes('json')) {
        ElMessage.error('Please upload JSON file only!');
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(reader.result);

            pandaState.load(data);
            uploadedJson.value = { name: file.name, file, data, }
            ElMessage.success('JSON file uploaded successfully.');
        } catch (error) {
            ElMessage.error('Invalid JSON file!');
            console.error(error);
        }
    };
    reader.readAsText(file);
    isDragged.value = false;
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


const isDragged = ref(false)

useEventListener(document, 'dragover', function (event) {
    event.preventDefault();
    event.stopPropagation();
    const files = event.dataTransfer.items;
    for (let item of files) {
        if (item.kind === 'file') {
            if (item.type.includes('json')) {
                isDragged.value = true;
                // console.log('Dragged file:', item, item.getAsFile());
            }
        }
    }
});

useEventListener(document, 'drop', function (event) {
    // prevent default drop event(open file in browser)
    event.preventDefault();
    event.stopPropagation();
    isDragged.value = false;
})

useEventListener(document, 'dragleave', function (event) {
    if (event.target.tagName == 'HTML') { // only when drag out of the window
        event.preventDefault();
        event.stopPropagation();
        isDragged.value = false;
    }
})

</script>
<style>
.dropzone .el-upload .el-upload-dragger {
    background-color: rgb(158, 218, 255)
}
</style>