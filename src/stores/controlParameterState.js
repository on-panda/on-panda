import { ref, computed, toValue, watch, isRef, onMounted } from 'vue'
import { deepCopy } from '../utils/commonUtils'
import { useGlobalStore } from './globalStore'
import { ElMessage } from 'element-plus'
import { OpenAI } from '../utils/fetchOpenaiApi'
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

export function ControlParameterStateClosure({ apiConfigs = null, modelNameTags = null, modelName = null } = {}) {
    const globalStore = useGlobalStore()
    const isMounted = ref(false)
    onMounted(() => {
        isMounted.value = true
    })

    var apiConfigs = isRef(apiConfigs) ? apiConfigs : ref(apiConfigs || [deepCopy(defaultApiConfig)])
    var modelNameTags = isRef(modelNameTags) ? modelNameTags : ref(modelNameTags || {})
    var modelName = isRef(modelName) ? modelName : ref(modelName || modelNameTags.value['on-panda'] || 'on-panda')   // using endpoint_name == 'on-panda' as default model

    const apiConfigControllableRaw = { chat_config: deepCopy(defaultChatConfig) }
    const chatConfigControllableRaw = apiConfigControllableRaw.chat_config
    const apiConfigControllable = ref(apiConfigControllableRaw)
    const chatConfigControllable = ref(chatConfigControllableRaw)
    const chatConfigControllableKeys = Object.keys(chatConfigControllable.value)

    // TODO: add "set" button to set extra_parameters and pop ElMessage when parsing error. if same, button will be disabled.
    const extraChatParametersString = ref("")
    const extraChatParameters = computed(() => {
        try {
            return extraChatParametersString.value ? JSON.parse(extraChatParametersString.value) : {}
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
                    var key = (config.endpoint_name ? config.endpoint_name : "endpoint") + "—" + (configs.length > 1 ? `${index + 1}—` : '') + (config.chat_config.model || '<|None|>')
                    if (globalStore.isMobile.value) {
                        key = (config.chat_config.model || '<|None|>') + ' | ' + (config.endpoint_name ? config.endpoint_name : "") + ` | ${index + 1}`
                    }
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
                watchApiConfigs(apiConfigs.value)
            }
        }, 2000)
    })
    async function watchApiConfigs(newValue) {
        // Asynchronous concurrent request without changing the order
        // and not block by slow response
        isWatchApiConfigsTriggered.value = true

        const configPromises = [];
        apiConfigReceived.value = new Array(newValue.length).fill(null);

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
                        throw error
                    }
                })(i);
                configPromises.push(fetchPromise);
            }
        }
        await Promise.all(configPromises);
        watchApiConfigsResolver.value()
    }
    watch(apiConfigs, watchApiConfigs)

    const apiConfigChosen = computed(() => {
        var apiConfigChosen = defaultApiConfig
        for (const [key, config] of Object.entries(keyToApiConfigs.value)) {
            if (key.includes(modelName.value)) {
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


    return { keyToApiConfigs, modelNameTags, modelName, apiConfigControllable, apiConfig, extraChatParametersString, extraChatParameters, watchApiConfigsResolver, apiConfigs }
}