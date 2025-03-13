import { PandaState } from './pandaState'
import { ref } from 'vue'

export const ResponseStateClassWithoutThis = () => {
    // using closure as class to avoid using 'this'
    const pandaState = new PandaState()
    const uploadedJson = ref(null)
    const onPandaContainer = ref(document)
    return {
        pandaState,
        uploadedJson,
        onPandaContainer,
    }
}



