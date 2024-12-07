import { ref, computed } from 'vue'

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
        chosen: null, // if null, the last messages is chosen, others are rejected
        // tip: "Preference of current messages (chosen or reject), default the last messages is chosen, others are rejected",
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
    historys: [dialogExample0, dialogExample],
}

export class PandaState {
    panda = ref({ historys: [{}] })
    dialogIndex = ref(-1)
    dialog = computed(() => this.panda.value.historys[(this.panda.value.historys.length * 20 + this.dialogIndex.value) % this.panda.value.historys.length])
    switchToNextDialog = () => {
        this.dialogIndex.value = (this.dialogIndex.value + 1) % this.panda.value.historys.length
    }
    switchToPreviousDialog = () => {
        this.dialogIndex.value = (this.dialogIndex.value - 1 + this.panda.value.historys.length) % this.panda.value.historys.length
    }
    setExample = () => {
        this.panda.value = pandaExample
        this.dialogIndex.value = 1
    }
}

export const pandaState = new PandaState()

// export const panda = ref({
//     historys: [dialogExample0, dialogExample],
// })

// export const dialogIndex = ref(-1)
// export const dialog = computed(() => panda.value.historys[(panda.value.historys.length * 20 + dialogIndex.value) % panda.value.historys.length])


