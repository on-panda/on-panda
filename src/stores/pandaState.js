import { deepCopy } from '@/utils/commonUtils'
import { ref, computed, watchEffect } from 'vue'
// import { hashObjectSHA256Base64 } from '@/utils/commonUtils'

const messagesExample = [{ role: "system", content: "" }, { role: "user", content: "1+1=" }, { role: "assistant", content: "Answer is", finish_reason: "length" }]
const dialogExample = {
    title: "The Title",
    description: "Uneditable description",
    comment: "editable comment",
    messages: messagesExample,
    operation: {
        type: "continue",
        from_candidate: true,
        time: 1733147962,
        prefix_messages_num: 2,
    },
    annotate: {
        is_good: null,  // different from chosen, which will be SFT training data
        // tip: "Preference of current messages (good or bad), default the last messages is good, others are bad",
        customs: [
            // The data structure includes user interface logic
            // recommend set null as default value, so could know the value is not set
            {
                name: "qualified_prompt",
                type: "checkbox",
                checkbox: null,   // support null for default value
                tip: "Is this a qualified prompt?",
            },
            {
                name: "annotation_status",
                type: "single_choice",
                single_choice: [  // why not name, value? because it will confuse with tool.name, ref().value
                    { k: "done", v: null },
                    { k: "skip", v: null },
                    { k: "undetermined", v: null },
                ],
                tip: "Annotation status, if not chosen, **default is done**",
                // markdown is supported
                // if tip is too long, you should using a URL to avoid the redundancy in json
            },
            {
                name: "tool_using",
                type: "multiple_choice",
                multiple_choice: [
                    { k: "image", v: null },
                    { k: "search", v: null },
                    { k: "think", v: null },
                    { k: "draw", v: null },
                ],
                tip: "Tools should use in this prompt",
                required: true, // default is false
            },
            {
                name: "follow_up_prompt",
                type: "text",
                text: "",
                tip: "What may be the follow up prompt by user?"
            }
        ]
    },
}

var dialogExample0 = {
    operation: {
        type: "send",
    }
}

dialogExample0.messages = [{ role: "user", content: "1+1=" }]

var pandaExample = {
    panda_version: "1.0",
    dialogs: { 1: dialogExample0, 2: dialogExample }, // key start from 1
    hash_map: {},  // to support 'hash:4LKUXH3IuMhn4cti0hjpzqcA5Zv0bCZu+zBi2+buU30=' key 要不要加上 hash 前缀？(加上吧，更加一致，也给人一眼看出作用) 为什么不用 obj.hash?(繁琐了，不用)
    deleted_dialogs: {},
}

export class PandaState {
    constructor() {
    }
    registerDialogComputed = (dialogComputed) => {
        this.dialogComputed = dialogComputed
    }
    panda = ref({ dialogs: {} })
    // panda = ref(pandaExample)
    allDialogs = computed(() => ({ ...this.panda.value.dialogs, ...this.panda.value.deleted_dialogs }))
    dialogKeys = computed(() => Object.keys(this.allDialogs.value).map(Number).sort())
    dialogMaxKeyAll = computed(() => this.dialogKeys.value[this.dialogKeys.value.length - 1])
    dialogMaxIndexRemain = computed(() => {
        for (var i = this.dialogKeys.value.length - 1; i >= 0; i--) {
            if ((this.dialogKeys.value[i] in this.panda.value.dialogs)) {
                return i
            }
        }
        return null
    })
    currentDialogIndex = ref(1) // index of dialogKeys
    currentDialogKey = computed(() => {
        var keys = this.dialogKeys.value
        if (keys.length === 0) {
            return null
        }
        return keys[(keys.length * 20 + this.currentDialogIndex.value) % keys.length]
    })
    currentDialogData = computed(() => {
        return this.currentDialogKey.value ? this.allDialogs.value[this.currentDialogKey.value] : {}
    })
    dialogCache = ref(deepCopy(this.currentDialogData.value))
    _ = watchEffect(() => {
        this.dialogCache.value = deepCopy(this.currentDialogData.value)
    })

    switchToNextDialog = () => {
        this.lazyCheck()
        this.currentDialogIndex.value = (this.currentDialogIndex.value + 1) % this.dialogKeys.value.length
    }
    switchToPreviousDialog = () => {
        this.lazyCheck()
        this.currentDialogIndex.value = (this.currentDialogIndex.value - 1 + this.dialogKeys.value.length) % this.dialogKeys.value.length
    }
    setExample = () => {
        this.panda.value = pandaExample
        this.currentDialogIndex.value = 1
    }

    writeBack = () => {
    }
    fork = () => {
    }
    delete = () => {
    }
    undo = () => {
    }
    redo = () => {
    }
    save = () => {
    }
    load = () => {
    }
    lazyCheck = () => {
    }
}


export const pandaState = new PandaState()

// export const panda = ref({
//     historys: [dialogExample0, dialogExample],
// })

// export const dialogIndex = ref(-1)
// export const dialog = computed(() => panda.value.historys[(panda.value.historys.length * 20 + dialogIndex.value) % panda.value.historys.length])


