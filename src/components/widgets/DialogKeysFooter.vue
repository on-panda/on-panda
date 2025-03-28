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
                &#8202; {{ key }} &#8202;</span>
        </small>
    </div>
</template>

<script setup>
const props = defineProps({
    pandaState: {
        type: Object,
        required: true
    }
})
</script>