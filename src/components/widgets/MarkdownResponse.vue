<template>
    <div class="markdown-response">
        <div v-if="!props.content">
            <p style="background-color: #eee;color: #444">
                <span v-html="WaitingInfo"></span>
            </p>
        </div>
        <p> <!-- Removing the p tag will cause unstable rendering in stream mode -->
            <MessageMarkdown :content="props.content || ''" style="background-color: #eee;" />
        </p>
    </div>
</template>

<script setup>

import MessageMarkdown from '../MessageMarkdown.vue'

const props = defineProps({
    content: {
        type: Object,
    },
    WaitingInfo: {
        type: String,
        default: 'Waiting for response...'
    }
})

</script>