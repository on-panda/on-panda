<template>
    <div class="dialogControlPannel">
        <footer style="display :flex; margin-top:-10px; margin-bottom:10px">
            <!-- <span class="stretch" style="margin-right: auto" /> -->
            <el-tooltip content="Previous modification<br>(Shortcut key: left)" raw-content placement="top">
                <el-button id="switchToPreviousDialog" :icon="Back" size="small"
                    @click="pandaState.switchToPreviousDialog()" />
            </el-tooltip>
            <el-tooltip content="Next modification<br>(Shortcut key: right)" raw-content placement="top">
                <el-button id="switchToNextDialog" :icon="Right" size="small"
                    @click="pandaState.switchToNextDialog()" />
            </el-tooltip>
            <el-tooltip content="" raw-content placement="top" v-if="!pandaState.isDeleted.value">
                <el-button id="" :icon="Delete" size="small" @click="pandaState.deleteCurrentDialog()" />
            </el-tooltip>
            <el-tooltip content="" raw-content placement="top" v-if="pandaState.isDeleted.value">
                <el-button plain type="success" id="" :icon="Help" size="small"
                    @click="pandaState.restoreDeletedDialog()" />
            </el-tooltip>
            <el-tooltip content="" raw-content placement="top" v-if="pandaState.isDeleted.value">
                <el-button plain type="danger" id="" :icon="CloseBold" size="small"
                    @click="pandaState.eraseCurrentDialog()" />
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
import { Back, Right, RefreshLeft, RefreshRight, Delete, Help, CloseBold } from '@element-plus/icons-vue'
import { registerKeyActions } from '../utils/commonUtils'

registerKeyActions({
    ArrowLeft: pandaState.switchToPreviousDialog,
    ArrowRight: pandaState.switchToNextDialog,
})
</script>