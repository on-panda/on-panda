import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
export const useGlobalStore = defineStore('global', () => {
    const debug = ref(window.location.href.includes('http://localhost') || window.location.href.includes('http://127.0.0.1'))

    const hooks = ref({ beforeCreateChatCompletion: [] })

    const cleanMode = ref(false)

    const blobUrlToBase64Cache = ref({})

    const messageIndexStatus = ref({})

    return { debug, hooks, cleanMode, blobUrlToBase64Cache, messageIndexStatus }
}
)