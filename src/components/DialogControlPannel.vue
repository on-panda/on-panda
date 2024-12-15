<template>
    <div class="dialogControlPannel" v-if="pandaState.dialogCache.value?.annotate">
        <footer style="display :flex; margin-top:-10px; margin-bottom:10px">
            <!-- <span class="stretch" style="margin-right: auto" /> -->
            <el-tooltip content="Save the data" raw-content placement="top">
                <el-button plain type="success" id="" :icon="Select" size="small"
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
            <el-tooltip content="" raw-content placement="top" v-if="!pandaState.isDeleted.value">
                <el-button plain type="danger" id="" :icon="Delete" size="small"
                    @click="pandaState.deleteCurrentDialog()" />
            </el-tooltip>
            <el-tooltip content="" raw-content placement="top" v-if="pandaState.isDeleted.value">
                <el-button plain type="success" id="" :icon="Help" size="small"
                    @click="pandaState.restoreDeletedDialog()" />
            </el-tooltip>
            <el-tooltip content="" raw-content placement="top" v-if="pandaState.isDeleted.value">
                <el-button plain type="danger" id="" :icon="CloseBold" size="small"
                    @click="pandaState.eraseCurrentDialog()" />
            </el-tooltip>
            <el-tooltip content="Upload *.panda.json file" raw-content placement="top">
                <el-button id="" :icon="UploadFilled" size="small" @click="" :disabled="true" />
            </el-tooltip>
            <el-tooltip content="Download panda.json file" raw-content placement="top">
                <el-button id="" :icon="Download" size="small" @click="downloadJsonFile(pandaState.dump())" />
            </el-tooltip>
        </footer>
        <div style="color:#555">
            &nbsp;&nbsp;
            <small v-for="(key, idx) in pandaState.dialogKeys.value" style="cursor: pointer"
                @click="pandaState.switchDialogByIndex(idx)"
                :style="idx == pandaState.currentDialogIndex.value ? { color: '#409eff', fontWeight: 700 } : {}">
                &nbsp; {{ key }} &nbsp;
            </small>
        </div>
    </div>
</template>
<script setup>
import { pandaState } from '../stores/pandaState'
import { Select, Back, Right, RefreshLeft, RefreshRight, Delete, Help, CloseBold, Download, UploadFilled } from '@element-plus/icons-vue'
import { registerKeyActions, downloadJsonFile } from '../utils/commonUtils'

registerKeyActions({
    ArrowLeft: pandaState.switchToPreviousDialog,
    ArrowRight: pandaState.switchToNextDialog,
})
</script>