<template>
    <div class="LanguageSwitcher" style="text-align: right; margin-bottom: -15px;">
        <LanguageSwitcher />
    </div>
    <details>
        <summary>
            <small style="color: #888;">{{ t('header.asDataAnnotator') }}:</small>
        </summary>
        <h2>onPanda: on-Policy Alignment Data Annotator</h2>
        <code>{{ t('header.dataAnnotatorDesc') }}</code>
        [<a href="https://on-panda.github.io/research/" style="color: #888;" target="_blank"><small>Project Page</small></a>]
        <br>
        <br>
    </details>

    <!-- <details>
        <summary>
            <small style="color: #888;">{{ t('header.asWritingTool') }}:</small>
        </summary>
        <h2>onPanda: LLM-Native Collaborative Writing Tool</h2>
        <code>{{ t('header.writingToolDesc') }}</code>
    </details>


    <details>
        <summary>
            <small style="color: #888;">{{ t('header.asDrivingMode') }}:</small>
        </summary>
        <h2>(WIP) Driving Mode: You are Secretly an Agentic Model</h2>
        <code>{{ t('header.drivingModeDesc') }}</code>
    </details> -->

    <div style="text-align: center;">
        <img width="128" :src="'/img/on-panda-logo-256x256.png'"
            @error.once="$event.currentTarget.src = 'https://on-panda.github.io/img/on-panda-logo-256x256.png'"
            :style="{ transform: _isLogoRotated ? 'rotate(360deg)' : 'rotate(0deg)', transition: 'transform 3s' }"
            @click="_isLogoRotated = !_isLogoRotated" />
        <br>
        <!-- <b :style="globalStore.isMobile ? {} : { fontSize: '20px' }">onPanda: LLM-Native Interaction Design</b> -->
        <b :style="globalStore.isMobile ? {} : { fontSize: '20px' }">onPanda: Token-Level Control for LLMs and Agents</b>
        <br>
        <br>
    </div>

    <details @toggle="_onUsageToggle">
        <summary :class="{ 'usage-summary-new': !globalStore.isOldUser }">
            <small style="color: #888;">
                <span v-if="!globalStore.isOldUser" class="usage-summary-arrow" aria-hidden="true">👉 &nbsp;</span>
                <span>{{ t('header.usage') }}</span>:
            </small>
        </summary>
        <br>
        <MarkdownRender
            :content="t('header.readIntroduction', { url: `https://on-panda.github.io/introduction/?lang=${encodeURIComponent(globalStore.currentLocale)}` })" />
        <br>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <video ref="_usageVideo" controls preload="metadata"
            @error.once="$event.currentTarget.src = 'https://on-panda.github.io/img/on-panda-demo-candidate-continue-generating-cn.mp4'"
            style="box-shadow: 0 0px 8px rgba(0, 0, 0, 0.5);width: 406px;max-width: 90%;">
        </video>
        <br>
        <br>
        <MarkdownRender :content="t('header.instruction')" />
        <slot name="customInfoForUser">
        </slot>
    </details>

</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGlobalStore } from '../stores/globalStore.js'
import LanguageSwitcher from './widgets/LanguageSwitcher.vue'
import MarkdownRender from './widgets/MarkdownRender.vue'

const globalStore = useGlobalStore()
const _isLogoRotated = ref(false)
const _usageVideo = ref(null)

const { t } = useI18n()

function _onUsageToggle(event) {
    if (event.currentTarget.open && !_usageVideo.value.getAttribute('src')) {
        _usageVideo.value.src = '/img/on-panda-demo-candidate-continue-generating-cn.mp4'
    }
}
</script>

<style scoped>
.usage-summary-new {
    font-weight: 700;
    font-size: large;
}

.usage-summary-arrow {
    display: inline-block;
    margin-right: 0.25em;
    animation: usage-summary-arrow-bounce 1s ease-in-out infinite;
}

@keyframes usage-summary-arrow-bounce {
    0%,
    100% {
        transform: translateX(0);
    }

    50% {
        transform: translateX(0.35em);
    }
}

@media (prefers-reduced-motion: reduce) {
    .usage-summary-arrow {
        animation: none;
    }
}
</style>
