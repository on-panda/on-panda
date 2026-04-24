import { defineStore } from 'pinia'
import { ref, computed, defineAsyncComponent, markRaw } from 'vue'
import { useEventListener } from '../utils/commonUtils'
import { useI18n } from 'vue-i18n'

export const useGlobalStore = defineStore('onPandaGlobal', () => {
    const debug = ref((window.location.href.includes('http://localhost') || window.location.href.includes('http://127.0.0.1') || window.location.origin.includes("debug")) && document.title.endsWith("onPanda"))

    const isOldUser = ref(localStorage.getItem('onPandaIsOldUser') == 'true')

    const customApiConfigs = ref([])

    const customModelNameTags = ref({})

    const customExampleNameToFunc = ref({}) // exampleFunc(dialogWithControlState)

    const hooks = ref({ beforeCreateChatCompletion: [] })

    const cleanMode = ref(false)

    const enableLocalStorageApiConfigs = ref(true)

    const blobUrlToBase64Cache = ref({})

    const messageIndexStatus = ref({})  // details open status

    const widthRelatedStore = buildWidthRelatedStore()

    const currentLocale = ref(localStorage.getItem('locale') || navigator.language)
    function setLocale(locale) {
        currentLocale.value = locale
        localStorage.setItem('locale', locale)
    }

    const customInfoForUser = ref('')

    const multimodalPlugins = markRaw({
        // type to component(<component content="chunkObject">)
        image_url: {
            component: defineAsyncComponent(() => import('../components/plugins/ImagePlugin.vue'))
        },
        audio_url: {
            component: defineAsyncComponent(() => import('../components/plugins/AudioPlugin.vue'))
        },
        input_audio: {
            component: defineAsyncComponent(() => import('../components/plugins/AudioPlugin.vue'))
        },
    })

    const uuid = ref(null)

    const loadPandaTree = (pandaTree) => {
        messageIndexStatus.value = {}
        for (var blobUrl in blobUrlToBase64Cache.value) {
            URL.revokeObjectURL(blobUrl)
            delete blobUrlToBase64Cache.value[blobUrl]
        }
        uuid.value = pandaTree.uuid
    }
    const { t } = useI18n()

    return { debug, isOldUser, hooks, cleanMode, enableLocalStorageApiConfigs, blobUrlToBase64Cache, messageIndexStatus, customApiConfigs, customModelNameTags, customExampleNameToFunc, currentLocale, setLocale, ...widthRelatedStore, customInfoForUser, multimodalPlugins, uuid, loadPandaTree, t }
}
)

function buildWidthRelatedStore() {
    const maxIsMobileWidth = ref(700)

    const innerWidth = ref(window.innerWidth)
    function handleResize() {
        innerWidth.value = window.innerWidth
    }
    useEventListener(window, 'resize', handleResize)

    const isMobile = computed(() => {
        return innerWidth.value < maxIsMobileWidth.value
    })
    const isMobileByUserAgent = computed(() => {
        return (/Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i).test(navigator.userAgent) && ('ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0)
    })

    return { isMobile, isMobileByUserAgent, innerWidth }
}
