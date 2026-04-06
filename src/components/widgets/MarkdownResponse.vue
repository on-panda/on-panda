<template>
    <div class="markdown-response">
        <div v-if="!props.content">
            <WaitingInfo v-bind="props.waitingInfoProps" />
        </div>
        <MessageAsTextRender :messageAsText="props.content" initReasoningDisplayMode="full"
            style="background-color: #eee;" />
    </div>
</template>

<script setup>

import MessageAsTextRender from './MessageAsTextRender.vue'
import WaitingInfo from './WaitingInfo.vue'

const props = defineProps({
    content: {
        type: String,
    },
    waitingInfoProps: {
        type: Object,
        default: () => ({}),
    }
})

</script>
