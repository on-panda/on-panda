import { ref, computed, watch } from 'vue'
import { deepCopy, hashObjectSHA256Base64, dateStringNow } from '../utils/commonUtils.js'
import { dialogDifferent, isFinalRoleModelRole, clearTokenObject } from '../utils/chatUtils.js'
import { stripRuntime } from '../utils/toolUtils.js'
import { useGlobalStore } from './globalStore.js'
import LZString from 'lz-string'


function dumpCacheTree(cacheTree) {
    cacheTree = deepCopy(cacheTree)
    for (var dialogKey in cacheTree) {
        if (cacheTree[dialogKey].tokens) {
            var logprobsTokens = cacheTree[dialogKey].tokens
            var tokenLen = logprobsTokens.length
            for (var tokenIndex = 0; tokenIndex < tokenLen; tokenIndex++) {
                var token = logprobsTokens[tokenIndex]
                clearTokenObject(token)
                if (![0, tokenLen - 1].includes(tokenIndex)) {
                    delete token.model
                    delete token.usage
                }

            }
        }
    }
    const cacheTreeString = JSON.stringify(cacheTree)
    const cacheTreeStringCompressed = LZString.compressToBase64(cacheTreeString)
    // compress effciency test:
    // panda.json with full cache_tree: 6,700 KB
    // return cacheTree  // with cleared cache_tree: 306 KB
    // return cacheTreeString  // with cleared cache_tree string : 136 KB
    // with 'lz-string' LZString.compress(): 27 KB (compressed 0.5%)
    // with 'lz-string-base64' LZString.compressToBase64(): 24 KB (compressed 0.5%)
    return {
        compressed_type: 'lz-string-base64',
        compressed: cacheTreeStringCompressed,
    }
}

var HASH_MAP_LENGTH = 16000
var HASH_TEMPLATE_PREFIX = '<|hash|>'
var HASH_TEMPLATE_REGEX = /^<\|hash\|>([A-Za-z0-9+\/=]+)$/

async function usingHashMapRemoveRedundancy(dumped) {
    // if message's content length or chunk's content length > HASH_MAP_LENGTH, using hash map to remove redundancy
    for (var dialogKey in dumped.dialogs) {
        var dialog = dumped.dialogs[dialogKey]
        for (var message of dialog.messages) {
            if (typeof message.content === 'string' && message.content.length > HASH_MAP_LENGTH) {
                var hash = await hashObjectSHA256Base64(message.content)
                dumped.hash_map[hash] = message.content
                message.content = HASH_TEMPLATE_PREFIX + hash

            } else if (Array.isArray(message.content)) {
                for (var chunk of message.content) {
                    var chunkContent = chunk[chunk.type]
                    if (JSON.stringify(chunkContent).length > HASH_MAP_LENGTH) {
                        var hash = await hashObjectSHA256Base64(chunkContent)
                        dumped.hash_map[hash] = chunkContent
                        chunk[chunk.type] = HASH_TEMPLATE_PREFIX + hash
                    }
                    // TODO mv out
                    delete chunk.blob_url
                }
            }
        }
    }
    return dumped
}

function recoverHashMap(dumped) {
    // work on any dialogs
    function recover(obj) {
        for (var key in obj) {
            if (typeof obj[key] === 'string' && obj[key].match(HASH_TEMPLATE_REGEX)) {
                var hash = obj[key].replace(HASH_TEMPLATE_PREFIX, '')
                obj[key] = dumped.hash_map[hash]
            } else if (Array.isArray(obj[key]) || typeof obj[key] === 'object' && obj[key] !== null) {
                recover(obj[key])
            }
        }
    }
    recover(dumped.dialogs)
    dumped.hash_map = {}
    return dumped
}

const messagesExample = [{ role: "system", content: "" }, { role: "user", content: "give a random float, no other words" }, { role: "assistant", content: "1.27364382", finish_reason: "length" }]
const dialogExample = {
    messages: messagesExample,
    operations: [{ // just example
        operator: "continue_with_chosen",
        from_candidate: true,  // same as no parent?
        // only for DPO RM, without token level signal
        is_new_generated: false,
        time: 1733147962,
        prefix_messages_num: 2,
        parent: "1",  // must be string because its JSON key
        on_policy: true,
    }] && [],
    annotate: {
        is_good: null,  // different from chosen, which will be SFT training data
        // tips: "Preference of current messages (good or bad), default the last messages is good, others are bad",
        customs: [
            // The data structure includes user interface logic
            // recommend set null as default value, so could know the value is not set
            {
                name: "qualified_prompt",
                type: "checkbox",
                checkbox: null,   // support null for default value
                tips: "Is this a qualified prompt?",
            },
            {
                name: "annotation_status",
                type: "single_choice",
                single_choice: [  // why not name, value? because it will confuse with tool.name, ref().value
                    { k: "done", v: null },
                    { k: "skip", v: null },
                    { k: "undetermined", v: null },
                ],
                tips: "Annotation status, if not chosen, **default is done**",
                // markdown is supported
                // if tips is too long, you should using a URL to avoid the redundancy in json
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
                tips: "Tools should use in this prompt",
                required: true, // default is false
            },
            {
                name: "init_model",
                disabled: true, // read only info of current dialog for annotator
                type: "text",
                text: "Llama 3",
                tips: "Which model generates the initial answer of current dialog?",
            },
            {
                name: "follow_up_prompt",
                type: "text",
                text: "",
                tips: "What may be the follow up prompt by user?"
            }
        ]
    },
}

var dialogExample0 = {
    operations: [],
    annotate: deepCopy(dialogExample.annotate),
}

dialogExample0.annotate.customs.map(custom => { custom.disabled = !custom.disabled })

dialogExample0.messages = [{ role: "user", content: "1+1=" }]

var pandaTreeExample = {
    version: "1.0",
    uuid: dateStringNow(true),
    title: "Title of the data",
    description: "Uneditable description for the data",
    comment: "Editable comment",
    dialogs: { "1": dialogExample0, "2": dialogExample }, // key start from 1, must be string because its JSON key
    hash_map: {},  // to support 'hash:4LKUXH3IuMhn4cti0hjpzqcA5Zv0bCZu+zBi2+buU30=' key 要不要加上 hash 前缀？(加上吧，更加一致，也给人一眼看出作用) 为什么不用 obj.hash?(繁琐了，不用)
    deleted_dialogs: {},
}

export class PandaState {
    /* Data and data manipulation */
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
    registerLogprobsTokens = (logprobsTokens) => {
        this.logprobsTokens = logprobsTokens
    }
    currentDialogLogprobsTokens = computed(() => {
        this.currentDialogData.value
        return this.cacheTree[this.currentDialogKey.value]?.tokens || []
    })
    cacheLogprobsTokens = (dialogKey = this.currentDialogKey.value) => {
        if (this.allDialogs.value[dialogKey]?.messages?.length) {
            this.cacheTree[dialogKey] = {
                // the "tokens" field only stores logprobs information, not the data itself. It hasn't been renamed to "logprobsToken" in order to maintain compatibility with legacy data.
                ...this.cacheTree[dialogKey], tokens: deepCopy(this.logprobsTokens.value)
            }
        }
    }

    modelRoles = computed(() => this?.apiConfig?.value?.model_roles || ["assistant"])

    pandaTree = ref({ dialogs: {} })
    // pandaTree = ref(pandaTreeExample)
    allDialogs = computed(() => ({ ...this.pandaTree.value.dialogs, ...this.pandaTree.value.deleted_dialogs }))
    dialogKeys = computed(() => Object.keys(this.allDialogs.value).map(Number).sort((a, b) => a - b))
    dialogKeysRemain = computed(() => this.dialogKeys.value.filter(key => (key in this.pandaTree.value.dialogs)))
    isDeleted = computed(() => this.currentDialogKey.value in (this.pandaTree.value.deleted_dialogs || {}))

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
    parentDialogKey = computed(() => {
        var parentKey = this.currentDialogData.value?.operations?.length ? this.currentDialogData.value.operations[0].parent : null
        return parentKey ? parentKey.toString() : null
    })
    currentDialogData = computed(() => {
        return this.currentDialogKey.value ? this.allDialogs.value[this.currentDialogKey.value] : {}
    })
    dialogCache = ref(deepCopy(this.currentDialogData.value))
    _ = watch(this.currentDialogData, function watchCurrentDialogData(newValue, oldValue) {
        // annotate and comment is saved in time, just ref the value
        this.dialogCache.value = newValue
        // messages should using cache to store current state, so need deep copy
        this.dialogCache.value.messages = newValue.messages ? deepCopy(newValue.messages) : undefined
    }.bind(this), { flush: 'sync' })
    isDialogKeyIsGood = (key) => {
        if (key in this.pandaTree.value.dialogs) {
            if (this.pandaTree.value.dialogs[key]?.annotate?.is_good === null) {
                return this.dialogKeys.value[this.dialogMaxIndexRemain.value] === key
            } else {
                return Boolean(this.pandaTree.value.dialogs[key]?.annotate?.is_good)
            }
        }
        return false
    }
    switchDialogByIndex = (index) => {
        var targetKey = this.dialogKeys.value[this.roundDialogIndex(index)]
        var oldKey = this.currentDialogKey.value
        this.beforeOperation()
        if (oldKey != targetKey) {
            this.currentDialogIndex.value = this.dialogKeys.value.indexOf(targetKey)
        }
    }
    roundDialogIndex = (index) => {
        return (index + this.dialogKeys.value.length) % this.dialogKeys.value.length
    }
    switchToNextDialog = () => {
        var targetIndex = this.currentDialogIndex.value + 1
        for (var i = 0; i < this.dialogKeys.value.length; i++) {
            if (this.dialogKeys.value[this.roundDialogIndex(targetIndex + i)] in this.pandaTree.value.dialogs) {
                this.switchDialogByIndex(targetIndex + i)
                break
            }
        }
    }
    switchToPreviousDialog = () => {
        var targetIndex = this.currentDialogIndex.value - 1
        for (var i = 0; i < this.dialogKeys.value.length; i++) {
            if (this.dialogKeys.value[this.roundDialogIndex(targetIndex - i)] in this.pandaTree.value.dialogs) {
                this.switchDialogByIndex(targetIndex - i)
                break
            }
        }
    }
    setExample = () => {
        this.load(deepCopy(pandaTreeExample))
    }
    setEmpty = () => {
        this.load({
            dialogs: {
                1: {
                    messages: [
                        { role: "system", content: "" },
                        { role: "user", content: "" }],
                    annotate: {
                        is_good: null
                    }
                }
            }
        })
    }
    eraseCurrentDialog = () => {
        this.beforeOperation()
        // if current dialog will erase, default to next dialog or previous dialog
        var currentKey = this.currentDialogKey.value
        var targetKey = this.currentDialogIndex.value == this.dialogKeys.value.length - 1 ? this.dialogKeys.value[this.currentDialogIndex.value - 1] : this.dialogKeys.value[this.currentDialogIndex.value + 1]
        if (this.parentDialogKey.value && this.dialogKeys.value.includes(this.parentDialogKey.value)) {
            targetKey = this.parentDialogKey.value
        }
        this.switchDialogByIndex(this.dialogKeys.value.indexOf(targetKey))
        if (currentKey in this.pandaTree.value.dialogs) {
            delete this.pandaTree.value.dialogs[currentKey]
        } else {
            delete this.pandaTree.value.deleted_dialogs[currentKey]
        }
        delete this.cacheTree[currentKey]
    }
    deleteCurrentDialog = () => {
        this.beforeOperation()
        var currentKey = this.currentDialogKey.value
        if (this.currentDialogKey.value in this.pandaTree.value.dialogs) { // if current dialog is remain(not deleted), default to next remain dialog or previous remain dialog after delete
            var currentDialogRemainIndex = this.dialogKeysRemain.value.indexOf(this.currentDialogKey.value)
            var targetKey = currentDialogRemainIndex == this.dialogKeysRemain.value.length - 1 ? this.dialogKeysRemain.value[currentDialogRemainIndex - 1] : this.dialogKeysRemain.value[currentDialogRemainIndex + 1]

            if (this.parentDialogKey.value && this.dialogKeys.value.includes(this.parentDialogKey.value)) {
                targetKey = this.parentDialogKey.value
            }
            // TODO should switch to next remain dialog?
            // this.switchDialogByIndex(this.dialogKeys.value.indexOf(targetKey))
            this.pandaTree.value.deleted_dialogs[currentKey] = this.pandaTree.value.dialogs[currentKey]
            delete this.pandaTree.value.dialogs[currentKey]
        } else {
            // this.eraseCurrentDialog()
        }
    }
    restoreDeletedDialog = (key) => {
        this.beforeOperation()
        key = key || this.currentDialogKey.value
        if (key in this.pandaTree.value.deleted_dialogs) {
            this.pandaTree.value.dialogs[key] = this.pandaTree.value.deleted_dialogs[key]
            delete this.pandaTree.value.deleted_dialogs[key]
        } else {
            console.log('Warning! restoreDeletedDialog:', key, 'not in deleted_dialogs')
        }
    }
    undo = () => {
    }
    redo = () => {
    }
    dump = async ({ includeCache = true, beforeOperation = true } = {}) => {
        if (beforeOperation) {
            this.beforeOperation()
        }
        this.pandaTree.value.update_time = (new Date()).getTime()
        var dumped = deepCopy(this.pandaTree.value)
        dumped = stripRuntime(dumped)
        dumped = await usingHashMapRemoveRedundancy(dumped)
        if (includeCache) {
            dumped.cache_tree = dumpCacheTree(this.cacheTree)
        }
        // TODO: delete items can be recomputed "is_prompt_modified" "is_response_modified" response_modified_type?
        return dumped
    }
    asPandaTree = (obj) => {
        const isPandaTree = obj.dialogs && Object.keys(obj.dialogs).length && obj.dialogs[Object.keys(obj.dialogs)[0]]?.messages?.length
        if (isPandaTree) {
            return obj
        }

        const isChatCompletionsRequest = obj.messages && obj.messages.length && obj.messages[0].role
        if (isChatCompletionsRequest) {
            const dialog = {
                messages: obj.messages.map(message => ({ ...message })),
                annotate: { is_good: null }
            }
            if ('tools' in obj) {
                dialog.tools = deepCopy(obj.tools)
            }
            return {
                dialogs: {
                    "1": dialog
                }
            }
        }

        const isMessagesList = obj.length && obj[0].length && obj[0][0].role
        if (isMessagesList) {
            obj = obj[0]
        }
        const isMessages = obj.length && obj[0].role


        if (isMessages) {
            return {
                dialogs: {
                    "1": {
                        messages: obj.map(message => ({ ...message })),
                        annotate: { is_good: null }
                    }
                }
            }
        }
    }
    clearCache = () => {
        this.cacheTree = {}
    }
    load = (obj) => {
        var pandaTree = this.asPandaTree(obj)
        pandaTree = this.setDefaultToPandaTree(pandaTree)
        pandaTree = recoverHashMap(pandaTree)
        this.clearCache()
        useGlobalStore().loadPandaTree(pandaTree)
        if (pandaTree.cache_tree) {
            var cacheTree = typeof pandaTree.cache_tree === 'string' ? JSON.parse(pandaTree.cache_tree) : pandaTree.cache_tree
            if (cacheTree.compressed_type === 'lz-string') { // abandon original lz-string `LZString.compress()`, bigger size and has garbled characters
                cacheTree = JSON.parse(LZString.decompress(cacheTree.compressed))
            }
            if (cacheTree.compressed_type === 'lz-string-base64') {
                cacheTree = JSON.parse(LZString.decompressFromBase64(cacheTree.compressed))
            }
            delete pandaTree.cache_tree
            this.cacheTree = cacheTree
        }
        this.pandaTree.value = pandaTree
        // this.switchDialogByIndex(this.dialogMaxIndexRemain)  // Will fork by is_prompt_modified=true, may by dialogComputed update not in time?
        this.currentDialogIndex.value = this.dialogMaxIndexRemain.value
    }
    setDefaultToPandaTree = (pandaTree) => {
        pandaTree = pandaTree || this.pandaTree.value
        const defaultPandaTree = {
            version: "2.0",  // support hash map
            uuid: dateStringNow(true),
            dialogs: {},
            hash_map: {},
            deleted_dialogs: {},
            update_time: null,  //  int, last save timestamp, automatically set by on-panda. Could be used to infer whether this data ever been saved.
        }
        for (var key in defaultPandaTree) {
            if (!(key in pandaTree)) {
                pandaTree[key] = defaultPandaTree[key]
            }
        }
        delete pandaTree.tool_configs

        for (var dialogsKey of ['dialogs', 'deleted_dialogs']) {
            for (var key in pandaTree[dialogsKey]) {
                var dialog = pandaTree[dialogsKey][key]
                // set operations default value
                if (!dialog.operations) {
                    dialog.operations = []
                }
                // set is_good default when has annotate
                if (dialog.annotate && !('is_good' in dialog.annotate)) {
                    dialog.annotate.is_good = null
                }
                for (var message of dialog.messages) {
                    if (typeof message.reasoning_content === 'string' && !('reasoning' in message)) {
                        message.reasoning = message.reasoning_content
                    }
                    delete message.reasoning_content
                    if (message.name === null) {
                        delete message.name
                    }
                    if (message.tool_calls) {
                        for (var [toolCallIndex, toolCall] of message.tool_calls.entries()) {
                            if (toolCall.index == null) {
                                toolCall.index = toolCallIndex
                            }
                        }
                    }
                }
            }
        }
        return pandaTree
    }

    // Sync the current UI state before a new action starts.
    // Usually call this right before mutating messages/tokens, switching dialogs, dumping, or stopping generation.
    // This may write back or fork immediately when the current UI already differs from the stored dialog.
    // Normally do not pass `operation`; use `nextNotSameOperationCache` when the next auto flush needs a real operator.
    beforeOperation = (operation = null) => {
        // Usually shouldn't set opration, if have to, using this.nextNotSameOperationCache
        this.autoFork(operation) // Usually response_modified_type === 'same', and do nothing
    }

    // Finalize a just-applied action after messages/tokens have already been changed.
    // Usually pair it with `beforeOperation()` around one user action: `before` flushes the old UI state,
    // then `after` records the current action and decides whether to write back or fork.
    // `forceFork` is only for actions that must keep an explicit child branch even if autoFork could write back.
    afterOperation = (operation, forceFork = false) => {
        operation = this.setDefaultToOperation(operation)

        if (operation.operator == 'edit_prompt' && !operation.is_prompt_modified && ["continued", "same"].includes(operation.response_modified_type)) {
            // special case, because edit_prompt could happend during generating
            // TODO rm this condition
            return this.doNothing(operation)
        }

        if (!operation.is_prompt_modified && !operation.is_response_modified) {
            this.doNothing(operation)
        } else if (forceFork) {
            this.fork(operation)
        } else {
            this.autoFork(operation)
        }
    }

    setDefaultToOperation = (operation) => {
        const diff = dialogDifferent(this.currentDialogData.value, this.dialogComputed.value)
        // console.log('diff:', diff)

        var defaultOperation = {
            time: Date.now(),
            parent: String(this.currentDialogKey.value),
        }
        if (operation.on_policy) {
            // Snapshot the generation config for on-policy operations so the branch is reproducible.
            defaultOperation.chat_config = deepCopy(this.apiConfig.value.chat_config)
            var NONE_USEFUL_CHAT_CONFIG_ITEMS = ['stream', 'logprobs', 'top_logprobs', 'stream_options', 'messages']
            for (var key of NONE_USEFUL_CHAT_CONFIG_ITEMS) {
                if (key in defaultOperation.chat_config) {
                    delete defaultOperation.chat_config[key]
                }
            }
        }
        return Object.assign(defaultOperation, diff, operation)
    }

    // Persist the current diff using the branching policy.
    // Common result:
    // - on-policy prompt change => fork
    // - on-policy continued/add_response => write back to the same dialog
    // - off-policy edit => write back to the same dialog
    // - no actual diff => do nothing
    // Note that tool changes are part of the prompt diff, so changing tools can also trigger a fork.
    autoFork = (operation) => {
        // if operation is not set, use nextNotSameOperationCache
        // if response_modified_type === 'same', do nothing and not append operation
        var isDefaultOperation = !Boolean(operation)
        if (isDefaultOperation && this.nextNotSameOperationCache) {
            operation = this.nextNotSameOperationCache
            isDefaultOperation = false
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
                const WRITE_BACK_TYPES = ['continued', 'add_response', 'no_response']
                if (!operation.is_response_modified) {
                    this.doNothing()
                } else if (WRITE_BACK_TYPES.includes(operation.response_modified_type)) {
                    if (isDefaultOperation) {
                        this.writeBack()
                    } else {
                        this.writeBack(operation)
                    }
                } else { // 'delete_response', 'truncated', 'bifurcation'
                    this.fork(operation)
                }
            }
        } else {
            if (operation.is_prompt_modified || operation.is_response_modified) {
                const _op = this.previousOperation.value
                if (_op && Object.keys(_op).includes('is_prompt_modified') && (operation.is_prompt_modified !== _op?.is_prompt_modified || operation.is_response_modified !== _op?.is_response_modified)) {
                    this.fork(operation)
                } else {
                    this.writeBack(operation)
                }
            } else {
                this.doNothing()
            }
        }
    }
    doNothing = (operation) => {
        const MUST_RECORD_OPERATOR_LIST = ['generate_new']
        if (MUST_RECORD_OPERATOR_LIST.includes(operation?.operator)) {
            this.currentDialogData.value.operations.push(operation)
        }
        this.cacheLogprobsTokens()
    }
    writeBack = (operation) => {
        var newDialog = deepCopy(this.dialogComputed.value)
        if (operation) {
            newDialog.operations.push(operation)
        }
        this.cacheLogprobsTokens()
        this.pandaTree.value.dialogs[this.currentDialogKey.value] = newDialog
        // console.trace('write back:', this.currentDialogKey.value, operation)
    }
    fork = (operation) => {
        var newDialog = deepCopy(this.dialogComputed.value)
        newDialog.operations = operation ? [operation] : []
        if ('is_good' in (newDialog.annotate || {})) {
            // when fork, if has is_good key, reset it to default
            newDialog.annotate.is_good = null
        }
        // console.trace('fork:', this.currentDialogKey.value, '->', this.dialogMaxKeyAll.value + 1, operation)
        const newDialogKey = this.dialogMaxKeyAll.value + 1
        this.pandaTree.value.dialogs[newDialogKey] = newDialog
        this.cacheLogprobsTokens(newDialogKey)  // copy logprobsTokens to new dialog before switch
        this.currentDialogIndex.value = this.dialogKeys.value.indexOf(newDialogKey)

        // will throw recursion error
        // this.switchDialogByIndex(this.dialogKeys.value.length-1)
    }
    previousOperation = computed(() => this.currentDialogData.value.operations[this.currentDialogData.value.operations.length - 1])
    // `on_policy` means the dialog still follows the original prompt -> model generation path.
    // Typical `on_policy: true` operations are generate/continue/tool-call/new-round flows.
    // Typical `on_policy: false` operations are manual prompt/response edits or manual branching.
    // For an init dialog without operations, a final model-role message is treated as on-policy.
    isPreviousOperationOnPolicy = computed(() => {
        // if belong init dialog and no operations, default on_policy:true
        if (!this.currentDialogData.value?.operations?.length) {
            if (isFinalRoleModelRole(this.currentDialogData.value?.messages, this.modelRoles.value)) {
                return true
            } else {
                return false
            }
        }
        return this.previousOperation.value?.on_policy
    })

    setCurrentIsGood = (value, onlyReplaceNull, skipEmptyAnnotate) => {
        if (onlyReplaceNull && this.dialogCache.value?.annotate?.is_good !== null) {
            return
        }
        if (typeof this.dialogCache.value.annotate !== "object") {
            if (skipEmptyAnnotate) {
                return
            }
            this.dialogCache.value.annotate = {}
        }
        this.dialogCache.value.annotate.is_good = value
    }
}

export const pandaState = new PandaState()

export const uploadedJson = ref(null)

// export const panda = ref({
//     historys: [dialogExample0, dialogExample],
// })

// export const dialogIndex = ref(-1)
// export const dialog = computed(() => panda.value.historys[(panda.value.historys.length * 20 + dialogIndex.value) % panda.value.historys.length])
