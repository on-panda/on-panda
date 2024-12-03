import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const messagesExample = [{ role: "system", content: "" }, { role: "user", content: "1+1=" }, { role: "assistant", content: "answer is", finish_reason: "stop" }]
const dialogExample = {
    message: messagesExample,
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
        {
            name: "annotation_status",
            tip: "annotation status, default is done",
            type: "single_choice", value: "", options: ["done", "skip", "undetermined"],
        },
        {
            name: "tool_using",
            tip: "tools should use in this prompt",
            type: "multiple_choice", value: [
                { name: "image", value: false },
                { name: "search", value: false },
                { name: "think", value: false },
                { name: "draw", value: false },
            ]
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

dialogExample0.message = [{ role: "user", content: "1+1=" }]


const pandaExample = {
    historys: [dialogExample0, dialogExample],
}
export const usePandaStore = defineStore('panda', () => {
    const panda = ref(pandaExample)
    return { panda }
})

