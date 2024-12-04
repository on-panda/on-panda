import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
export const useGlobalStore = defineStore('global', () => {
    const hooks = ref({ beforeCreateChatCompletion: [] })

    return { hooks }
}
)