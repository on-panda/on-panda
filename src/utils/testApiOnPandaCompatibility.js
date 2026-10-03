const DEFAULT_BASE_URL = 'https://api.inference.wandb.ai/v1'
const CLI_USAGE = `Usage: node testApiOnPandaCompatibility.js [options]

Options:
  --base_url <url>           API base URL (defaults to BASE_URL or ${DEFAULT_BASE_URL})
  --api_key <key>            API key (defaults to WANDB_API_KEY)
  --model <model>            Model name (defaults to MODEL; otherwise tests all models)
  --extra_parameters <json>  Extra request parameters as a JSON object
  --help                    Show this help

Example:
  node testApiOnPandaCompatibility.js --base_url ${DEFAULT_BASE_URL} --api_key $WANDB_API_KEY`

const weatherTool = {
  type: 'function',
  function: {
    name: 'get_city_weather',
    description: 'Get the current weather in a city',
    parameters: {
      type: 'object',
      properties: {
        city_name: {
          type: 'string',
          description: 'City name, e.g., New York City'
        },
        unit: {
          type: 'string',
          enum: ['celsius', 'fahrenheit']
        }
      },
      required: ['city_name', 'unit']
    }
  }
}

function pretty(value) {
  return JSON.stringify(value, null, 2)
}

function getLogger(log) {
  return log || globalThis.console?.log?.bind(globalThis.console) || (() => { })
}

function parseCliArguments(argumentsList) {
  const optionNames = ['base_url', 'api_key', 'model', 'extra_parameters']
  const options = {}

  for (let index = 0; index < argumentsList.length; index++) {
    const argument = argumentsList[index]
    if (argument === '--') {
      continue
    }
    if (argument === '--help' || argument === '-h') {
      options.help = true
      continue
    }
    if (!argument.startsWith('--')) {
      throw new Error(`Unexpected CLI argument: ${argument}`)
    }

    const equalsIndex = argument.indexOf('=')
    const optionName = equalsIndex === -1 ? argument.slice(2) : argument.slice(2, equalsIndex)
    if (!optionNames.includes(optionName)) {
      throw new Error(`Unknown CLI option: --${optionName}`)
    }

    const value = equalsIndex === -1 ? argumentsList[++index] : argument.slice(equalsIndex + 1)
    if (value === undefined) {
      throw new Error(`Missing value for CLI option: --${optionName}`)
    }
    options[optionName] = value
  }
  return options
}

function parseExtraParametersJson(value) {
  if (value === undefined) {
    return { chat_template_kwargs: { enable_thinking: false } }
  }

  let extraParameters
  try {
    extraParameters = JSON.parse(value)
  } catch (error) {
    throw new Error(`--extra_parameters must be valid JSON: ${error.message}`)
  }
  if (extraParameters === null || typeof extraParameters !== 'object' || Array.isArray(extraParameters)) {
    throw new Error('--extra_parameters must be a JSON object')
  }
  return extraParameters
}

async function requestJson({ url, method = 'POST', apiKey, extraHeaders, body, label, log }) {
  if (body) {
    body = Object.fromEntries(Object.entries(body).filter(([, value]) => value !== null))
  }
  log(`[${label}] request:\n${pretty({ url, method, body })}`)

  let response
  try {
    const headers = { 'Content-Type': 'application/json' }
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`
    }
    for (const [extraHeaderName, value] of Object.entries(extraHeaders)) {
      const existingHeaderName = Object.keys(headers).find(headerName => headerName.toLowerCase() === extraHeaderName.toLowerCase())
      if (existingHeaderName) {
        delete headers[existingHeaderName]
      }
      headers[extraHeaderName] = value
    }
    response = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(body)
    })
    let responseBody
    try {
      responseBody = await response.json()
    } catch (error) {
      log(`[${label}] response:\n${pretty({ status: response.status, error: String(error) })}`)
      throw error
    }
    log(`[${label}] response:\n${pretty({ status: response.status, body: responseBody })}`)

    if (response.ok === false) {
      throw new Error(`HTTP ${response.status}`)
    }
    return responseBody
  } catch (error) {
    if (!response) {
      log(`[${label}] response:\n${pretty({ error: String(error) })}`)
    }
    throw error
  }
}

async function runCompatibilityTest({ label, body, check, keyInfo, baseUrl, apiKey, extraHeaders, log }) {
  try {
    const response = await requestJson({
      url: `${baseUrl}/chat/completions`,
      apiKey,
      extraHeaders,
      body,
      label,
      log
    })
    const score = check(response) ? 1 : 0
    log(`[${label}] key info:\n${pretty({ ...keyInfo(response), score })}`)
    return { score }
  } catch (error) {
    log(`[${label}] key info:\n${pretty({ score: 0, error: String(error) })}`)
    return { score: 0 }
  }
}

async function testCors({ baseUrl, extraHeaders, log }) {
  const url = `${baseUrl}/chat/completions`
  const isBrowser = typeof window !== 'undefined'
  const origin = isBrowser ? window.location.origin : 'http://localhost:5173'
  const requestOptions = { method: 'OPTIONS' }
  if (!isBrowser) {
    const requestHeaderNames = [...new Set([
      'authorization',
      'content-type',
      ...Object.keys(extraHeaders).map(headerName => headerName.toLowerCase())
    ])]
    requestOptions.headers = {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': requestHeaderNames.join(',')
    }
  }

  log(`[CORS] request:\n${pretty({ url, ...requestOptions })}`)
  let response
  try {
    response = await fetch(url, requestOptions)
    const allowOrigin = response.headers.get('access-control-allow-origin')
    const endpointOrigin = new URL(url, isBrowser ? window.location.href : `${origin}/`).origin
    const sameOrigin = isBrowser && endpointOrigin === origin
    // Browser CORS responses may hide access-control-allow-origin from JavaScript.
    const score = isBrowser
      ? response.ok ? 1 : 0
      : sameOrigin || allowOrigin === '*' || allowOrigin === origin ? 1 : 0
    log(`[CORS] response:\n${pretty({
      status: response.status,
      accessControlAllowOrigin: allowOrigin,
      score
    })}`)
    return { score }
  } catch (error) {
    log(`[CORS] response:\n${pretty({ error: String(error) })}`)
    if (isBrowser) {
      log('[CORS] skipped: the browser could not distinguish CORS from a network failure')
      return { score: null }
    }
    return { score: 0 }
  }
}

export async function testChatCompeletionsOnPandaCompatibility({
  baseUrl,
  apiKey,
  extraHeaders = {},
  model,
  extraParameters = {},
  resultRef = { value: {} },
  log
} = {}) {
  baseUrl = baseUrl.replace(/\/$/, '')
  const logger = getLogger(log)
  if (!model) {
    const response = await requestJson({
      url: `${baseUrl}/models`,
      method: 'GET',
      apiKey,
      extraHeaders,
      label: 'models',
      log: logger
    })
    var data = Array.isArray(response) ? response : response.data
    const resultMetadata = resultRef.value
    resultRef.value = []
    for (const { id } of data) {
      resultRef.value.push({ ...resultMetadata, model: id })
      const modelResult = resultRef.value.at(-1)
      await testChatCompeletionsOnPandaCompatibility({
        baseUrl,
        apiKey,
        extraHeaders,
        model: id,
        extraParameters,
        resultRef: { value: modelResult },
        log: logger
      })
      modelResult.total_score = ['continue_final_messages', 'top_logprobs', 'tool_choice', 'prompt_logprobs', 'CORS']
        .reduce((total, key) => total + modelResult[key].score, 0)
    }
    resultRef.value.sort((a, b) => a.total_score - b.total_score)
    return resultRef.value
  }

  // Compatibility checks parse JSON responses, so keep requests non-streaming.
  const commonParameters = { model, ...extraParameters, stream: false }
  delete commonParameters.stream_options
  const continueParameters = {
    messages: [
      {
        role: 'user',
        content: 'Repeat `LLM-Native Interaction Design` only once, no other words'
      },
      {
        content: 'LLM-Native Interaction',
        role: 'assistant'
      }
    ],
    add_generation_prompt: false,
    continue_final_message: true,
  }

  resultRef.value.continue_final_messages = await runCompatibilityTest({
    label: 'continue_final_message',
    body: { ...continueParameters, ...commonParameters, max_tokens: 1 },
    check: response => {
      const message = response.choices[0].message
      return message.content?.includes('De')
        || message.reasoning?.includes('De')
        || message.reasoning_content?.includes('De')
    },
    keyInfo: response => {
      const message = response.choices[0].message
      return {
        content: message.content,
        reasoning: message.reasoning,
        reasoningContent: message.reasoning_content
      }
    },
    baseUrl,
    apiKey,
    extraHeaders,
    log: logger
  })
  const topLogprobsBody = { ...continueParameters, ...commonParameters, logprobs: true, top_logprobs: 5 }
  resultRef.value.top_logprobs = await runCompatibilityTest({
    label: 'top_logprobs',
    body: topLogprobsBody,
    check: response => topLogprobsBody.top_logprobs && response.choices[0].logprobs.content[0].top_logprobs.length >= topLogprobsBody.top_logprobs,
    keyInfo: response => ({
      topLogprobsCount: response.choices[0].logprobs.content[0].top_logprobs.length
    }),
    baseUrl,
    apiKey,
    extraHeaders,
    log: logger
  })

  resultRef.value.tool_choice = await runCompatibilityTest({
    label: 'tool_choice',
    body: {
      tool_choice: 'none',
      skip_special_tokens: false,
      messages: [{
        role: 'user',
        content: 'call the tool to tell me the °C in New York City?'
      }],
      tools: [weatherTool],
      ...commonParameters,
      max_tokens: 4096,
    },
    check: response => {
      const content = response.choices[0].message.content
      return content?.includes('get_city_weather') && content?.includes('city_name') && content?.includes('unit')
    },
    keyInfo: response => ({ content: response.choices[0].message.content }),
    baseUrl,
    apiKey,
    extraHeaders,
    log: logger
  })

  resultRef.value.prompt_logprobs = await runCompatibilityTest({
    label: 'prompt_logprobs',
    body: {
      messages: [
        { role: 'user', content: '1 + 1 = ?' },
        { content: '1 + 1 = 3', role: 'assistant' }
      ],
      prompt_logprobs: 2,
      add_generation_prompt: false,
      continue_final_message: true,
      ...commonParameters,
      max_tokens: 1,
      logprobs: true,
    },
    check: response => Array.isArray(response.prompt_logprobs)
      ? response.prompt_logprobs.length > 0
      : Boolean(response.prompt_logprobs),
    keyInfo: response => ({
      promptLogprobsCount: Array.isArray(response.prompt_logprobs) ? response.prompt_logprobs.length : null,
      hasPromptLogprobs: Boolean(response.prompt_logprobs)
    }),
    baseUrl,
    apiKey,
    extraHeaders,
    log: logger
  })

  resultRef.value.CORS = await testCors({ baseUrl, extraHeaders, log: logger })

  return resultRef.value
}

export default testChatCompeletionsOnPandaCompatibility

async function runCli(argumentsList) {
  const cliOptions = parseCliArguments(argumentsList)
  if (cliOptions.help) {
    console.log(CLI_USAGE)
    return
  }

  const result = await testChatCompeletionsOnPandaCompatibility({
    baseUrl: cliOptions.base_url ?? process.env.BASE_URL ?? DEFAULT_BASE_URL,
    apiKey: cliOptions.api_key ?? process.env.WANDB_API_KEY,
    model: cliOptions.model ?? process.env.MODEL,
    extraParameters: parseExtraParametersJson(cliOptions.extra_parameters)
  })
  console.log(pretty(result))
}

const invokedFile = typeof process !== 'undefined' ? process.argv?.[1] : undefined
const moduleFile = decodeURIComponent(new URL(import.meta.url).pathname)
const isDirectNodeExecution = invokedFile && (
  invokedFile === moduleFile || invokedFile.replaceAll('\\', '/') === moduleFile
)

if (isDirectNodeExecution) {
  runCli(process.argv.slice(2)).catch(error => {
    console.error(String(error))
    process.exitCode = 1
  })
}
