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


    const chatConfigRaw = deepCopy(defaultChatConfig)
    const chatConfig = ref(chatConfigRaw)
    const chatConfigKeys = Object.keys(chatConfig.value)


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

    var watchApiConfigsResolver = ref(() => { })
    watch(apiConfigs, async function watchApiConfigs(newValue) {
        // Asynchronous concurrent request without changing the order
        // and not block by slow response
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
    })

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
        for (const key of chatConfigKeys) { // apply apiConfigChosen.chat_config
            if (key in apiConfigChosen.chat_config) {
                // Using chatConfigRaw to avoid adjusting parameters causes recomputed
                if (key !== 'model' && JSON.stringify(apiConfigChosen.chat_config[key]) !== JSON.stringify(chatConfigRaw[key])) {
                    changedChatConfig[key] = apiConfigChosen.chat_config[key]
                }
                chatConfig.value[key] = apiConfigChosen.chat_config[key]
            }
        }
        if (Object.keys(changedChatConfig).length > 0) {
            // If ElMessage is poped up at beginning, will raise error:
            // TypeError: Cannot read properties of null (reading 'insertBefore')
            if (isMounted.value) {
                ElMessage.warning(`Change the control parameter: ${JSON.stringify(changedChatConfig)}`)
            }
        }
        return apiConfigChosen
    })

    const apiConfig = computed(() => {
        // update apiConfig with defaultApiConfig
        var apiConfig = { ...apiConfigChosen.value }  // copy instead of reference
        apiConfig.client_config = { ...defaultApiConfig.client_config, ...apiConfig.client_config }
        apiConfig.chat_config = { ...defaultApiConfig.chat_config, ...apiConfig.chat_config, ...chatConfig.value, ...extraChatParameters.value }
        apiConfig = { ...defaultApiConfig, ...apiConfig }
        apiConfig.client_config.base_url = apiConfig.client_config.base_url.replace('${origin}', window.location.origin)

        return apiConfig
    })


    return { keyToApiConfigs, modelNameTags, modelName, chatConfig, apiConfig, extraChatParametersString, extraChatParameters, watchApiConfigsResolver, apiConfigs }
}