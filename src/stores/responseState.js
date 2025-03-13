import { PandaState } from './pandaState'
import { ref } from 'vue'
export class ResponseState {
    constructor() {
        this.pandaState = new PandaState()
        this.uploadedJson = ref(null)
        this.onPandaContainer = ref(document)
    }
}



