export const testApiConfig = {
  endpoint_name: 'public-test',
  client_config: {
    base_url: 'https://vllm-test-api.diyer22.com/v1',
    api_key: 'null',
  },
  chat_config: {
    model: 'tiny-model-for-api-test',
    stream: true,
    logprobs: true,
    top_logprobs: 20,
    max_tokens: 512,
    temperature: 0.5,
    stream_options: {
      include_usage: true,
    },
    chat_template_kwargs: {"enable_thinking": false},
  },
}

export const testApiConfigs = [testApiConfig]

export const testModelNameTags = {
  'on-panda': 'tiny-model-for-api-test',
}
