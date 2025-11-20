import { ref, computed, toValue, watch, isRef, onMounted } from 'vue'
import JSON5 from 'json5'
import { OpenAI } from '../utils/fetchOpenaiApi'
import { ElMessage } from 'element-plus'
import { deepCopy } from '../utils/commonUtils'
import { useGlobalStore } from './globalStore'
import { ObjctKeyToCamelCaseNaming } from '../utils/commonUtils'

export const CONTINUE_PROMPT = "continue(do not repeat the last few words of your previous reply)"

export const defaultChatConfig = {
    stream: true,
    logprobs: true,
    top_logprobs: 20,
    // top_k: 2,
    max_tokens: 3072,
    temperature: 0.5,
    stream_options: {
        include_usage: true,
    },
}

export const defaultApiConfig = {
    "support_continue_final_message": true,
    // "image_detail_level": "auto",
    "endpoint_name": "endpoint-name",
    "model_roles": ["assistant"],
    "client_config": {
        base_url: "https://vllm-test-api.diyer22.com/v1",
        api_key: "ak-onPandaTestKey",
        dangerouslyAllowBrowser: true
    },
    "chat_config": {
        model: "Qwen/Qwen2.5-7B-Instruct-GPTQ-Int4",
        ...deepCopy(defaultChatConfig),
    },
}

const isEndpointModelMatchIgnoringIndex = (key, modelNameValue) => {
    if (typeof key !== 'string' || typeof modelNameValue !== 'string') {
        return false
    }
    const parseEndpointAndModel = (value) => {
        const parts = value.split('—')
        if (parts.length < 3) {
            return null
        }
        return {
            endpoint: parts[0],
            model: parts[parts.length - 1],
        }
    }
    const keyParts = parseEndpointAndModel(key)
    const modelNameParts = parseEndpointAndModel(modelNameValue)
    if (!keyParts || !modelNameParts) {
        return false
    }
    return keyParts.endpoint === modelNameParts.endpoint && keyParts.model === modelNameParts.model
}

export function isValidApiConfigs(apiConfigs) {
    if (!Array.isArray(apiConfigs)) {
        ElMessage.error(`Invalid apiConfigsJson5: not an array`)
        return null
    }
    return true
}

export function parseApiConfigsJson5(apiConfigsJson5String) {
    try {
        apiConfigsJson5String = apiConfigsJson5String.trim()
        if (!apiConfigsJson5String) {
            return []
        }
        const apiConfigs = JSON5.parse(apiConfigsJson5String)
        if (!isValidApiConfigs(apiConfigs)) {
            return null
        }
        return apiConfigs

    } catch (error) {
        ElMessage.error(`Invalid apiConfigsJson5: ${error.message}`)
        return null
    }
}

export function ControlParameterStateClosure({ apiConfigs = null, modelNameTags = null, modelName = null } = {}) {
    const globalStore = useGlobalStore()
    const isMounted = ref(false)
    onMounted(() => {
        isMounted.value = true
    })

    const apiConfigsInput = isRef(apiConfigs) ? apiConfigs : ref(apiConfigs || [deepCopy(defaultApiConfig)])
    const apiConfigsLocalStorage = ref([])
    function refreshApiConfigs() {
        var newLocalStorageApiConfigs = []
        if (globalStore.enableLocalStorageApiConfigs && localStorage.getItem('onPandaApiConfigsJson5')) {
            // integrate onPandaApiConfigsJson5@localStorage if exists
            const localStorageApiConfigs = parseApiConfigsJson5(localStorage.getItem('onPandaApiConfigsJson5'))
            if (localStorageApiConfigs) {
                newLocalStorageApiConfigs = localStorageApiConfigs
            }
        }
        apiConfigsLocalStorage.value = newLocalStorageApiConfigs  // refresh any way
    }
    refreshApiConfigs()
    const apiConfigsComputed = computed(() => {
        return [...apiConfigsLocalStorage.value, ...apiConfigsInput.value]
    })
    const modelNameTagsInput = isRef(modelNameTags) ? modelNameTags : ref(modelNameTags || {})

    function getModelNameTags(apiConfigs) {
        const modelNameTags = {}
        for (const apiConfig of apiConfigs) {
            if (apiConfig.tag_name) {
                if (apiConfig?.chat_config?.model) {
                    var modelQuery = (apiConfig.endpoint_name || "<|endpoint|>") + "—" + apiConfig?.chat_config?.model
                } else {
                    var modelQuery = (apiConfig.endpoint_name || "<|endpoint|>") + "—"
                }
                modelNameTags[apiConfig.tag_name] = modelQuery
            }
        }
        return modelNameTags
    }

    const modelNameTagsComputed = computed(() => {
        return { ...getModelNameTags(apiConfigsComputed.value), ...modelNameTagsInput.value }
    })

    var modelName = isRef(modelName) ? modelName : ref(modelName || Object.keys(modelNameTagsComputed.value)[0] || 'on-panda')   // using first tag as default model

    const apiConfigControllableRaw = { chat_config: deepCopy(defaultChatConfig) }
    const chatConfigControllableRaw = apiConfigControllableRaw.chat_config
    const apiConfigControllable = ref(apiConfigControllableRaw)
    const chatConfigControllable = ref(chatConfigControllableRaw)
    const chatConfigControllableKeys = Object.keys(chatConfigControllable.value)

    const extraChatParametersString = ref("")
    const extraChatParameters = computed(() => {
        try {
            return extraChatParametersString.value ? JSON5.parse(extraChatParametersString.value) : {}
        } catch (error) {
            return {}
        }
    })

    const apiConfigReceived = ref([])
    const keyToApiConfigs = computed(() => {
        const keyToApiConfigs = {}
        for (const configs of apiConfigReceived.value) {
            if (configs && configs.length) {
                for (const [index, config] of configs.entries()) {
                    var key = (config.endpoint_name ? config.endpoint_name : "<|endpoint|>") + "—" + (configs.length > 1 ? `${index + 1}—` : '') + (config.chat_config.model || '<|None|>')
                    keyToApiConfigs[key] = config
                }
            }
        }
        return keyToApiConfigs
    }, { flush: 'sync' })

    const watchApiConfigsResolver = ref(() => { })  // promise hook that will be resolved when watchApiConfigs is finished
    const isWatchApiConfigsTriggered = ref(false)
    // delay seconds to trigger default watchApiConfigs update
    // to ensure apiConfigs is updated only once if apiConfigs is changed
    onMounted(() => {
        setTimeout(() => {
            if (!isWatchApiConfigsTriggered.value) {
                watchApiConfigs(apiConfigsComputed.value)
            }
        }, 2000)
    })
    async function watchApiConfigs(newValue) {
        // Asynchronous concurrent request without changing the order
        // and not block by slow response
        isWatchApiConfigsTriggered.value = true

        const configPromises = [];
        if (apiConfigReceived.value.length !== newValue.length) {
            apiConfigReceived.value = new Array(newValue.length).fill(null);
        }

        for (let i = 0; i < newValue.length; i++) {
            const apiConfig = deepCopy(newValue[i]);
            if (!apiConfig.chat_config) {
                apiConfig.chat_config = {}
            }
            // If model is specified, return a promise that resolves to a single config
            if (apiConfig.chat_config.model) {
                apiConfigReceived.value[i] = [apiConfig]
            } else {
                // For configs without a model, fetch the model list concurrently
                const fetchPromise = (async (i) => {
                    try {
                        const openai = new OpenAI(ObjctKeyToCamelCaseNaming(apiConfig.client_config));
                        const list = await openai.models.list();
                        apiConfigReceived.value[i] = list.map(model => {
                            const apiConfigWithModel = deepCopy(apiConfig);
                            apiConfigWithModel.chat_config.model = model.id;
                            return apiConfigWithModel;
                        });
                    } catch (error) {
                        // warning(error)
                        setTimeout(() => {
                            if (isMounted.value) {
                                ElMessage({
                                    showClose: true,
                                    message: `Error in fetching models list of "${apiConfig.endpoint_name}":\n ${error.message}`,
                                    type: 'error',
                                    duration: 10000,
                                })
                            }
                        }, isMounted.value ? 0 : 2000)
                        console.log("Error in fetching models list");
                        console.log(error);
                        // keep resolver chain alive even when list fetch fails
                        apiConfigReceived.value[i] = []
                    }
                })(i);
                configPromises.push(fetchPromise);
            }
        }
        await Promise.all(configPromises);
        watchApiConfigsResolver.value()
    }
    watch(apiConfigsComputed, watchApiConfigs)

    const apiConfigChosen = computed(() => {
        var apiConfigChosen = defaultApiConfig
        const currentModelName = modelName.value || ''
        for (const [key, config] of Object.entries(keyToApiConfigs.value)) {
            const isMatch = key.includes(currentModelName) || isEndpointModelMatchIgnoringIndex(key, currentModelName)  // keep current model name when refreshing model list
            if (isMatch) {
                apiConfigChosen = config
                if (key !== modelName.value) {
                    modelName.value = key
                }
                break
            }
        }
        const changedChatConfig = {}
        for (const key of chatConfigControllableKeys) { // apply apiConfigChosen.chat_config
            if (key in apiConfigChosen.chat_config) {
                // Using chatConfigControllableRaw to avoid adjusting parameters causes recomputed
                if (key !== 'model' && JSON.stringify(apiConfigChosen.chat_config[key]) !== JSON.stringify(chatConfigControllableRaw[key])) {
                    changedChatConfig[key] = apiConfigChosen.chat_config[key]
                }
                chatConfigControllable.value[key] = apiConfigChosen.chat_config[key]
            }
        }
        if (Object.keys(changedChatConfig).length > 0) {
            // If ElMessage is poped up at beginning, will raise error:
            // TypeError: Cannot read properties of null (reading 'insertBefore')
            setTimeout(() => {
                if (isMounted.value) {
                    ElMessage.warning(`Change the control parameter: ${JSON.stringify(changedChatConfig)}`)
                }
            }, isMounted.value ? 0 : 2000)
        }
        return apiConfigChosen
    })

    const apiConfig = computed(() => {
        // update apiConfig with defaultApiConfig
        var apiConfig = { ...apiConfigChosen.value }  // copy instead of reference
        apiConfig = { ...defaultApiConfig, ...apiConfigChosen.value, ...apiConfigControllable.value }
        apiConfig.client_config = { ...defaultApiConfig.client_config, ...apiConfigChosen.value.client_config }
        apiConfig.chat_config = { ...defaultApiConfig.chat_config, ...apiConfigChosen.value.chat_config, ...chatConfigControllable.value, ...extraChatParameters.value }
        apiConfig.client_config.base_url = apiConfig.client_config.base_url.replace('${origin}', window.location.origin)
        return apiConfig
    })


    return {
        keyToApiConfigs,
        modelNameTagsComputed,
        modelNameTagsInput,
        modelName,
        apiConfigControllable,
        apiConfig,
        extraChatParametersString,
        extraChatParameters,
        watchApiConfigsResolver,
        apiConfigsComputed,
        apiConfigsInput,
        refreshApiConfigs
    }
}
