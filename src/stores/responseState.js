import { ref, computed, toValue, watch, isRef } from 'vue'
import { ElMessage } from 'element-plus'
import { deepEqual, ObjctKeyToCamelCaseNaming, p, deepCopy, buildMockObject, safeArrayExtend } from '../utils/commonUtils.js'
import { tokensToSeq, convertMessageToTokens, normalizeRequest, recordAsRejectedToken, mergeTwoDeltas, filterEmptyMessage } from '../utils/chatUtils.js'
import { OpenAI, splitMultiTokensChunk } from '../utils/fetchOpenaiApi.js'

import { useGlobalStore } from './globalStore.js'
import { PandaState } from './pandaState.js'
import { WarningState } from './warningState.js'
import { defaultApiConfig, CONTINUE_PROMPT } from './controlParameterState.js'

export const defaultMessages = [{ role: "system", content: "" }, { role: "user", content: "" }]

export function ResponseStateClosure({ messages = null, apiConfig = null } = {}) {
    /*
    A large core class:
    - Operation-related items should be placed in the operationCenter
    - Data-related items should be placed in the pandaState
    - UI-related items should be placed in setup functions of OnPandaResponseText.vue
    
    * using closure as class to avoid using 'this'
    * both messages and apiConfig support ref or raw
    */
    const globalStore = useGlobalStore()
    const { t } = globalStore

    var messages = isRef(messages) ? messages : ref(messages || deepCopy(defaultMessages))
    var apiConfig = isRef(apiConfig) ? apiConfig : ref(apiConfig || deepCopy(defaultApiConfig))

    const pandaState = new PandaState()
    const uploadedJson = ref(null)
    const onPandaContainerRef = ref(document)

    const tokens = ref([])
    const promptLogprobsTokens = ref([])

    // set rawPromptLogprobsTokens only when this responseState is promptLogprobsState
    const rawPromptLogprobsTokens = ref([])
    const isPromptLogprobsState = computed(() => {
        return rawPromptLogprobsTokens.value.length > 0
    })

    const requestStatus = ref({
        requestTimes: 0,
        generating: false,
    })

    function loadMessagesToCurrentDialogUi(newMessages) {
        if (newMessages[newMessages.length - 1].role == "assistant") {
            var lastMessage = newMessages[newMessages.length - 1]
            var isEqual = deepEqual(finalMessage.value, lastMessage)
            if (!isEqual) {
                tokens.value = []
                var newTokens = convertMessageToTokens(lastMessage)
                tokens.value = newTokens
            }
            newMessages = newMessages.slice(0, newMessages.length - 1)
        } else {
            tokens.value = []
        }
        messages.value = newMessages
    }


    function modifyRequest(requestBody, apiConfig) {
        apiConfig = toValue(apiConfig)
        var body = normalizeRequest(requestBody)
        if (isPromptLogprobsState.value) {
            delete body.tools
        }
        for (let message of body.messages) {
            if (typeof message.content === "object") {
                for (let chunk of message.content) {

                    // set image_detail_level
                    if (chunk.type.indexOf('image') != -1) {
                        if (apiConfig.image_detail_level) {
                            chunk[chunk.type].detail = apiConfig.image_detail_level
                        }
                    }
                }
            }
        }
        return body
    }

    async function requestLlmServer(messages) {
        messages = toValue(messages)
        const modelRoles = apiConfig.value?.model_roles || ["assistant"]
        const continue_final_message = modelRoles.includes(messages[messages.length - 1].role)
        if (continue_final_message) { // if continue_final_message, not filter the final message with role
            messages = filterEmptyMessage(messages.slice(0, messages.length - 1)).concat([
                messages[messages.length - 1],
            ])
        } else {
            messages = filterEmptyMessage(messages)
        }
        var body = JSON.parse(JSON.stringify(apiConfig.value.chat_config))
        if (continue_final_message) {
            var lastMessageContent = messages[messages.length - 1].content
            var prefillTokensNumber = tokens.value.filter(token => !token.pruned).length
            if (apiConfig.value.support_continue_final_message) {
                body.add_generation_prompt = false
                // body['chat_template_kwargs'] = { continue_final_message: continue_final_message }
                body['continue_final_message'] = continue_final_message
                body['echo'] = false
                if (apiConfig.value.chat_config.model.toLowerCase().indexOf("kimi") != -1) {
                    // for kimi-api
                    messages[messages.length - 1]['partial'] = true
                }
            } else {
                if (lastMessageContent.length < 20000000) {
                    messages = messages.concat([
                        { role: "user", content: CONTINUE_PROMPT },
                    ])
                } else {  // not using
                    var middleIndex = Math.floor(lastMessageContent.length / 2)
                    messages = messages.slice(0, messages.length - 1).concat([
                        { role: "assistant", content: lastMessageContent.slice(0, middleIndex) },
                        { role: "user", content: CONTINUE_PROMPT },
                        { role: "assistant", content: lastMessageContent.slice(middleIndex) },
                        { role: "user", content: CONTINUE_PROMPT },
                    ])
                }
            }
        }
        body.messages = messages

        requestStatus.value.generating = true
        requestStatus.value.requestTimes++
        var requestID = requestStatus.value.requestTimes
        var requestModel = apiConfig.value.chat_config.model

        const fetchController = new AbortController();

        var FIRST_TOKEN_TIMEOUT_SECOND = 5 * 60
        let firstTokenTimeoutId = setTimeout(() => {
            var errorMessage = `No.${requestID} request: First token timeout error: >= ` + FIRST_TOKEN_TIMEOUT_SECOND + ` seconds, abort request to model: ${requestModel}.`
            fetchController.abort(errorMessage)
            var error = new Error(errorMessage);
            warning(error)
        }, FIRST_TOKEN_TIMEOUT_SECOND * 1000);

        var concatTokens = () => { }

        try {
            const openai = new OpenAI(ObjctKeyToCamelCaseNaming(apiConfig.value.client_config))
            var requestBody = modifyRequest(body, apiConfig.value)  // deepCopyed
            var stream = await openai.chat.completions.create(requestBody, { signal: fetchController.signal });
            stream = splitMultiTokensChunk(stream)

            var tokenIndex = 0
            var streamIndex = -1
            var generatedContent = ""
            var tokensValuePtr = tokens.value

            var tokenBatch = []
            var isTokensConcatLocked = false
            for await (const chunk of stream) {
                if ("error" in chunk) {
                    throw new Error(JSON.stringify(chunk))
                }
                if (requestID !== requestStatus.value.requestTimes) {
                    console.log(new Error(`Request ID mismatch ${requestID} !== ${requestStatus.value.requestTimes}, stope request ID ${requestID}`))

                    fetchController.abort()  // tell server to stop generating for saving resource
                    return
                }
                if (!requestStatus.value.generating) {
                    fetchController.abort()
                    return
                }
                if (continue_final_message && !tokenIndex) { // before affect to tokens
                    // to remove the last token's finish_reason
                    if (tokens.value.length) {
                        // at least remain first token for role
                        while (tokens.value[tokens.value.length - 1].delta.content === "" && tokens.value.length > 1) {
                            tokens.value.pop()
                        }
                        delete tokens.value[tokens.value.length - 1].finish_reason
                    }
                    // remove all pruned tokens
                    tokens.value = tokens.value.filter(token => !token.pruned)
                    tokensValuePtr = tokens.value
                    tokenIndex = tokens.value.length
                    if (!chunk?.choices[0]?.delta?.content) {
                        continue  // if first chunk only not has content, no more role for continue_final_message
                    }
                }
                if (!chunk?.choices?.length) {  // set usage and model if noly in last token
                    if (chunk.usage) {
                        if (tokenBatch.length) {
                            tokenBatch[tokenBatch.length - 1].usage = chunk.usage
                        } else if (tokensValuePtr.length) {
                            tokensValuePtr[tokensValuePtr.length - 1].usage = chunk.usage
                        }
                    }
                    if (chunk.model) {
                        if (tokenBatch.length) {
                            tokenBatch[tokenBatch.length - 1].model = chunk.model
                        } else if (tokensValuePtr.length) {
                            tokensValuePtr[tokensValuePtr.length - 1].model = chunk.model
                        }
                    }
                    continue
                }
                var token = chunk.choices[0];
                if (!token?.delta) {
                    continue
                }
                for (var reasoning_key of ["reasoning", "reasoning_content"]) {
                    if (reasoning_key in token.delta) {
                        break
                    }
                }
                if (!token.delta?.content && token.delta?.[reasoning_key]) {
                    // handle reasoning_content item for DeepSeek R1
                    token.delta.content = token.delta[reasoning_key]
                    delete token.delta[reasoning_key]
                    token.isReasoningContent = true
                }
                streamIndex++
                if (streamIndex === 0) { // first token
                    clearTimeout(firstTokenTimeoutId)
                }
                if (continue_final_message && streamIndex <= 1 && token.delta.content == lastMessageContent) {
                    // avoid vllm echo bug https://github.com/vllm-project/vllm/issues/10111
                    // TODO: remove this after vllm fix the bug
                    continue
                }
                token.tokenIndex = tokenIndex
                if (chunk.model) {
                    token.model = chunk.model
                }
                if (chunk.usage) {
                    token.usage = chunk.usage
                }

                if (chunk.choices) {
                    tokenIndex++
                    if (tokens.value.length) {
                        const lastToken = tokens.value[tokens.value.length - 1]
                        if (lastToken.pruned) {
                            token.pruned = lastToken.pruned
                        }
                    }
                    tokenBatch.push(token)

                    // using batch to concat tokens to reduce compute complexity and avoid stuck main thread when generating super long CoT
                    var concatTokens = () => {
                        if (tokenBatch.length > 0) {
                            console.assert(tokensValuePtr === tokens.value)
                            safeArrayExtend(tokensValuePtr, tokenBatch)
                            tokenBatch = []
                        }
                    }
                    // concat tokens with a delay, the delay is based on the number of tokens
                    if (!isTokensConcatLocked) {
                        isTokensConcatLocked = true
                        concatTokens()
                        setTimeout(() => {
                            isTokensConcatLocked = false
                        }, Math.min(1000, 1000 * (tokensValuePtr.length || 0) / 8192))
                    }

                    // try remove duplicated prefill tokens for API not support continue_final_message
                    generatedContent += token?.delta?.content || ""
                    if (continue_final_message && !apiConfig.value.support_continue_final_message) {
                        if (generatedContent === lastMessageContent) {
                            warning("API not support continue_final_message, remove duplicated prefill tokens")
                            generatedContent = ""
                            tokenIndex = 0
                            if (tokens.value === tokensValuePtr) {
                                tokens.value = tokens.value.slice(0, prefillTokensNumber)
                                tokensValuePtr = tokens.value
                            } else {
                                tokensValuePtr = tokens.value.slice(0, prefillTokensNumber)
                            }
                        }
                    }
                    // p(token.delta?.content, token)
                }
            }
            concatTokens()
            if (tokens.value.length > 2) {  // workround for last token is empty and only have finish_reason
                const lastToken = tokens.value[tokens.value.length - 1]
                const lastToken2 = tokens.value[tokens.value.length - 2]
                if (lastToken.finish_reason && !lastToken.logprobs && lastToken2.logprobs) {
                    lastToken2.finish_reason = lastToken.finish_reason
                    for (var key in ['stop_reason', 'usage']) {
                        if (lastToken[key]) {
                            lastToken2[key] = lastToken[key]
                        }
                    }
                    tokens.value.pop()
                }
            }
            requestStatus.value.generating = false
            // operations according to finish_reason
            var finishReason = finalMessage.value.finish_reason

            if (["user", "tool"].includes(newRoundMessage.value.role)) {
                newRoundMessage.value.role = finishReason == "tool_calls" ? "tool" : "user"
            }
            if (finishReason == "tool_calls") {
                newRoundMessage.value.tool_call_id = finalMessage.value.tool_calls[0].id
                newRoundMessage.value.name = finalMessage.value.tool_calls[0].function.name
            } else {
                delete newRoundMessage.value.tool_call_id
                delete newRoundMessage.value.name
            }

        } catch (error) {
            requestStatus.value.generating = false
            warning(error)
            clearTimeout(firstTokenTimeoutId)
            throw error
        }
    }


    async function requestPromptLogprobs() {
        // TODO auto run when chat_config is changed?
        // may delete the stop/<EOT> token
        // on_policy
        var messages = messagesComputed.value
        messages = filterEmptyMessage(messages)
        console.assert(messages[messages.length - 1].role == "assistant", "last message should be assistant", messages)

        var body = JSON.parse(JSON.stringify(apiConfig.value.chat_config))
        delete body.stream
        delete body.stream_options

        body.messages = messages
        body.model = apiConfig.value.chat_config.model
        body.temperature = apiConfig.value.chat_config.temperature
        body.logprobs = true
        body.add_generation_prompt = false
        body.continue_final_message = true
        body.max_tokens = 1
        body.top_logprobs = apiConfig.value.chat_config.top_logprobs
        body.prompt_logprobs = apiConfig.value.chat_config.top_logprobs
        body.return_token_ids = true

        requestStatus.value.requestTimes++
        var requestID = requestStatus.value.requestTimes

        try {
            // wait for 300ms to avoid double-click send 3 times requests
            await new Promise(resolve => setTimeout(resolve, 300))
            if (requestID !== requestStatus.value.requestTimes) {
                console.log(new Error(`Request ID mismatch ${requestID} !== ${requestStatus.value.requestTimes}, stope request ID ${requestID}`))
                return
            }
            const openai = new OpenAI(ObjctKeyToCamelCaseNaming(apiConfig.value.client_config))
            var requestBody = modifyRequest(body, apiConfig.value)
            var json = await openai.chat.completions.create(requestBody)
            if (requestID !== requestStatus.value.requestTimes) {
                console.log(new Error(`Request ID mismatch ${requestID} !== ${requestStatus.value.requestTimes}, stope request ID ${requestID}`))
                return
            }

            var lastMessageContent = messages[messages.length - 1].content
            var lastMessageContent_ = ''
            var tokensNew = []
            if (!json.prompt_logprobs_list) {
                ElMessage({
                    showClose: true,
                    message: t('userMessages.noPromptLogprobs'),
                    type: 'error',
                    duration: 10000,
                })
                return
            }
            var promptLogprobsTokensNew = json.prompt_logprobs_list.map(x => ({
                delta: { role: tokens.value[0].delta.role, content: x.content[0].token },
                logprobs: x,
                model: tokens.value[0].model,
            }))
            for (var i = promptLogprobsTokensNew.length - 1; i >= 0; i--) {
                var token = promptLogprobsTokensNew[i]
                var token_content = token.delta.content

                if ((token_content + lastMessageContent_).length > lastMessageContent.length) {
                    break
                }
                tokensNew.unshift(token)
                lastMessageContent_ = token_content + lastMessageContent_
            }
            var decodeToken = json.choices[0]
            var prefillTokenLength = json.prompt_logprobs_list.length + 1 // prompt_logprobs's first token is null
            if (json.usage) {
                prefillTokenLength = json.usage.prompt_tokens
            }
            var usage = {
                prompt_tokens: prefillTokenLength - tokensNew.length,
                completion_tokens: tokensNew.length,
            }
            if (decodeToken?.finish_reason == "stop") {  // if finish_reason is stop, add to tokensNew
                const stopToken = {
                    delta: { role: tokens.value[0].role, content: "" },
                    logprobs: decodeToken.logprobs,
                    model: json.model,
                    finish_reason: decodeToken.finish_reason,
                }
                tokensNew.push(stopToken)
                usage.completion_tokens += 1
                promptLogprobsTokensNew = [...promptLogprobsTokensNew, stopToken]
            }

            tokensNew.push({ delta: { role: tokens.value[0].role, content: "" }, model: json.model, usage: usage })
            promptLogprobsTokensNew.push({ delta: { role: tokens.value[0].role, content: "" }, model: json.model, })
            tokensNew.map((token, tokenIndex) => {
                token.tokenIndex = tokenIndex
            })
            const promptLogprobsTokensCloned = deepCopy(promptLogprobsTokensNew)
            promptLogprobsTokensCloned.map((token, tokenIndex) => {
                token.tokenIndex = tokenIndex
            })
            promptLogprobsTokens.value = promptLogprobsTokensCloned

            tokens.value = tokensNew
            ElMessage({
                showClose: true,
                message: t('userMessages.responseRefreshed'),
                type: 'success',
                duration: 5000,
            })
        }
        catch (error) {
            warning(error)
            throw error
        }
    }



    class OperationCenter {
        // All operations are here to manipulate the pandaState and responseState
        // continue generating, stop, continue with chosen, continue with input, edit prompt(include role), new round, edit response, refresh, load example, load panda tree.
        pandaState = buildMockObject()
        continueGenerating = () => {
            this.pandaState.beforeOperation()
            // var isTryGeneratingOnEot = tokens.value.length && tokens.value[tokens.value.length - 1].finish_reason === "stop"
            // if (isTryGeneratingOnEot) {
            // }
            this.pandaState.nextNotSameOperationCache = {
                operator: "continue_generating",
                on_policy: true,
            }
            requestLlmServer(messagesComputed.value).then(() => this.pandaState.beforeOperation())
        }

        stopGenerating = () => {
            this.pandaState.beforeOperation()
            requestStatus.value.generating = false
        }

        continueWithChosen = (token, logprobItem) => {
            // function clickOnLogprobItem() {
            this.pandaState.beforeOperation()
            const rejected_token = recordAsRejectedToken(token, tokens)  // record rejected token before change tokens
            prepareContinueFromToken(token, logprobItem.token, logprobItem.logprob, logprobItem.finish_reason)
            this.pandaState.afterOperation({
                operator: "continue_with_chosen",
                on_policy: true,
                continue_with_chosen: logprobItem,  // chosen_top_logprob
                rejected_token: rejected_token,
            }, true)
            if (logprobItem.finish_reason) {
                // remove all pruned tokens
                tokens.value = tokens.value.filter(token => !token.pruned)
                // if chosen <stop> in first token, clear tokens
                if (logprobItem.finish_reason == "stop" && tokens.value.length <= 1 && !finalMessage.value.content) {
                    tokens.value = []
                }
            } else {
                requestLlmServer(messagesComputed.value).then(() => this.pandaState.beforeOperation())
            }
            if (globalStore.isMobile) {
                setTimeout(closeFloatPatchPanel.value, 500)
            }
        }

        applyInputChange = (token, continuePrefix, continuePrefixLogprob) => {
            this.pandaState.beforeOperation()
            const rejected_token = recordAsRejectedToken(token, tokens)  // record rejected token before change tokens
            prepareContinueFromToken(token, continuePrefix, continuePrefixLogprob)
            this.pandaState.afterOperation({
                operator: "continue_with_input",
                on_policy: true,
                continue_with_input: { input_patch: continuePrefix },
                rejected_token: rejected_token,
            }, true)
        }

        continueWithInput = (token, continuePrefix, continuePrefixLogprob) => {
            this.applyInputChange(token, continuePrefix, continuePrefixLogprob)
            requestLlmServer(messagesComputed.value).then(() => this.pandaState.beforeOperation())
        }

        generateNew = ({ messageIndex = -1 } = {}) => {
            const shouldContinueFinalMessage = messageIndex === -1 && !finalMessage.value.content && finalMessage.value.role && apiConfig.value.support_continue_final_message
            if (shouldContinueFinalMessage) {
                // if only has role, try using continue generating
                this.continueGenerating()
            } else {
                this.pandaState.beforeOperation()
                if (messageIndex >= 0 && messages.value.length) {
                    const clampedIndex = Math.min(messageIndex, messages.value.length - 1)
                    messages.value = messages.value.slice(0, clampedIndex + 1)
                }
                tokens.value = []
                this.pandaState.afterOperation({
                    operator: "generate_new",
                    is_new_generated: true,
                    on_policy: true,
                    message_index: messageIndex,
                })
                requestLlmServer(messages.value).then(() => this.pandaState.beforeOperation())
            }
        }

        startNewRound = () => {  // TODO remove auto write back's append operation
            this.pandaState.beforeOperation()
            var role = newRoundMessage.value.role
            messages.value = (messagesComputed.value.concat([newRoundMessage.value]))
            tokens.value = [];
            newRoundMessage.value = { role: role, content: '' }
            this.pandaState.afterOperation({
                operator: "start_new_round",
                on_policy: true,
            })
            requestLlmServer(messages).then(() => this.pandaState.beforeOperation())
        }

        clearOrDeleteMessage = (message, index) => {
            this.pandaState.beforeOperation()
            if (message.content) {
                // after beforeOperation(), message has been recomputed
                var messageRefresh = messages.value[index]
                messageRefresh.content = ""
                this.pandaState.afterOperation({
                    operator: "edit_prompt_clear",
                    on_policy: false,
                })
            } else {
                messages.value.splice(index, 1)
                this.pandaState.afterOperation({
                    operator: "edit_prompt_delete",
                    on_policy: false,
                })
            }
        }

        editPrompt = {
            // long user editing time between `before` and `after`. which will stop generating. abondon!
            before: () => {
                this.pandaState.beforeOperation()
            },
            after: (operation) => {
                this.pandaState.afterOperation(Object.assign({
                    operator: "edit_prompt",
                    on_policy: false,
                }, operation || {}))
            }
        }

        updatePromptContent = (content, index, message) => {
            this.pandaState.beforeOperation()
            var messageRefresh = messages.value[index]
            messageRefresh.content = content
            this.pandaState.afterOperation({
                operator: "edit_prompt",
                on_policy: false,
            })
        }

        refreshResponseProbability = () => {
            this.pandaState.beforeOperation()
            requestPromptLogprobs().then(() => {
                this.pandaState.afterOperation({
                    operator: "refresh_probability",
                    on_policy: this.pandaState.isPreviousOperationOnPolicy.value,
                })
            })
        }

        editRole = {
            before: () => {
                this.pandaState.beforeOperation()
            },
            after: () => {
                this.pandaState.afterOperation({
                    operator: "edit_prompt_role",
                    on_policy: false,
                })
            }
        }

        editResponse = () => {
        }

        editSelection = (selectedTokens, replacementText) => {
            if (!selectedTokens?.length) {
                return
            }
            const startIndex = tokens.value.indexOf(selectedTokens[0])
            const endIndex = tokens.value.indexOf(selectedTokens[selectedTokens.length - 1])
            if (startIndex === -1 || endIndex === -1) {
                return
            }
            const rejected_token = recordAsRejectedToken(selectedTokens[0], tokens)  // record rejected token before change tokens
            this.pandaState.beforeOperation()
            const baseToken = deepCopy(selectedTokens[0])
            delete baseToken.selected
            baseToken.bifurcationPoint = true
            baseToken.modifiedByEditSelection = true
            const nextContent = replacementText ?? ""
            baseToken.delta = baseToken.delta || {}
            baseToken.delta.content = nextContent
            if (baseToken.logprobs?.content?.[0]) {
                baseToken.logprobs.content[0].token = nextContent
                baseToken.logprobs.content[0].logprob = -9999
            }
            const replaceStart = Math.min(startIndex, endIndex)
            const replaceEnd = Math.max(startIndex, endIndex)
            tokens.value.splice(replaceStart, replaceEnd - replaceStart + 1, baseToken)
            tokens.value.forEach((token, tokenIndex) => {
                token.tokenIndex = tokenIndex
            })
            const rejected_tokens_text = selectedTokens.map(token => token.delta?.content || "").join("")
            this.pandaState.afterOperation({
                operator: "edit_selection",
                on_policy: false,
                edit_selection_text: replacementText,
                rejected_tokens_text: rejected_tokens_text,
                rejected_token: rejected_token
            })
        }

        loadMessages = (newMessages) => {
            this.pandaState.beforeOperation()
            this.pandaState = pandaState  // TODO 挪出去这行， beforeOperation() 会报错
            const dialogNew = { messages: deepCopy(newMessages) }
            const pandaTreeNew = { dialogs: { 1: dialogNew } }
            this.pandaState.load(pandaTreeNew)
        }

        loadPandaJson = (pandaJson) => {
            this.pandaState.beforeOperation()
            this.pandaState = pandaState
            this.pandaState.load(pandaJson)
        }

        dumpPandaJson = async () => {
            return await this.pandaState.dump({})
        }
    }

    function prepareContinueFromToken(token, continuePrefix, continuePrefixLogprob, finish_reason) {
        for (const token_ of tokens.value) {
            token_.pruned = token_.tokenIndex >= token.tokenIndex
            if (token_.tokenIndex == token.tokenIndex) {
                token_.bifurcationPoint = true
            }
        }
        continuePrefix = continuePrefix || ""
        // const continuePrefixToken = { delta: { content: continuePrefix }, tokenIndex: token.tokenIndex, bifurcationPoint: true, logprobs: token.logprobs }
        token = deepCopy(token)
        delete token.finish_reason
        if (finish_reason) {
            token.finish_reason = finish_reason
        }
        token.delta.content = continuePrefix
        token.bifurcationPoint = true
        token.pruned = false
        if (token.logprobs?.content?.[0]) {
            token.logprobs.content[0].logprob = isFinite(continuePrefixLogprob) ? continuePrefixLogprob : -9999
            token.logprobs.content[0].token = continuePrefix
        }
        tokens.value.splice(token.tokenIndex, 0, token);
    }

    const operationCenter = new OperationCenter()
    operationCenter.loadMessages(messages.value)

    const newRoundMessage = ref({ role: 'user', content: '' })

    const finalMessage = computed(() => {
        var role = null  // Compatible with Claude that each token has a role
        var finish_reason
        var finalMessage = tokens.value.filter(
            token => !token.pruned
        ).map(
            token => {
                if (token.finish_reason) {
                    finish_reason = token.finish_reason
                }
                return (token.delta || {})
            }
        ).reduce((delta1, delta2) => {
            const delta = { ...delta1 }
            for (var key in delta2) {
                if (key === "tool_calls" && delta2.tool_calls) {
                    var toolCalls = delta.tool_calls || []
                    var toolCall2 = delta2.tool_calls[0]
                    console.assert(delta2.tool_calls.length === 1)
                    console.assert(typeof toolCall2.index === "number")
                    if (toolCall2.index === toolCalls.length) {
                        toolCalls.push(toolCall2)
                    } else {
                        var toolCall1 = toolCalls[toolCall2.index]
                        toolCalls[toolCall2.index] = mergeTwoDeltas(toolCall1, toolCall2, ["type"])
                    }
                    delta.tool_calls = toolCalls
                    continue
                }
                if (key === "reasoning_details") {
                    delta.reasoning_details = [mergeTwoDeltas(delta.reasoning_details?.[0], delta2.reasoning_details?.[0], ["type", "format"])]
                    continue
                }
                delta[key] = (delta[key] || "") + (delta2[key] || "")
                if (key === "role" && delta2.role) {
                    role = delta2.role
                }
            }
            return delta
        }, {})
        if (role) {
            finalMessage.role = role
        } else if (tokens.value.length) {
            finalMessage.role = "assistant" // when has token, the default role is assistant
        }
        if (role && !finalMessage.content) {  // only role but no content
            finalMessage.content = ""
        }
        // Compatible with different models for continue generating
        // For keys other than assistant and user, if v is the empty string, then delete
        for (var key in finalMessage) {
            if (key !== "role" && key !== "content" && finalMessage[key] === "") {
                delete finalMessage[key]
            }
        }
        if (finish_reason) {
            finalMessage.finish_reason = finish_reason
        }
        return finalMessage
    })

    const messagesComputed = computed(() => {
        if (finalMessage.value.content || finalMessage.value.role) {
            return messages.value.concat([finalMessage.value])
        } else {
            return messages.value
        }
    })

    watch(pandaState.dialogCache,
        function watchPandaStateDialogCache(newValue, oldValue) {
            if (newValue.messages) {
                // this will stop generating when edit
                requestStatus.value.generating = false
                loadMessagesToCurrentDialogUi(newValue.messages)
                pandaState.tryRestoreTokens()
                // p(tokensToSeq(tokens.value))
                // console.trace()
            }
        }, { flush: 'sync' })

    const dialogComputed = computed(() => {

        const dialog = { ...pandaState.dialogCache.value }
        dialog.messages = [...messagesComputed.value]
        // should add new newRoundMessage? No, becasue when load again, newRoundMessage become finalMessage
        // if (newRoundMessage.value.content) {
        //   dialog.messages.push(newRoundMessage.value)
        // }
        return dialog
    })

    // TODO better register in pandaState
    pandaState.registerDialogComputed(dialogComputed)
    pandaState.registerApiConfig(apiConfig)
    pandaState.registerTokens(tokens)

    const warningState = new WarningState()
    const warning = warningState.warning

    const closeFloatPatchPanel = ref(() => { })
    function registerInResponseText({ closeFloatPatchPanel: externalCloseFloatPatchPanel }) {
        closeFloatPatchPanel.value = externalCloseFloatPatchPanel
    }

    const bindApiConfig = (apiConfigRef) => {
        watch(apiConfigRef, (newApiConfig) => {
            // Use Object.assign to maintain the same reference in responseState.apiConfig
            Object.assign(apiConfig.value, newApiConfig)
            // flush sync to avoid async update
        }, { deep: true, immediate: true, flush: 'sync' })
    }

    return {
        pandaState,
        uploadedJson,
        onPandaContainerRef,
        messages,
        apiConfig,
        tokens,
        promptLogprobsTokens,
        rawPromptLogprobsTokens,
        isPromptLogprobsState,
        requestStatus,
        operationCenter,
        newRoundMessage,
        finalMessage,
        messagesComputed,
        ...warningState,
        registerInResponseText,
        bindApiConfig,
        // requestPromptLogprobs, // using operationCenter instead
        // requestLlmServer
    }
}
