import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
export const useGlobalStore = defineStore('global', () => {
    const debug = ref(window.location.href.includes('http://localhost') || window.location.href.includes('http://127.0.0.1'))

    const isOldUser = ref(localStorage.getItem('onPandaIsOldUser') == 'true')

    const customMetaApiConfigs = ref([])

    const hooks = ref({ beforeCreateChatCompletion: [] })

    const cleanMode = ref(false)

    const blobUrlToBase64Cache = ref({})

    const messageIndexStatus = ref({})

    return { debug, isOldUser, hooks, cleanMode, blobUrlToBase64Cache, messageIndexStatus, customMetaApiConfigs }
}
)