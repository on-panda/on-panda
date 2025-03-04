<template>
    <div class="LanguageSwitcher" style="text-align: right; margin-bottom: -15px;">
        <LanguageSwitcher />
    </div>
    <details>
        <summary>
            <small style="color: #888;">{{ $t('header.asDataAnnotator') }}:</small>
        </summary>
        <h2>onPanda: on-Policy Alignment Data Annotator</h2>
        <code>{{ $t('header.dataAnnotatorDesc') }}</code>
    </details>

    <details>
        <summary>
            <small style="color: #888;">{{ $t('header.asWritingTool') }}:</small>
        </summary>
        <h2>onPanda: LLM-Native Collaborative Writing Tool </h2>
        <code>{{ $t('header.writingToolDesc') }}</code>
    </details>

    <div style="text-align: center;">
        <img width="128" :src="logoImageUrl"
            :style="{ transform: _isLogoRotated ? 'rotate(360deg)' : 'rotate(0deg)', transition: 'transform 3s' }"
            @click="_isLogoRotated = !_isLogoRotated" />
        <br>
        <b :style="globalStore.isMobile ? {} : { fontSize: '20px' }">onPanda: LLM-Native Interaction Design</b>
        <br>
        <br>
    </div>

    <details>
        <summary>
            <small style="color: #888;">{{ $t('header.usage') }}:</small>
        </summary>
        <br>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <img :src="demoGifUrl" loading="lazy"
            style="box-shadow: 0 0px 8px rgba(0, 0, 0, 0.5);width: 406px;max-width: 90%;">
        <br>
        <br>
        Usage:<br>
        <b>Basic Features:</b><br>
        - Hover over any word to see alternative suggestions<br>
        - Click a suggestion to continue generating from that point<br>
        - Double-click any word to manually edit and continue<br>
        - Select text to edit or let AI optimize it<br>

        <b>Advanced Features:</b><br>
        - Paste images directly for visual language model support<br>
        - Single-click image to enlarge, double-click to open<br>
        - Double-click role labels to edit them<br>
        - Hold down the `Alt` key while clicking to copy the content of the suggestion.<br>

        <br><b>Beginner's tips:</b>
        <br>
        - You can try any button freely, except save button.<br>
        - Recommend clicking on all the examples below once.<br>
    </details>

</template>

<script setup>
// static relative asset path
import logoImageUrl from '../../public/img/on-panda-logo.png';
import demoGifUrl from '../../public/img/onPanda-demo-candidate.gif';

import { ref } from 'vue'
import { useGlobalStore } from '@/stores/globalStore'
import LanguageSwitcher from './LanguageSwitcher.vue'

const globalStore = useGlobalStore()
const _isLogoRotated = ref(false)
</script>
