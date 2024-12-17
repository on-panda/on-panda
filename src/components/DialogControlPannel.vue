<template>
    <div class="dialogControlPannel" v-if="pandaState.dialogCache.value?.annotate">
        <footer style="display :flex; margin-top:-10px; margin-bottom:10px">
            <!-- <span class="stretch" style="margin-right: auto" /> -->
            <el-tooltip content="Save the data" raw-content placement="top">
                <el-button plain type="success" :icon="Select" size="small"
                    @click="downloadJsonFile(pandaState.dump())" />
            </el-tooltip>
            <el-tooltip content="Previous modification<br>(Shortcut key: left)" raw-content placement="top">
                <el-button id="switchToPreviousDialog" :icon="Back" size="small"
                    @click="pandaState.switchToPreviousDialog()" />
            </el-tooltip>
            <el-tooltip content="Next modification<br>(Shortcut key: right)" raw-content placement="top">
                <el-button id="switchToNextDialog" :icon="Right" size="small"
                    @click="pandaState.switchToNextDialog()" />
            </el-tooltip>
            <el-tooltip content="Delete current dialog" raw-content placement="top" v-if="!pandaState.isDeleted.value">
                <el-button plain type="danger" :icon="Delete" size="small" @click="pandaState.deleteCurrentDialog()" />
            </el-tooltip>
            <el-tooltip content="Restore current dialog" raw-content placement="top" v-if="pandaState.isDeleted.value">
                <el-button plain type="success" :icon="Help" size="small" @click="pandaState.restoreDeletedDialog()" />
            </el-tooltip>
            <el-tooltip content="Permanently delete current dialog" raw-content placement="top"
                v-if="pandaState.isDeleted.value">
                <el-button plain type="danger" :icon="CloseBold" size="small"
                    @click="pandaState.eraseCurrentDialog()" />
            </el-tooltip>
            <el-tooltip content="Upload *.panda.json file" raw-content placement="top">
                <el-button :icon="UploadFilled" size="small" @click="uploadAndLoadJson" />
            </el-tooltip>
            <el-tooltip content="Download panda.json file" raw-content placement="top">
                <el-button :icon="Download" size="small"
                    @click="downloadJsonFile(pandaState.dump(), uploadedJson && uploadedJson.name)" />
            </el-tooltip>
            <el-tooltip content="Download panda.json file" raw-content placement="top" v-if="0">
                <el-dropdown split-button
                    @click="downloadJsonFile(pandaState.dump(), uploadedJson && uploadedJson.name)" size=small>
                    <el-icon>
                        <Download />
                    </el-icon>
                    <template #dropdown>
                        <el-dropdown-menu>
                            <el-dropdown-item
                                @click="downloadJsonFile(pandaState.dump(true), uploadedJson && uploadedJson.name)">Download
                                with cache</el-dropdown-item>
                        </el-dropdown-menu>
                    </template>
                </el-dropdown>
            </el-tooltip>
        </footer>

        <el-upload class="upload-demo" :drag="true"
            action="" multiple>
            <el-icon class="el-icon--upload"><upload-filled /></el-icon>
            <div class="el-upload__text">
                Drop file here or <em>click to upload</em>
            </div>
            <template #tip>
                <div class="el-upload__tip">
                    jpg/png files with a size less than 500kb
                </div>
            </template>
        </el-upload>

        <div class='dialogKeysFooter' style="color:#555">
            &nbsp;&nbsp;
            <small v-for="(key, idx) in pandaState.dialogKeys.value" style="cursor: pointer"
                @click="pandaState.switchDialogByIndex(idx)"
                :style="idx == pandaState.currentDialogIndex.value ? { color: '#409eff', fontWeight: 700 } : {}">
                <span style="margin-right: 8px"
                    :style="key in pandaState.pandaTree.value.dialogs ? {} : { textDecoration: 'line-through red' }">
                    &#8202;{{ key
                    }} &#8202;</span>
            </small>
        </div>
    </div>
</template>
<script setup>
import { ref } from 'vue'
import { pandaState } from '../stores/pandaState'
import { Select, Back, Right, RefreshLeft, RefreshRight, Delete, Help, CloseBold, Download, UploadFilled, ArrowDown } from '@element-plus/icons-vue'
import { registerKeyActions, downloadJsonFile, uploadJsonFile } from '../utils/commonUtils'

registerKeyActions({
    ArrowLeft: pandaState.switchToPreviousDialog,
    ArrowRight: pandaState.switchToNextDialog,
})

const uploadedJson = ref(null)

async function uploadAndLoadJson() {
    uploadedJson.value = await uploadJsonFile()
    pandaState.load(uploadedJson.value.data)
}


</script>