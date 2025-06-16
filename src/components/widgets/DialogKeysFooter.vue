<script setup>
const props = defineProps({
    pandaState: {
        type: Object,
        required: true
    }
})

var pandaState = props.pandaState
</script>
<template>
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
                &#8202; {{ key }}<div
                    style="width: 0px; height: 0px; overflow:visible;display: inline-block;position: relative;left: 2px;top: -4px;">
                    <!-- color dots for hinting, must remove all spaces before and after the dot div -->
                    <!-- hinting is_good dialog -->
                    <div class="onPandaDotHint"
                        :style="pandaState.isDialogKeyIsGood(key) ? { backgroundColor: '#67c23a' } : { backgroundColor: 'rgba(0,0,255,0)' }">
                    </div>
                </div>&#8202;
            </span>
        </small>
    </div>
</template>

<style scoped>
.onPandaDotHint {
    height: 4px;
    width: 4px;
    border-radius: 50%
}
</style>