import { ref, computed, toValue, watch, isRef, unref } from 'vue'
import { ElMessage } from 'element-plus'
import { deepEqual, ObjctKeyToCamelCaseNaming, deepCopy, buildMockObject, safeArrayExtend } from '../utils/commonUtils.js'
import { getFinishReason, normalizeRequest, recordAsRejectedToken, filterEmptyMessage, MESSAGE_KEYS_IN_CONTEXT, MESSAGE_OUTPUT_KEYS, getMessageOutput, messageToSeq } from '../utils/chatUtils.js'
import { buildResponseTemplate, buildViewTokens } from '../utils/responseTemplates/index.js'
import { OpenAI } from '../utils/fetchOpenaiApi.js'
import { createChatCompletionsStream } from '../utils/apiProtocols/index.js'
import { applyImageDetailLevel, assertNoLegacyChatConfigTools, dropStaleToolAsset } from '../utils/requestUtils.js'
import { buildRejectedToolMessages } from '../utils/toolUtils.js'

import { useGlobalStore } from './globalStore.js'
import { PandaState } from './pandaState.js'
import { WarningState } from './warningState.js'
import { defaultApiConfig, CONTINUE_PROMPT } from './controlParameterState.js'
import { ToolManageStateClosure, ToolCallStateClosure, browserAgentMcpUrl } from './toolState.js'

export const defaultMessages = [{ role: "system", content: "" }, { role: "user", content: "" }]

export function ResponseStateClosure({ messages = null, apiConfig = null, toolManageState = null } = {}) {
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
    toolManageState = toolManageState || ToolManageStateClosure({ presetToolConfigs: [] })

    const pandaState = new PandaState()
    toolManageState.registerDialogCache(pandaState.dialogCache)
    const uploadedJson = ref(null)
    const onPandaContainerRef = ref(document)

    const tokens = ref([])  // aka generationTokens, the source of truth for generated tokens, will be parsed as finalMessage
    const logprobsTokens = ref([])  // only provide logprobs info

    var generationResponseTemplate = ref(buildResponseTemplate({ apiConfig: apiConfig.value }))

    const viewResponseTemplate = computed(() => buildResponseTemplate({ apiConfig: apiConfig.value }))

    const finalMessage = computed(() => {
        return generationResponseTemplate.value.parse(tokens.value)
    })


    const viewTokens = computed(() => {
        if (!tokens.value.length) {
            return tokens.value
        }
        const canReuseTokens =
            viewResponseTemplate.value.responseTemplateType !== "plain_text" ||
            tokens.value.every(token => !token.delta.reasoning && !token.delta.tool_calls?.length)
        if (
            canReuseTokens &&
            tokens.value === logprobsTokens.value &&
            viewResponseTemplate.value.configMark === generationResponseTemplate.value.configMark
        ) {
            return tokens.value
        }
        const canReuseLogprobsTokens =
            viewResponseTemplate.value.responseTemplateType !== "plain_text" ||
            logprobsTokens.value.every(token => !token.delta.reasoning && !token.delta.tool_calls?.length)
        if (
            canReuseLogprobsTokens &&
            logprobsTokens.value.length
        ) {
            try {
                const parsedMessage = viewResponseTemplate.value.parse(logprobsTokens.value)
                if (deepEqual(parsedMessage, finalMessage.value)) {
                    return logprobsTokens.value
                }
            } catch {
                // Fall through to rebuild viewTokens from finalMessage.
            }
        }
        return buildViewTokens({
            message: finalMessage.value,
            responseTemplate: viewResponseTemplate.value,
            logprobsTokens: logprobsTokens.value,
        })
    })

    const messagesComputed = computed(() => {
        // A role-only model message can be an intentional prefill; truly empty template output should parse to {}.
        if (finalMessage.value.role || messageToSeq(finalMessage.value, { includeFinishReason: false })) {
            return messages.value.concat([finalMessage.value])
        } else {
            return messages.value
        }
    })

    const promptLogprobsTokens = ref([])
    // set rawPromptLogprobsTokens only when this responseState is promptLogprobsState
    const rawPromptLogprobsTokens = ref([])
    const isPromptLogprobsState = computed(() => {
        return rawPromptLogprobsTokens.value.length > 0
    })

    const requestStatus = ref({
        requestTimes: 0,
        generating: false,
        requestModel: "",
    })

    function setGenerationTokens(newTokens) {
        tokens.value = newTokens
        logprobsTokens.value = newTokens
    }

    function promoteViewTokensToGeneration() {
        const newTokens = viewTokens.value
        tokens.value = newTokens
        logprobsTokens.value = newTokens
        generationResponseTemplate.value = viewResponseTemplate.value
        return newTokens
    }

    function getFinalMessageFinishReason(message, defaultFinishReason = null) {
        if (generationResponseTemplate.value.responseTemplateType === "plain_text") {
            return message.finish_reason || defaultFinishReason
        }
        return getFinishReason(message, defaultFinishReason)
    }

    function modifyRequest(requestBody) {
        var body = normalizeRequest(requestBody)
        dropStaleToolAsset(body)
        applyImageDetailLevel(body)
        if (isPromptLogprobsState.value) {
            delete body.tools
        }
        for (let message of body.messages) {
            if (message.reasoning) {
                // TODO: workaround to be improved 
                // if not set reasoning_key in chat_config, set reasoning_content for compatibility
                message.reasoning_content = message.reasoning
            }
        }
        return body
    }

    async function requestLlmServer(messages) {
        assertNoLegacyChatConfigTools(apiConfig.value.chat_config)
        promoteViewTokensToGeneration()
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
            if (generationResponseTemplate.value.responseTemplateType === "plain_text") {
                messages[messages.length - 1] = {
                    role: messages[messages.length - 1].role || "assistant",
                    content: generationResponseTemplate.value.apply(messages[messages.length - 1]).templatedPrompt,
                }
            }
            var lastMessageContent = messages[messages.length - 1].content || ""
            var prefillTokensNumber = tokens.value.filter(token => !token.pruned).length
            if (apiConfig.value.support_continue_final_message) {
                body.add_generation_prompt = false
                // body['chat_template_kwargs'] = { continue_final_message: continue_final_message }
                body['continue_final_message'] = continue_final_message
                body['echo'] = false
                const modelName = apiConfig.value.chat_config.model.toLowerCase()
                if (modelName.indexOf("kimi") != -1 || modelName.indexOf("qwen") != -1) {
                    messages[messages.length - 1]['partial'] = true
                }
                if (modelName.indexOf("deepseek") != -1) {
                    messages[messages.length - 1]['prefix'] = true
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
        body.tools = await toolManageState.buildRequestTools()

        requestStatus.value.generating = true
        requestStatus.value.requestTimes++
        requestStatus.value.requestModel = apiConfig.value.chat_config.model
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
            var requestBody = modifyRequest(body)  // deepCopyed
            var stream = await createChatCompletionsStream({ requestBody, apiConfig: apiConfig.value, signal: fetchController.signal })

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
                    setGenerationTokens(tokens.value.filter(token => !token.pruned))
                    tokensValuePtr = tokens.value
                    tokenIndex = tokens.value.length
                    if (!chunk?.choices[0]?.delta?.content) {
                        continue  // if first chunk only not has content, no more role for continue_final_message
                    }
                }
                if (!chunk?.choices?.length) {  // set usage and model if only in last token
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
                                setGenerationTokens(tokens.value.slice(0, prefillTokensNumber))
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
            requestStatus.value.generating = false
            runDialogChangedHooks()

        } catch (error) {
            requestStatus.value.generating = false
            warning(error)
            clearTimeout(firstTokenTimeoutId)
            throw error
        }
    }


    async function requestPromptLogprobs() {
        assertNoLegacyChatConfigTools(apiConfig.value.chat_config)
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
        body.tools = await toolManageState.buildRequestTools()

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
            var requestBody = modifyRequest(body)
            var json = await openai.chat.completions.create(requestBody)
            if (requestID !== requestStatus.value.requestTimes) {
                console.log(new Error(`Request ID mismatch ${requestID} !== ${requestStatus.value.requestTimes}, stope request ID ${requestID}`))
                return
            }

            if (!json.prompt_logprobs_list) {
                ElMessage({
                    showClose: true,
                    message: t('userMessages.noPromptLogprobs'),
                    type: 'error',
                    duration: 10000,
                })
                return
            }
            var role = finalMessage.value.role || "assistant"
            var promptLogprobsTokensNew = json.prompt_logprobs_list.map(x => ({
                delta: { role: role, content: x.content[0].token },
                logprobs: x,
                model: tokens.value[0].model,
            }))
            const messageForLogprobs = { ...finalMessage.value }
            delete messageForLogprobs.finish_reason  // TODO: consider finish_reason token
            const { templatedPrompt } = viewResponseTemplate.value.apply(messageForLogprobs)
            const promptLogprobsTailCharLimit = Math.max(1024, Math.ceil(templatedPrompt.length * 1.5))
            var promptLogprobsTailCharLength = 0
            var promptLogprobsTokenStart = promptLogprobsTokensNew.length
            while (promptLogprobsTokenStart > 0 && promptLogprobsTailCharLength < promptLogprobsTailCharLimit) {
                promptLogprobsTokenStart--
                promptLogprobsTailCharLength += promptLogprobsTokensNew[promptLogprobsTokenStart].delta.content.length
            }
            const logprobsTokensForView = promptLogprobsTokensNew.slice(promptLogprobsTokenStart)
            var tokensNew = buildViewTokens({
                message: messageForLogprobs,
                responseTemplate: viewResponseTemplate.value,
                logprobsTokens: logprobsTokensForView,
            })
            const completionTokens = tokensNew.filter(token => typeof token.logprobs?.content?.[0]?.logprob === "number").length
            var decodeToken = json.choices[0]
            var prefillTokenLength = json.prompt_logprobs_list.length + 1 // prompt_logprobs's first token is null
            if (json.usage) {
                prefillTokenLength = json.usage.prompt_tokens
            }
            var usage = {
                prompt_tokens: prefillTokenLength - completionTokens,
                completion_tokens: completionTokens,
            }
            if (decodeToken?.finish_reason == "stop") {  // if finish_reason is stop, add to tokensNew
                const stopToken = {
                    delta: { role: role, content: "" },
                    logprobs: decodeToken.logprobs,
                    model: json.model,
                    finish_reason: decodeToken.finish_reason,
                }
                tokensNew.push(stopToken)
                usage.completion_tokens += 1
                promptLogprobsTokensNew = [...promptLogprobsTokensNew, stopToken]
            }

            tokensNew.push({ delta: { role: role, content: "" }, model: json.model, usage: usage })
            promptLogprobsTokensNew.push({ delta: { role: role, content: "" }, model: json.model, })
            tokensNew.map((token, tokenIndex) => {
                token.tokenIndex = tokenIndex
            })
            const promptLogprobsTokensCloned = deepCopy(promptLogprobsTokensNew)
            promptLogprobsTokensCloned.map((token, tokenIndex) => {
                token.tokenIndex = tokenIndex
            })
            promptLogprobsTokens.value = promptLogprobsTokensCloned

            logprobsTokens.value = tokensNew
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

        getNextMessages = ({ messagesToAppend = [], messageIndex = -1 } = {}) => {
            const baseMessages = (messageIndex >= 0 && messages.value.length
                ? messages.value.slice(0, Math.min(messageIndex, messages.value.length - 1) + 1)
                : messagesComputed.value
            )
            return baseMessages.concat(deepCopy(messagesToAppend))
        }

        getMessageByIndex = (messageIndex = -1) => {
            const clampedIndex = (
                messageIndex === -1
                    ? messagesComputed.value.length - 1
                    : Math.min(messageIndex, messagesComputed.value.length - 1)
            )
            return messagesComputed.value[clampedIndex]
        }

        buildRequestToolsAndResolveMessageIndex = async (messageIndex = -1) => {
            const targetMessage = messageIndex >= 0 ? messages.value[messageIndex] : null
            await toolManageState.buildRequestTools()
            return targetMessage ? messages.value.indexOf(targetMessage) : messageIndex
        }

        addUserLocalFiles = (files = []) => {
            const userLocalFiles = toolManageState.browserAgentShared.userLocalFiles
            const addedFiles = files.map(({ path, handleOrEntry }) => {
                let key = path
                let i = 1
                while (key in userLocalFiles) {
                    key = `another${i}/${path}`
                    i += 1
                }
                userLocalFiles[key] = handleOrEntry
                return { key, handleOrEntry }
            })
            if (!addedFiles.length) {
                return
            }

            const fileMessage = {
                role: 'user',
                content: `<|user_local_files_start|>
User shares those files with you. Please load the "user-local-files" skill:
${addedFiles.map(({ key, handleOrEntry }) => `- \`${key}\`: ${handleOrEntry.constructor.name}`).join('\n')}
<|user_local_files_end|>`,
            }
            this.pandaState.beforeOperation()
            // try to add tool config for browser agent mcp if not exist
            const dialogCache = this.pandaState.dialogCache.value
            if (!('tools' in dialogCache)) {
                dialogCache.tool_configs = dialogCache.tool_configs || []
                if (!dialogCache.tool_configs.some(toolConfig => toolConfig.server_url === browserAgentMcpUrl)) {
                    dialogCache.tool_configs.push({
                        type: 'mcp',
                        server_url: browserAgentMcpUrl,
                    })
                }
            }
            const nextMessages = this.getNextMessages()
            let insertIndex = nextMessages.length
            if (nextMessages[insertIndex - 1]?.role === 'user') {
                while (
                    insertIndex > 0 &&
                    nextMessages[insertIndex - 1].role === 'user' &&
                    !(typeof nextMessages[insertIndex - 1].content === 'string' && nextMessages[insertIndex - 1].content.includes('<|user_local_files_'))
                ) {
                    insertIndex -= 1
                }
            }
            nextMessages.splice(insertIndex, 0, fileMessage)
            messages.value = nextMessages
            setGenerationTokens([])
            this.pandaState.afterOperation({
                operator: "add_user_local_files",
                on_policy: false,
            })
        }

        // Run tool-call and generation rounds until the assistant stops or needs manual approval.
        startAgenticLoop = async ({ autoApproveRunNum = 0, defaultFinishReason = null } = {}) => {
            await toolManageState.buildRequestTools()
            toolCallState.setAutoApproveLoop(autoApproveRunNum)
            let lastMessage = messagesComputed.value[messagesComputed.value.length - 1]
            let finishReason = getFinalMessageFinishReason(lastMessage, defaultFinishReason)
            let loopIdx = 0
            while (true) {
                if (finishReason === "tool_calls") {
                    const callResult = await toolCallState.maybeAutoCallToolCalls(lastMessage.tool_calls)
                    // Existing tokens mean these tool calls belong to the current final assistant message.
                    const isFinalMessageToolCalls = Boolean(tokens.value.length)
                    if (isFinalMessageToolCalls) {
                        if (!loopIdx) {
                            this.pandaState.beforeOperation()
                        }
                        // run with approval will auto set is_good with onlyReplaceNull=true
                        callResult.consumedApproval && this.pandaState.setCurrentIsGood({ value: true, onlyReplaceNull: true })
                    }
                    if (!callResult.toolMessages?.length) {
                        break
                    }
                    messages.value = messagesComputed.value.concat(deepCopy(callResult.toolMessages))
                    setGenerationTokens([])
                    this.pandaState.afterOperation({
                        operator: "run_tool_calls",
                        on_policy: true,
                    })
                }
                await requestLlmServer(messagesComputed.value)
                this.pandaState.beforeOperation()
                lastMessage = messagesComputed.value[messagesComputed.value.length - 1] || {}
                finishReason = lastMessage.finish_reason
                loopIdx += 1
                if (finishReason !== "tool_calls") {
                    break
                }
            }
        }

        runToolCalls = async ({ autoApproveRunNum = 1, messageIndex = -1 } = {}) => {
            const resolvedMessageIndex = await this.buildRequestToolsAndResolveMessageIndex(messageIndex)
            const toolCallMessage = this.getMessageByIndex(resolvedMessageIndex)
            console.assert(toolCallMessage.tool_calls.length, "runToolCalls requires tool_calls", toolCallMessage)
            if (resolvedMessageIndex !== -1) {
                this.pandaState.beforeOperation()
                messages.value = this.getNextMessages({ messageIndex: resolvedMessageIndex })
                setGenerationTokens([])
                // if messageIndex != -1 , set nextNotSameOperationCache `on_policy: false` to prevent tool calls failures and end with tool call response
                this.pandaState.nextNotSameOperationCache = {
                    operator: "run_tool_calls",
                    on_policy: false,  // It is historical data and not generated by the current operation.
                }
            }
            return await this.startAgenticLoop({ autoApproveRunNum, defaultFinishReason: "tool_calls" })
        }

        rejectToolCalls = async ({ toolCallsRejectedGuidance = '', messageIndex = -1, autoApproveRunNum = 0 } = {}) => {
            const resolvedMessageIndex = await this.buildRequestToolsAndResolveMessageIndex(messageIndex)
            const toolCallMessage = this.getMessageByIndex(resolvedMessageIndex)
            console.assert(toolCallMessage.tool_calls.length, "rejectToolCalls requires tool_calls", toolCallMessage)
            const rejectedToolMessages = buildRejectedToolMessages(
                toolCallMessage.tool_calls,
                toolCallsRejectedGuidance,
            )
            if (resolvedMessageIndex !== -1 && messages.value.length) {
                this.pandaState.beforeOperation()
            }
            messages.value = this.getNextMessages({ messagesToAppend: rejectedToolMessages, messageIndex: resolvedMessageIndex })
            setGenerationTokens([])
            this.pandaState.setCurrentIsGood({ value: false, onlyReplaceNull: true })
            this.pandaState.afterOperation({
                operator: "reject_tool_calls",
                on_policy: true,
            })
            await this.startAgenticLoop({ autoApproveRunNum })
        }

        continueGenerating = async () => {
            await toolManageState.buildRequestTools()
            // var isTryGeneratingOnEot = tokens.value.length && tokens.value[tokens.value.length - 1].finish_reason === "stop"
            // if (isTryGeneratingOnEot) {
            // }
            // Record the next implicit flush as `continue_generating` instead of a generic `auto` operation.
            this.pandaState.nextNotSameOperationCache = {
                operator: "continue_generating",
                on_policy: true,
            }
            await this.startAgenticLoop()
        }

        stopGenerating = () => {
            this.pandaState.beforeOperation()
            requestStatus.value.generating = false
        }

        stopAgenticLoop = () => {
            if (requestStatus.value.generating) {
                this.stopGenerating()
            }
            if (toolCallState.toolCallStatus.value.calling) {
                toolCallState.stopToolCalls()
            }
        }

        continueWithChosen = async (token, logprobItem) => {
            // function clickOnLogprobItem() {
            await toolManageState.buildRequestTools()
            this.pandaState.beforeOperation()
            promoteViewTokensToGeneration()
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
                setGenerationTokens(tokens.value.filter(token => !token.pruned))
                // if chosen <stop> in first token, clear tokens
                if (logprobItem.finish_reason == "stop" && tokens.value.length <= 1 && !finalMessage.value.content) {
                    setGenerationTokens([])
                }
            } else {
                await this.startAgenticLoop()
            }
            if (globalStore.isMobile) {
                setTimeout(closeFloatPatchPanel.value, 500)
            }
        }

        applyInputChange = (token, continuePrefix, continuePrefixLogprob) => {
            this.pandaState.beforeOperation()
            promoteViewTokensToGeneration()
            const rejected_token = recordAsRejectedToken(token, tokens)  // record rejected token before change tokens
            prepareContinueFromToken(token, continuePrefix, continuePrefixLogprob)
            this.pandaState.afterOperation({
                operator: "continue_with_input",
                on_policy: true,
                continue_with_input: { input_patch: continuePrefix },
                rejected_token: rejected_token,
            }, true)
        }

        continueWithInput = async (token, continuePrefix, continuePrefixLogprob) => {
            await toolManageState.buildRequestTools()
            this.applyInputChange(token, continuePrefix, continuePrefixLogprob)
            await this.startAgenticLoop()
        }

        generateNew = async ({ messageIndex = -1, fromUser = false } = {}) => {
            var resolvedMessageIndex = await this.buildRequestToolsAndResolveMessageIndex(messageIndex)
            if (fromUser) {
                var searchIndex = resolvedMessageIndex === -1 ? messages.value.length - 1 : Math.min(resolvedMessageIndex, messages.value.length - 1)
                for (var i = searchIndex; i >= 0; i--) {
                    if (messages.value[i].role === "user") {
                        resolvedMessageIndex = i
                        break
                    }
                }
            }
            // Role-only model messages are valid prefill for continuation.
            const shouldContinueFinalMessage = (
                resolvedMessageIndex === -1 &&
                !fromUser &&
                !messageToSeq(finalMessage.value, { includeFinishReason: false }) &&
                finalMessage.value.role &&
                apiConfig.value.support_continue_final_message
            )
            if (shouldContinueFinalMessage) {
                await this.continueGenerating()
            } else {
                this.pandaState.beforeOperation()
                if (resolvedMessageIndex >= 0 && messages.value.length) {
                    const clampedIndex = Math.min(resolvedMessageIndex, messages.value.length - 1)
                    messages.value = messages.value.slice(0, clampedIndex + 1)
                }
                setGenerationTokens([])
                this.pandaState.afterOperation({
                    operator: "generate_new",
                    is_new_generated: true,
                    on_policy: true,
                    message_index: resolvedMessageIndex,
                })
                await this.startAgenticLoop()
            }
        }

        startNewRound = async (newRoundMessages = null) => {  // TODO remove auto write back's append operation
            const messagesToAppend = newRoundMessages ? newRoundMessages : [newRoundMessage.value]
            var role = newRoundMessage.value.role
            await toolManageState.buildRequestTools()
            this.pandaState.beforeOperation()
            messages.value = this.getNextMessages({ messagesToAppend })
            setGenerationTokens([])
            if (!newRoundMessages) {
                newRoundMessage.value = { role: role, content: '' }
            }
            this.pandaState.afterOperation({
                operator: "start_new_round",
                on_policy: true,
            })
            await this.startAgenticLoop()
        }

        clearOrDeleteMessage = (message, index) => {
            this.pandaState.beforeOperation()
            if (messageToSeq(getMessageOutput(message), { includeFinishReason: false })) {
                // after beforeOperation(), message has been recomputed
                var messageRefresh = messages.value[index]
                for (const key of MESSAGE_OUTPUT_KEYS) {
                    delete messageRefresh[key]
                }
                messageRefresh.content = ""
                delete messageRefresh.finish_reason
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

        updatePromptMessage = (messageDelta, index) => {
            this.pandaState.beforeOperation()
            var messageRefresh = { ...messages.value[index] }
            for (const key of MESSAGE_KEYS_IN_CONTEXT) {
                const value = messageDelta[key]
                if (
                    value == null ||
                    key !== "content" && value === "" ||
                    Array.isArray(value) && value.length === 0
                ) {
                    delete messageRefresh[key]
                } else {
                    messageRefresh[key] = value
                }
            }
            messages.value[index] = messageRefresh
            this.pandaState.afterOperation({
                operator: "edit_prompt",
                on_policy: false,
            })
        }

        refreshResponseProbability = async () => {
            await toolManageState.buildRequestTools()
            toolCallState.stopToolCalls()
            this.pandaState.beforeOperation()
            return requestPromptLogprobs().then(() => {
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

        editSelection = (selectedTokens, replacementInput) => {
            if (!selectedTokens?.length) {
                return
            }
            this.pandaState.beforeOperation()
            promoteViewTokensToGeneration()
            const startIndex = tokens.value.indexOf(selectedTokens[0])
            const endIndex = tokens.value.indexOf(selectedTokens[selectedTokens.length - 1])
            if (startIndex === -1 || endIndex === -1) {
                return
            }
            const rejected_token = recordAsRejectedToken(selectedTokens[0], tokens)  // record rejected token before change tokens
            const baseToken = deepCopy(selectedTokens[0])
            delete baseToken.selected
            baseToken.bifurcationPoint = true
            baseToken.modifiedByEditSelection = true
            const isLogprobItem = replacementInput && typeof replacementInput === 'object'
            const replacementText = isLogprobItem ? (replacementInput.token ?? "") : (replacementInput ?? "")
            const nextContent = replacementText
            baseToken.delta = baseToken.delta || {}
            baseToken.delta.content = nextContent
            if (baseToken.logprobs?.content?.[0]) {
                const logprobsContent = baseToken.logprobs.content[0]
                if (isLogprobItem) {
                    Object.assign(logprobsContent, replacementInput)
                } else {
                    delete logprobsContent.logprob
                }
                logprobsContent.token = nextContent
            }
            const replaceStart = Math.min(startIndex, endIndex)
            const replaceEnd = Math.max(startIndex, endIndex)
            tokens.value.splice(replaceStart, replaceEnd - replaceStart + 1, baseToken)
            tokens.value.forEach((token, tokenIndex) => {
                token.tokenIndex = tokenIndex
            })
            const rejected_tokens_text = selectedTokens.map(token => token.delta?.content || "").join("")
            const operation = {
                operator: "edit_selection",
                on_policy: false,
                edit_selection_text: replacementText,
                rejected_tokens_text: rejected_tokens_text,
                rejected_token: rejected_token,
                is_logprob_item: isLogprobItem,
            }
            if (isLogprobItem) {
                operation.replacement_token = replacementInput
            }
            this.pandaState.afterOperation(operation)
        }

        loadMessages = (newMessages, toolConfigs) => {
            this.pandaState.beforeOperation()
            this.pandaState = pandaState  // TODO 挪出去这行， beforeOperation() 会报错
            const dialogNew = { messages: deepCopy(newMessages) }
            const toolConfigsValue = unref(toolConfigs)
            if (toolConfigsValue) {
                dialogNew.tool_configs = deepCopy(toolConfigsValue)
            }
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
            if (isFinite(continuePrefixLogprob) && continuePrefixLogprob !== null) {
                token.logprobs.content[0].logprob = continuePrefixLogprob
            } else {
                delete token.logprobs.content[0].logprob
            }
            token.logprobs.content[0].token = continuePrefix
        }
        tokens.value.splice(token.tokenIndex, 0, token);
    }

    const warningState = new WarningState()
    const warning = warningState.warning
    const toolCallState = ToolCallStateClosure({
        toolManageState,
    })
    const agenticLoopStatus = {
        get running() {
            return requestStatus.value.generating || toolCallState.toolCallStatus.value.calling
        },
    }

    const operationCenter = new OperationCenter()
    operationCenter.toolCallState = toolCallState
    operationCenter.toolManageState = toolManageState
    operationCenter.loadMessages(messages.value)

    const newRoundMessage = ref({ role: 'user', content: '' })

    function setDefaultNewRoundMessage() {
        if (messageToSeq(getMessageOutput(newRoundMessage.value), { includeFinishReason: false })) {
            return
        }
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
    }

    const dialogChangedHooks = [setDefaultNewRoundMessage]

    function runDialogChangedHooks() {
        dialogChangedHooks.forEach(hook => hook())
    }

    watch(pandaState.dialogCache,
        function watchPandaStateDialogCache(newValue, oldValue) {
            function loadMessagesToCurrentDialogUi(newMessages) {
                if (newMessages[newMessages.length - 1].role == "assistant") {
                    var lastMessage = newMessages[newMessages.length - 1]
                    var isEqual = deepEqual(finalMessage.value, lastMessage)
                    if (!isEqual) {
                        generationResponseTemplate.value = viewResponseTemplate.value
                        tokens.value = buildViewTokens({ message: lastMessage, responseTemplate: generationResponseTemplate.value })
                    }
                    newMessages = newMessages.slice(0, newMessages.length - 1)
                } else {
                    tokens.value = []
                }
                messages.value = newMessages
            }

            if (newValue.messages) {
                toolCallState.toolCallStatus.value.calling = false
                requestStatus.value.generating = false
                logprobsTokens.value = deepCopy(pandaState.currentDialogLogprobsTokens.value)
                loadMessagesToCurrentDialogUi(newValue.messages)
                runDialogChangedHooks()
                // console.trace()
            }
        }, { flush: 'sync' })

    const dialogComputed = computed(() => {

        const dialog = { ...pandaState.dialogCache.value }
        dialog.messages = [...messagesComputed.value]
        if ('tools' in pandaState.dialogCache.value) {
            dialog.tools = deepCopy(pandaState.dialogCache.value.tools)
        }
        // should add new newRoundMessage? No, becasue when load again, newRoundMessage become finalMessage
        // if (newRoundMessage.value.content) {
        //   dialog.messages.push(newRoundMessage.value)
        // }
        return dialog
    })

    // TODO better register in pandaState
    pandaState.registerDialogComputed(dialogComputed)
    pandaState.registerApiConfig(apiConfig)
    pandaState.registerLogprobsTokens(logprobsTokens)

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

    const responseState = {
        pandaState,
        uploadedJson,
        onPandaContainerRef,
        messages,
        apiConfig,
        tokens,
        logprobsTokens,
        viewTokens,
        setGenerationTokens,
        promptLogprobsTokens,
        generationResponseTemplate,
        viewResponseTemplate,
        rawPromptLogprobsTokens,
        isPromptLogprobsState,
        requestStatus,
        agenticLoopStatus,
        toolManageState,
        operationCenter,
        newRoundMessage,
        finalMessage,
        getFinalMessageFinishReason,
        messagesComputed,
        ...warningState,
        registerInResponseText,
        bindApiConfig,
        // requestPromptLogprobs, // using operationCenter instead
        // requestLlmServer
    }
    toolManageState.registeredResponseState.value = responseState
    return responseState
}
