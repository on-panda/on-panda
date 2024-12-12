import { ref, computed, watchEffect } from 'vue'
import { deepCopy, hashObjectSHA256Base64, dateStringNow } from '@/utils/commonUtils'
import { messagesDifferent, tokensToSeq } from '@/utils/chatUtils'

const messagesExample = [{ role: "system", content: "" }, { role: "user", content: "1+1=" }, { role: "assistant", content: "Answer is", finish_reason: "length" }]
const dialogExample = {
    title: "The Title",
    description: "Uneditable description",
    comment: "Editable comment",
    messages: messagesExample,
    operations: [{
        operator: "continue_with_chosen",
        from_candidate: true,
        time: 1733147962,
        prefix_messages_num: 2,
        parent: 1,
        on_policy: true,
    }],
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
    operations: [{
        type: "send",
    }],
    annotate: deepCopy(dialogExample.annotate),
}

dialogExample0.messages = [{ role: "user", content: "1+1=" }]

var pandaTreeExample = {
    version: "1.0",
    uuid: dateStringNow(true),
    dialogs: { 1: dialogExample0, 2: dialogExample }, // key start from 1
    hash_map: {},  // to support 'hash:4LKUXH3IuMhn4cti0hjpzqcA5Zv0bCZu+zBi2+buU30=' key 要不要加上 hash 前缀？(加上吧，更加一致，也给人一眼看出作用) 为什么不用 obj.hash?(繁琐了，不用)
    deleted_dialogs: {},
}

export class PandaState {
    cacheTree = {}
    uuid = computed(() => (this.pandaTree.uuid || dateStringNow(true)))
    constructor() {
    }
    registerDialogComputed = (dialogComputed) => {
        this.dialogComputed = dialogComputed
    }
    registerApiConfig = (apiConfig) => {
        this.apiConfig = apiConfig
    }
    registerTokens = (tokens) => {
        this.tokens = tokens
    }
    tryRestoreTokens = () => {
        // TODO finish
        var tokensCache = this.cacheTree[this.currentDialogKey.value]?.tokens
        if (this.tokens?.value?.length && tokensCache) {
            var seqNow = tokensToSeq(this.tokens.value)
            var seqCache = tokensToSeq(tokensCache)
            if (seqNow === seqCache) {
                this.tokens.value.length = 0
                this.tokens.value.push(...tokensCache)
            } else {
                console.log('Warning! When tryRestoreTokens, unexpected seqNow !== seqCache:', seqNow === seqCache, '\n', seqNow, '\n----\n', seqCache, '\npruned now:', this.tokens.value.filter(token => token.pruned).length, 'pruned cache:', tokensCache.filter(token => token.pruned).length)
            }
        }
    }
    cacheTokens = () => {
        // console.log('cacheTokens:', tokensToSeq(this.tokens.value), 'pruned:', this.tokens.value.filter(token => token.pruned).length)
        this.cacheTree[this.currentDialogKey.value] = {
            ...this.cacheTree[this.currentDialogKey.value], tokens: deepCopy(this.tokens.value)
        }
    }

    modelRoles = computed(this?.apiConfig?.value?.model_roles || ["assistant"])

    pandaTree = ref({ dialogs: {} })
    // pandaTree = ref(pandaTreeExample)
    allDialogs = computed(() => ({ ...this.pandaTree.value.dialogs, ...this.pandaTree.value.deleted_dialogs }))
    dialogKeys = computed(() => Object.keys(this.allDialogs.value).map(Number).sort((a, b) => a - b))
    dialogMaxKeyAll = computed(() => this.dialogKeys.value[this.dialogKeys.value.length - 1])
    dialogMaxIndexRemain = computed(() => {
        for (var i = this.dialogKeys.value.length - 1; i >= 0; i--) {
            if ((this.dialogKeys.value[i] in this.pandaTree.value.dialogs)) {
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
        // annotate and comment is saved in time, just ref the value
        this.dialogCache.value = this.currentDialogData.value
        // messages should using cache to store current state, so need deep copy
        this.dialogCache.value.messages = this.currentDialogData.value.messages ? deepCopy(this.currentDialogData.value.messages) : undefined
    })

    switchDialogByIndex = async (index) => {
        var oldIndex = this.currentDialogIndex.value
        this.beforeOperation()
        if (oldIndex != index) {
            // setTimeout(this.tryRestoreTokens)
            this.currentDialogIndex.value = (index + this.dialogKeys.value.length) % this.dialogKeys.value.length
        }
        // this.tryRestoreTokens()
    }
    switchToNextDialog = async () => {
        await this.switchDialogByIndex(this.currentDialogIndex.value + 1)
    }
    switchToPreviousDialog = async () => {
        await this.switchDialogByIndex(this.currentDialogIndex.value - 1)
    }
    setExample = () => {
        this.pandaTree.value = pandaTreeExample
        this.currentDialogIndex.value = 1
    }
    writeBack = (operation) => {
        var newDialog = deepCopy(this.dialogComputed.value)
        if (operation) {
            newDialog.operations.push(operation)
        }
        this.pandaTree.value.dialogs[this.currentDialogKey.value] = newDialog
    }
    fork = (operation) => {
        var newDialog = deepCopy(this.dialogComputed.value)
        newDialog.operations = operation ? [operation] : []
        this.pandaTree.value.dialogs[this.dialogMaxKeyAll.value + 1] = newDialog

        this.currentDialogIndex.value = this.dialogKeys.value.indexOf(this.dialogMaxKeyAll.value)

        // will throw recursion error
        // this.switchDialogByIndex(this.dialogKeys.value.length-1)
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
    // default on_policy:true
    isPreviousOperationOnPolicy = computed(() => (!this.currentDialogData.value?.operations?.length) || this.currentDialogData.value.operations[this.currentDialogData.value.operations.length - 1].on_policy)
    beforeOperation = (operation) => {
        this.cacheTokens()
        this.autoFork(operation)
    }

    setDefaultToOperation = (operation) => {
        const diff = messagesDifferent(this.currentDialogData.value.messages, this.dialogComputed.value.messages)
        // console.log('diff:', diff)
        return Object.assign({
            time: Date.now(),
            parent: this.currentDialogKey.value,
        }, diff, operation)
    }

    autoFork = (operation) => {
        var isDefaultOperation = !Boolean(operation)
        if (isDefaultOperation && this.nextNotSameOperationCache) {
            operation = this.nextNotSameOperationCache
        }
        delete this.nextNotSameOperationCache
        operation = operation || { operator: "auto", on_policy: this.isPreviousOperationOnPolicy.value }
        if (!operation.response_modified_type) {
            operation = this.setDefaultToOperation(operation)
        }
        if (this.isPreviousOperationOnPolicy.value || operation.on_policy) {
            if (operation.is_prompt_modified) {
                this.fork(operation)
            } else {
                const WRITE_BACK_TYPES = ['continued', 'no_response']
                if (operation.response_modified_type === 'same') {
                    // do nothing
                }
                else if (WRITE_BACK_TYPES.includes(operation.response_modified_type)) {
                    this.writeBack(operation)
                } else {
                    this.fork(operation)
                }
            }
        } else {
            this.writeBack(operation)
        }
    }

    afterOperation = (operation, forceFork = true) => {
        this.setDefaultToOperation(operation)

        // default is on_policy:true
        if (this.isPreviousOperationOnPolicy.value || operation.on_policy) {
            forceFork ? this.fork(operation) : this.autoFork(operation)
        } else {
            this.writeBack(operation)
        }
    }
    lazyCheck = async () => {
        var hashComputed = await hashObjectSHA256Base64(this.dialogComputed.value)
        var hashCurrent = await hashObjectSHA256Base64(this.currentDialogData.value)
        console.log('Change:', hashComputed == hashCurrent)
        console.log(hashComputed, hashCurrent)
        console.log(this.dialogComputed.value)

        if ("autoFork" && false) {
            const isFinalRoleModelRoleComputed = isFinalRoleModelRole(this.dialogComputed.value.messages)
            const isFinalRoleModelRoleCurrent = isFinalRoleModelRole(this.currentDialogData.value.messages)
            if (!isFinalRoleModelRoleCurrent) {
                this.writeBack()
            } else if (!isFinalRoleModelRoleComputed) {
                this.fork()
            } else { // both final role is model role
                const promptDiff = messagesDifferent(getPromptMessages(this.dialogComputed.value.messages), getPromptMessages(this.currentDialogData.value.messages))
                const responeDiff = messageDifferent(getResponeMessages(this.dialogComputed.value.messages), getResponeMessages(this.currentDialogData.value.messages))

                var isPreviousResponseOnPolicy
                var isNewResponseOnPolicy
                if (promptDiff.isDifferent) {
                    if (isPreviousDialogOnPolicy) {
                        this.fork()
                    } else {
                        this.writeBack()
                    }
                } else {
                    if (responeDiff.diffType === "bifurcation") {
                        this.writeBack()
                    }

                    if (isNewResponseOnPolicy) {

                    }
                }

                // if new message, fork

                // if both have new message, write back?

                // if prompt same, respone same, do nothing

                // if prompt different, respone same, write back?

                // if respone different, but contiuned write back

                // if respone different, but truncated, fork? (different of EOT and not EOT)

                // if respone different, forked, fork

            }
        }
    }
}


export const pandaState = new PandaState()

// export const panda = ref({
//     historys: [dialogExample0, dialogExample],
// })

// export const dialogIndex = ref(-1)
// export const dialog = computed(() => panda.value.historys[(panda.value.historys.length * 20 + dialogIndex.value) % panda.value.historys.length])


