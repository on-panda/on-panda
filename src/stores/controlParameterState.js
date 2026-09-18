import { ref, computed, toValue, watch, isRef, isReadonly, onMounted } from 'vue'
import JSON5 from 'json5'
import { OpenAI } from '../utils/fetchOpenaiApi.js'
import { ElMessage } from 'element-plus'
import { deepCopy } from '../utils/commonUtils.js'
import { useGlobalStore } from './globalStore.js'
import { ObjctKeyToCamelCaseNaming } from '../utils/commonUtils.js'
import { setDefaultResponseTemplate } from '../utils/responseTemplates/index.js'

export const defaultChatConfig = {
    stream: true,
    stream_options: {
        include_usage: true,
    },
    logprobs: true,
    top_logprobs: 20,
    // top_k: 2,
    max_tokens: null,
    temperature: 0.5,
    top_p: 0.95,
    spaces_between_special_tokens: false,  // In vLLM and Transformers it's default true, which may case additional leading space before first token or special tokens
}

// public API test server for onPanda
const PUBLIC_TEST_BASE_URL = ["https://vllm-test-api", "diyer22", "com/v1"].join('.')  

export const defaultApiConfig = {
    "endpoint_name": "endpoint-name",
    "model_roles": ["assistant"],
    "client_config": {
        base_url: import.meta.env.VITE_ON_PANDA_DEFAULT_BASE_URL || PUBLIC_TEST_BASE_URL,
        api_key: import.meta.env.VITE_ON_PANDA_DEFAULT_API_KEY || "no-api-key",
        // dangerouslyAllowBrowser: true
    },
    "chat_config": {
        model: import.meta.env.VITE_ON_PANDA_DEFAULT_MODEL || "tiny-model-for-api-test",
        ...deepCopy(defaultChatConfig),
    },
    // onPanda-only options.
    // force_require_approval: 'always',
    // max_tool_assets: 0,
    // tool_asset_keep_rounds: 0,
    // reasoning_key: 'reasoning_content',
    // image_detail_level: 'auto',
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

    const apiConfigsInput = isRef(apiConfigs) && !isReadonly(apiConfigs)
        ? apiConfigs
        : ref(toValue(apiConfigs) || [deepCopy(defaultApiConfig)])
    if (isRef(apiConfigs) && isReadonly(apiConfigs)) {
        watch(apiConfigs, value => {
            apiConfigsInput.value = value
        })
    }
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
        // apply low_priority
        return [...apiConfigsLocalStorage.value.filter(apiConfig => !apiConfig.low_priority), ...apiConfigsInput.value.filter(apiConfig => !apiConfig.low_priority), ...apiConfigsLocalStorage.value.filter(apiConfig => apiConfig.low_priority), ...apiConfigsInput.value.filter(apiConfig => apiConfig.low_priority)]
    })
    const modelNameTagsInput = isRef(modelNameTags) && !isReadonly(modelNameTags)
        ? modelNameTags
        : ref(toValue(modelNameTags) || {})
    if (isRef(modelNameTags) && isReadonly(modelNameTags)) {
        watch(modelNameTags, value => {
            modelNameTagsInput.value = value
        })
    }

    function getModelNameTags(apiConfigs) {
        const modelNameTags = {}
        for (const apiConfig of apiConfigs) {
            if (apiConfig.tag_name) {
                if (apiConfig?.chat_config?.model) {
                    if (apiConfig.endpoint_name) {
                        var modelQuery = apiConfig.endpoint_name + "—" + apiConfig?.chat_config?.model
                    } else {
                        // if has tag_name and model name, no endpoint_name, consider using a fuzzier matching approach
                        var modelQuery = apiConfig.chat_config.model
                    }
                } else {
                    var modelQuery = (apiConfig.endpoint_name || "<|endpoint|>") + "—"
                }
                modelNameTags[apiConfig.tag_name] = modelQuery
            }
        }
        return modelNameTags
    }

    const modelNameTagsComputed = computed(() => {
        return { ...getModelNameTags(apiConfigsComputed.value.filter(apiConfig => !apiConfig.low_priority)), ...modelNameTagsInput.value, ...getModelNameTags(apiConfigsComputed.value.filter(apiConfig => apiConfig.low_priority)) }
    })

    var modelName = isRef(modelName) ? modelName : ref(modelName || Object.values(modelNameTagsComputed.value)[0] || 'on-panda')   // using first tag target as default model

    const apiConfigControllableRaw = { chat_config: deepCopy(defaultChatConfig) }
    const chatConfigControllableRaw = apiConfigControllableRaw.chat_config
    const apiConfigControllable = ref(apiConfigControllableRaw)
    const chatConfigControllable = ref(chatConfigControllableRaw)
    const chatConfigControllableKeys = Object.keys(chatConfigControllable.value)

    const extraChatParametersString = ref("")
    const parsedExtraParameters = computed(() => {
        try {
            return extraChatParametersString.value ? JSON5.parse(extraChatParametersString.value) : {}
        } catch (error) {
            return {}
        }
    })
    const extraChatParameters = computed(() => {
        const parameters = { ...parsedExtraParameters.value }
        for (const key of Object.keys(parameters)) {
            if (key.startsWith('..')) {
                delete parameters[key]
            }
        }
        return parameters
    })
    const apiConfigExtraParameterEntries = computed(() => Object.entries(parsedExtraParameters.value).filter(([key]) => key.startsWith('..')))

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

    var resolveApiUpdateCompleted = null
    const apiUpdateCompletedPromise = ref(new Promise(resolve => {
        resolveApiUpdateCompleted = resolve
    }))
    const isWatchApiConfigsTriggered = ref(false)
    // delay seconds to trigger default watchApiConfigs update
    // to ensure apiConfigs/apiConfigsInput is updated only once if apiConfigs is changed in startup phase
    onMounted(() => {
        setTimeout(() => {
            if (!isWatchApiConfigsTriggered.value) {
                watchApiConfigs(apiConfigsComputed.value)
            }
        }, 2000)
    })
    function watchApiConfigs(newValue) {
        // Asynchronous concurrent request without changing the order
        // and not block by slow response
        if (isWatchApiConfigsTriggered.value) {
            apiUpdateCompletedPromise.value = new Promise(resolve => {
                resolveApiUpdateCompleted = resolve
            })
        } else {
            isWatchApiConfigsTriggered.value = true
        }
        let localResolveApiUpdateCompleted = resolveApiUpdateCompleted

        async function updateApiConfigs() {
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
                            // keep promise chain alive even when list fetch fails
                            apiConfigReceived.value[i] = []
                        }
                    })(i);
                    configPromises.push(fetchPromise);
                }
            }
            await Promise.all(configPromises);
            localResolveApiUpdateCompleted()
        }
        updateApiConfigs()
    }
    watch(apiConfigsComputed, watchApiConfigs, { flush: 'sync' })

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
                    ElMessage.warning({
                        message: `Change the control parameter: ${JSON.stringify(changedChatConfig)}`,
                        duration: 7000,
                        showClose: true,
                    })
                }
            }, isMounted.value ? 0 : 2000)
        }
        return apiConfigChosen
    })

    const apiConfig = computed(() => {
        // update apiConfig with defaultApiConfig
        var apiConfig = deepCopy({ ...defaultApiConfig, ...apiConfigChosen.value, ...apiConfigControllable.value })
        apiConfig.client_config = deepCopy({ ...defaultApiConfig.client_config, ...apiConfigChosen.value.client_config })
        apiConfig.chat_config = deepCopy({ ...defaultApiConfig.chat_config, ...apiConfigChosen.value.chat_config, ...chatConfigControllable.value, ...extraChatParameters.value })
        for (const [key, value] of apiConfigExtraParameterEntries.value) {
            const keyPath = key.slice(2).split('.')
            let target = apiConfig
            for (const pathKey of keyPath.slice(0, -1)) {
                target[pathKey] ??= {}
                target = target[pathKey]
            }
            target[keyPath.at(-1)] = value
        }
        // Deprecated: migrate only the legacy tool asset options from chat_config.
        for (const key of ['max_tool_assets', 'tool_asset_keep_rounds']) {
            if (!(key in apiConfig) && key in apiConfig.chat_config) {
                apiConfig[key] = apiConfig.chat_config[key]
            }
        }
        for (const key of ['image_detail_level', 'max_tool_assets', 'tool_asset_keep_rounds', 'reasoning_key']) {
            delete apiConfig.chat_config[key]
        }
        setDefaultResponseTemplate(apiConfig)
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
        apiUpdateCompletedPromise,
        apiConfigsComputed,
        apiConfigsInput,
        refreshApiConfigs
    }
}
