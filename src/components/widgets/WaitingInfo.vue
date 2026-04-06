<script setup>
import { computed } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
    generating: {
        type: Boolean,
        default: false,
    },
    requestTimes: {
        type: Number,
        default: 0,
    },
    model: {
        type: String,
        default: '',
    },
})

const { t } = useI18n()

const requestLabel = computed(() => {
    if (!props.requestTimes) {
        return ''
    }
    return `No.${props.requestTimes}`
})
</script>

<template>
    <p class="waitingInfo">
        <template v-if="props.generating">
            <span class="waitingInfoRow">
                <el-icon class="is-loading waitingInfoIcon">
                    <Loading />
                </el-icon>
                <b v-if="requestLabel">{{ requestLabel }}</b>
                <span>{{ t('userMessages.waitingForModel') }}</span>
            </span>
            <br>
            <code v-if="props.model" class="waitingInfoModel">{{ props.model }}</code>
        </template>
        <span v-else>{{ t('userMessages.clickSendButton') }}</span>
    </p>
</template>

<style scoped>
.waitingInfo {
    background-color: #eee;
    color: #444;
    padding: 1em;
}

.waitingInfoRow {
    align-items: center;
    display: inline-flex;
    flex-wrap: wrap;
    gap: 6px;
}

.waitingInfoIcon {
    color: #666;
}

.waitingInfoModel {
    display: inline-block;
    margin-left: 30px;
    margin-top: 6px;
}
</style>
