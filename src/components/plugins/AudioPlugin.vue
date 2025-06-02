<template>
    <div class="on-panda-audio-plugin">
        <!-- Waveform container -->
        <div ref="waveformContainer" class="waveform-container"></div>

        <!-- Visible audio controls that sync with waveform -->
        <audio ref="audioElement" :src="audioUrl" controls class="audio-controls" />

        <!-- Fallback message if WaveSurfer fails to load -->
        <div v-if="!waveSurferLoaded && audioUrl" class="fallback-message">
            Waveform visualization unavailable - using audio controls only
        </div>
    </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import WaveSurfer from 'wavesurfer.js'
import Hover from 'wavesurfer.js/dist/plugins/hover.js'

const props = defineProps({
    content: {
        type: Object,
        default: () => ({})
    }
})

// Refs
const waveformContainer = ref(null)
const audioElement = ref(null)
const waveSurferLoaded = ref(false)
let wavesurfer = null

const audioUrl = computed(() => {
    if (props.content.blob_url) {
        return props.content.blob_url
    }
    console.log(props.content)
    return props.content["audio_url"]["url"]
})

const initializeWaveSurfer = () => {
    if (!waveformContainer.value || !audioElement.value || !audioUrl.value) return

    try {
        // Create WaveSurfer instance
        wavesurfer = WaveSurfer.create({
            container: waveformContainer.value,
            waveColor: 'rgba(255, 165, 0, 1)', // Orange
            progressColor: 'rgba(192, 192, 192, 1)', // Light gray
            media: audioElement.value, // This binds to the visible audio element
            normalize: true,
            height: 60,
            plugins: [
                Hover.create({
                    lineColor: '#ff0000',
                    lineWidth: 2,
                    labelBackground: '#555',
                    labelColor: '#fff',
                    labelSize: '11px',
                }),
            ],
        })

        // Add click-to-scrub functionality
        wavesurfer.on('ready', () => {
            waveSurferLoaded.value = true

            waveformContainer.value.addEventListener('click', (e) => {
                const rect = waveformContainer.value.getBoundingClientRect()
                const x = e.clientX - rect.left
                const progress = x / rect.width

                // Seek and play (this will automatically sync with the audio controls)
                wavesurfer.seekTo(progress)
                audioElement.value.play()
            })
        })

        wavesurfer.on('error', (error) => {
            console.error('WaveSurfer error:', error)
            waveSurferLoaded.value = false
        })

    } catch (error) {
        console.error('Failed to initialize WaveSurfer:', error)
        waveSurferLoaded.value = false
    }
}

// Watch for audioUrl changes and reinitialize
watch(audioUrl, () => {
    if (wavesurfer) {
        wavesurfer.destroy()
        wavesurfer = null
        waveSurferLoaded.value = false
    }
    if (audioUrl.value) {
        setTimeout(initializeWaveSurfer, 100) // Small delay to ensure DOM is ready
    }
}, { immediate: false })

onMounted(() => {
    if (audioUrl.value) {
        initializeWaveSurfer()
    }
})

onUnmounted(() => {
    if (wavesurfer) {
        wavesurfer.destroy()
    }
})
</script>

<style scoped>
.on-panda-audio-plugin {
    width: 100%;
    margin-bottom: 10px;
    margin-top: 10px;
    background-color: #f9f9f9;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.waveform-container {
    width: 100%;
    cursor: pointer;
}

.audio-controls {
    width: 100%;
}

.fallback-message {
    font-size: 0.9em;
    color: #666;
    font-style: italic;
    margin-top: 0.5rem;
}
</style>