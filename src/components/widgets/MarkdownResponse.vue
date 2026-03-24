<template>
    <div class="markdown-response">
        <div v-if="!props.content">
            <WaitingInfo v-bind="props.waitingInfoProps" />
        </div>
        <p> <!-- Removing the p tag will cause unstable rendering in stream mode -->
            <MarkdownRender :content="props.content || ''" style="background-color: #eee;" />
        </p>
    </div>
</template>

<script setup>

import MarkdownRender from './MarkdownRender.vue'
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
