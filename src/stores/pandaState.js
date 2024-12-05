import { ref, computed } from 'vue'

const messagesExample = [{ role: "system", content: "" }, { role: "user", content: "1+1=" }, { role: "assistant", content: "Answer is", finish_reason: "length" }]
const dialogExample = {
    messages: messagesExample,
    operation: {
        type: "continue",
        from_candidate: true,
        time: 1733147962,
    },
    info: {
        description: "Uneditable description",
        comment: "editable comment",
        title: "The Title",
    },
    custom: [
        // recommend set null as default value, so could know the value is not set
        {
            name: "annotation_status",
            type: "single_choice",
            value: [
                { name: "done", value: null },
                { name: "skip", value: null },
                { name: "undetermined", value: null },
            ],
            tip: "Annotation status, if not chosen, **default is done**",
            // markdown is supported
            // if tip is too long, you should using a URL to avoid the redundancy in json
            must: false, // default is false
        },
        { // Use single_choice to implement checkbox functionality
            name: "chosen",
            type: "single_choice",
            value: [
                { name: "Y", value: null },
                { name: "N", value: null },
            ],
            tip: "Preference of current messages (chosen or reject), default the last messages is chosen, others are rejected",
        },
        {
            name: "tool_using",
            type: "multiple_choice",
            value: [
                { name: "image", value: null },
                { name: "search", value: null },
                { name: "think", value: null },
                { name: "draw", value: null },
            ],
            tip: "Tools should use in this prompt",
        },
        {
            name: "follow_up_prompt",
            type: "text",
            value: "",
            tip: "What may be the follow up prompt by user?"
        }
    ]
}

var dialogExample0 = {
    operation: {
        type: "send",
    }
}

dialogExample0.messages = [{ role: "user", content: "1+1=" }]

export class PandaStateV1Plane {
    panda = ref({
        historys: [dialogExample0, dialogExample],
    })
    dialogIndex = ref(-1)
    dialog = computed(() => this.panda.value.historys[(this.panda.value.historys.length * 20 + this.dialogIndex.value) % this.panda.value.historys.length])
    switchToNextDialog = () => {
        this.dialogIndex.value = (this.dialogIndex.value + 1) % this.panda.value.historys.length
    }
    switchToPreviousDialog = () => {
        this.dialogIndex.value = (this.dialogIndex.value - 1 + this.panda.value.historys.length) % this.panda.value.historys.length
    }
}

export const pandaState = new PandaStateV1Plane()

// export const panda = ref({
//     historys: [dialogExample0, dialogExample],
// })

// export const dialogIndex = ref(-1)
// export const dialog = computed(() => panda.value.historys[(panda.value.historys.length * 20 + dialogIndex.value) % panda.value.historys.length])


