import { useGlobalStore } from '../stores/globalStore.js'
import { ElMessage } from 'element-plus'
import { retryWithSchedule, parseSseJsonStream } from './apiProtocols/utils.js'
import { mergeTwoDeltas } from './responseTemplates/index.js'

const promptLogprobsToTopLogprobs = (promptLogprob, chosenTokenId) => {
  // list of {tokenId: obj} => same as top_logprobs, TokenId are string
  var sortPrompt = (a, b) => {
    if (a == chosenTokenId) {
      return -1;
    }
    if (b == chosenTokenId) {
      return 1;
    }
    return promptLogprob[a].rank - promptLogprob[b].rank;
  }
  var sortedTokenIds = Object.keys(promptLogprob).sort(sortPrompt);

  const normalizeTokenId = (tokenId) => {
    const tokenIdNumber = Number(tokenId)
    return Number.isInteger(tokenIdNumber) ? tokenIdNumber : tokenId
  }
  var top_logprobs = sortedTokenIds.map(tokenId => {
    let logprob = promptLogprob[tokenId]
    const normalizedTokenId = normalizeTokenId(tokenId)
    logprob.token = logprob.decoded_token
    logprob.token_ids = [normalizedTokenId]
    return logprob
  });
  var logprobChosen = JSON.parse(JSON.stringify(top_logprobs[0]))
  logprobChosen.top_logprobs = top_logprobs
  var logprobs = {
    content: [logprobChosen]
  }
  return logprobs
}

function splitTextByLogprobs(text, logprobsContent) {
  const splitTexts = Array.from({ length: logprobsContent.length }, () => '')
  const tokenTextAt = (index) => logprobsContent[index]?.token ?? ''
  const canSplitFrom = (logprobIndex, textOffset) => {
    if (logprobIndex >= logprobsContent.length) {
      return textOffset === text.length
    }
    const tokenText = tokenTextAt(logprobIndex)
    if (tokenText) {
      return text.startsWith(tokenText, textOffset) && canSplitFrom(logprobIndex + 1, textOffset + tokenText.length)
    }

    let nextLogprobIndex = logprobIndex + 1
    while (nextLogprobIndex < logprobsContent.length && !tokenTextAt(nextLogprobIndex)) {
      nextLogprobIndex++
    }
    if (nextLogprobIndex >= logprobsContent.length) {
      return true
    }

    const nextTokenText = tokenTextAt(nextLogprobIndex)
    for (let offset = textOffset; offset <= text.length - nextTokenText.length; offset++) {
      if (text.startsWith(nextTokenText, offset) && canSplitFrom(nextLogprobIndex + 1, offset + nextTokenText.length)) {
        return true
      }
    }
    return false
  }

  let offset = 0
  for (let index = 0; index < logprobsContent.length; index++) {
    const tokenText = tokenTextAt(index)
    const remaining = text.slice(offset)
    if (!remaining) {
      continue
    }
    if (tokenText && remaining.startsWith(tokenText)) {
      offset += tokenText.length
      splitTexts[index] = tokenText
      continue
    }
    if (!tokenText) {
      let nextLogprobIndex = index + 1
      while (nextLogprobIndex < logprobsContent.length && !tokenTextAt(nextLogprobIndex)) {
        nextLogprobIndex++
      }
      let hiddenEnd = text.length
      if (nextLogprobIndex < logprobsContent.length) {
        hiddenEnd = offset
        const nextTokenText = tokenTextAt(nextLogprobIndex)
        for (let nextOffset = offset; nextOffset <= text.length - nextTokenText.length; nextOffset++) {
          if (text.startsWith(nextTokenText, nextOffset) && canSplitFrom(nextLogprobIndex + 1, nextOffset + nextTokenText.length)) {
            hiddenEnd = nextOffset
            break
          }
        }
      }
      splitTexts[nextLogprobIndex - 1] = text.slice(offset, hiddenEnd)
      offset = hiddenEnd
      index = nextLogprobIndex - 1
      continue
    }
    if (index === logprobsContent.length - 1) {
      offset = text.length
      splitTexts[index] = remaining
    }
  }
  if (offset < text.length && splitTexts.length) {
    splitTexts[splitTexts.length - 1] += text.slice(offset)
  }
  return splitTexts
}

async function* splitMultiTokensChunk(stream) {
  // split one stream chunk with multi deltaFields and mullti tokens
  // TODO: figure out splitMultiTokensChunk logic and organize code
  // reproduce bug using step-3.7-flash with this prompt:
  /* 
Repeat only once, no other words:
```
Flash) ⭐ 250
Flash) ⭐ 250
Flash) ⭐ 250
```
  */
  for await (const chunk of stream) {
    const choices = chunk?.choices
    if (!Array.isArray(choices) || choices.length !== 1) {
      yield chunk
      continue
    }

    const choice = choices[0]
    const logprobsContent = choice?.logprobs?.content
    if (!Array.isArray(logprobsContent) || logprobsContent.length <= 1) {
      yield chunk
      continue
    }

    const delta = choice?.delta
    if (delta.content === null) {
      delete delta.content
    }
    if ((typeof delta.reasoning_content === 'string' || typeof delta.reasoning === 'string') && delta.content === "") {
      // sometimes, reasoning_content or reasoning is string and content is empty string
      delete delta.content
    }
    const deltaFields = ['reasoning_content', 'reasoning', 'content'].filter(field => typeof delta[field] === 'string' && delta[field] !== '')
    const toolCall = delta.tool_calls?.[0]
    const toolCallArguments = toolCall?.function?.arguments
    const splitToolCallName = !deltaFields.length && typeof toolCall?.function?.name === 'string' && toolCall.function.name !== ''
    const splitToolCallArguments = !deltaFields.length && typeof toolCallArguments === 'string' && toolCallArguments !== ''
    if (!deltaFields.length && !splitToolCallName && !splitToolCallArguments) {
      yield chunk
      continue
    }
    choice.tokenInfo = choice.tokenInfo ?? ''  // add tokenInfo for debugging TODO: remove
    choice.tokenInfo += deltaFields.map(field => delta[field]).join('')

    let fieldIndex = 0
    let fieldOffset = 0
    const deltaField = deltaFields[0]
    const deltaText = delta?.[deltaField] ?? ''
    const splitTokenTexts = deltaFields.length === 1 ? splitTextByLogprobs(deltaText, logprobsContent) : null
    const splitToolCallArgumentTexts = splitToolCallArguments ? splitTextByLogprobs(toolCallArguments, logprobsContent) : null

    for (let i = 0; i < logprobsContent.length; i++) {
      const logprobItem = logprobsContent[i]
      const isLast = i === logprobsContent.length - 1
      let splitDelta
      if (splitToolCallArguments) {
        const splitTokenText = splitToolCallArgumentTexts[i]
        const splitToolCall = i === 0
          ? { ...toolCall, function: { ...toolCall.function, arguments: splitTokenText } }
          : { index: toolCall.index, function: { arguments: splitTokenText } }
        splitDelta = { ...delta, tool_calls: [splitToolCall] }
      } else if (splitToolCallName) {
        splitDelta = isLast ? delta : { content: "" }
      } else if (deltaFields.length > 1) {
        splitDelta = { ...delta }
        for (const field of deltaFields) {
          delete splitDelta[field]
        }
        const tokenText = logprobItem?.token ?? ''
        if (!tokenText && fieldIndex < deltaFields.length) {
          const field = deltaFields[fieldIndex]
          const fieldText = delta[field]
          const fieldRemaining = fieldText.slice(fieldOffset)
          const splitTokenText = splitTextByLogprobs(fieldRemaining, logprobsContent.slice(i))[0]
          splitDelta[field] = splitTokenText
          fieldOffset += splitTokenText.length
          if (fieldOffset === fieldText.length) {
            fieldIndex++
            fieldOffset = 0
          }
        }
        let tokenOffset = 0
        while (tokenOffset < tokenText.length && fieldIndex < deltaFields.length) {
          const field = deltaFields[fieldIndex]
          const fieldText = delta[field]
          const fieldRemaining = fieldText.slice(fieldOffset)
          if (!fieldRemaining) {
            fieldIndex++
            fieldOffset = 0
            continue
          }

          let tokenRemaining = tokenText.slice(tokenOffset)
          if (!fieldRemaining.startsWith(tokenRemaining) && !tokenRemaining.startsWith(fieldRemaining)) {
            let nextTokenOffset = -1
            for (let index = 1; index < tokenRemaining.length; index++) {
              const nextTokenRemaining = tokenRemaining.slice(index)
              if (fieldRemaining.startsWith(nextTokenRemaining) || nextTokenRemaining.startsWith(fieldRemaining)) {
                nextTokenOffset = index
                break
              }
            }
            if (nextTokenOffset === -1) {
              break
            }
            tokenOffset += nextTokenOffset
            tokenRemaining = tokenText.slice(tokenOffset)
          }

          const splitTokenText = fieldRemaining.startsWith(tokenRemaining) ? tokenRemaining : fieldRemaining
          splitDelta[field] = (splitDelta[field] || '') + splitTokenText
          fieldOffset += splitTokenText.length
          tokenOffset += splitTokenText.length
          if (fieldOffset === fieldText.length) {
            fieldIndex++
            fieldOffset = 0
          }
        }
      } else {
        const splitTokenText = splitTokenTexts[i]
        splitDelta = { ...delta, [deltaField]: splitTokenText }
      }
      if (i > 0 && 'role' in splitDelta) {
        delete splitDelta.role
      }

      const splitChoice = {
        ...choice,
        delta: splitDelta,
        logprobs: { ...choice.logprobs, content: [logprobItem] },
      }
      if (Array.isArray(choice.token_ids)) {
        splitChoice.token_ids = choice.token_ids.slice(i, i + 1)
      }
      if (!isLast && 'finish_reason' in splitChoice) {
        delete splitChoice.finish_reason
      }

      const splitChunk = {
        ...chunk,
        choices: [splitChoice],
      }
      if (!isLast && 'usage' in splitChunk) {
        delete splitChunk.usage
      }
      yield splitChunk
    }
  }
}

async function* normalizeReasoningField(stream) {
  // Unify `delta.reasoning_content` into `delta.reasoning` for downstream consumers
  for await (const chunk of stream) {
    const delta = chunk?.choices?.[0]?.delta
    if (delta && typeof delta.reasoning_content === 'string') {
      if (!('reasoning' in delta)) {
        delta.reasoning = delta.reasoning_content
      }
      delete delta.reasoning_content
    }
    yield chunk
  }
}

async function* removeTokenPrefixSpaceForWandbAPI({ stream, apiConfig } = {}) {
  // Workaround for bug in wandb API like:
  // `"delta":{"content":" Hi"},"logprobs":{"content":[{"token":"Hi","logprob":-0.0835`
  // Sometimes wandb sends `"delta":{"content":" "}` for invisible special tokens like `<|tool_calls_section_begin|>`.
  if (!apiConfig.client_config.base_url.includes('wandb.ai') && !apiConfig?.chat_config?.model?.includes('wandb')) {
    yield* stream
    return
  }
  for await (const chunk of stream) {
    const choice = chunk?.choices?.[0]
    const logprobToken = choice?.logprobs?.content?.[0]?.token
    const isSpecialLogprobToken = typeof logprobToken === 'string' && logprobToken.startsWith('<|') && logprobToken.endsWith('|>')
    for (const field of ['content', 'reasoning']) {
      const text = choice?.delta?.[field]
      if (text === ' ' && isSpecialLogprobToken) {
        choice.delta[field] = ''
        continue
      }
      if (typeof text === 'string' && text.startsWith(' ')) {
        const trimmed = text.slice(1)
        if (trimmed.length > 0 && trimmed === logprobToken) {
          choice.delta[field] = trimmed
        }
      }
    }
    for (const toolCall of choice?.delta?.tool_calls || []) {
      const argumentsText = toolCall.function?.arguments
      if (argumentsText === ' ' && isSpecialLogprobToken) {
        toolCall.function.arguments = ''
        continue
      }
      if (typeof argumentsText === 'string' && argumentsText.startsWith(' ')) {
        const trimmed = argumentsText.slice(1)
        if (trimmed.length > 0 && trimmed === logprobToken) {
          toolCall.function.arguments = trimmed
        }
      }
    }
    yield chunk
  }
}

async function* mergeMultiToolCallsInOneChunk(stream) {
  // Some APIs (e.g. kimi on wandb) pack the tool name and the first argument fragment
  // as two array entries sharing the same index within a single chunk. Merge same-index
  // entries so downstream parsers can keep assuming one entry per index per delta.
  for await (const chunk of stream) {
    const toolCalls = chunk?.choices?.[0]?.delta?.tool_calls
    if (!toolCalls || toolCalls.length <= 1) {
      yield chunk
      continue
    }
    const mergedByIndex = []
    for (const toolCall of toolCalls) {
      const existing = mergedByIndex[toolCall.index]
      mergedByIndex[toolCall.index] = existing
        ? mergeTwoDeltas(existing, toolCall, ['type', 'id', 'name'])
        : toolCall
    }
    chunk.choices[0].delta.tool_calls = mergedByIndex.filter(Boolean)
    yield chunk
  }
}

async function* repairStrippedFirstContinueToken({ stream, requestBody } = {}) {
  // Workaround for doubao-seed series: under continue_final_message, the first
  // continue token's `delta.content` is left-stripped, while
  // `logprobs.content[0].token` preserves the original.
  // e.g. `delta.content`="the" vs `logprobs.content[0].token`=" the"
  if (!requestBody.continue_final_message) {
    yield* stream
    return
  }
  let needCheck = true
  for await (const chunk of stream) {
    if (needCheck) {
      const choice = chunk?.choices?.[0]
      const token = choice?.logprobs?.content?.[0]?.token
      if (typeof token === 'string') {
        const stripped = token.trimStart()
        if (stripped.length > 0 && stripped !== token && stripped === choice?.delta?.content) {
          choice.delta.content = token
        }
        needCheck = false
      }
    }
    yield chunk
  }
}

export async function* normalizeStream({ stream, requestBody, apiConfig } = {}) {
  stream = normalizeReasoningField(stream)
  stream = splitMultiTokensChunk(stream)
  stream = removeTokenPrefixSpaceForWandbAPI({ stream, apiConfig })
  stream = mergeMultiToolCallsInOneChunk(stream)
  stream = repairStrippedFirstContinueToken({ stream, requestBody })
  yield* stream
}

export class OpenAI {
  // imitate openai-node without x-stainless-os 
  // x-stainless-os in header may not allowed in browser
  constructor(config) {
    this.baseURL = config.baseURL || 'https://api.openai.com/v1';
    this.apiKey = config.apiKey;

    // 创建 chat.completions API 结构
    this.chat = {
      completions: {
        create: this.createChatCompletion.bind(this)
      }
    };

    // 创建 models API 结构
    this.models = {
      list: this.listModels.bind(this)
    };
    this.globalStore = useGlobalStore()
  }

  async createChatCompletion(body, options = null) {
    if (this.globalStore.hooks?.beforeCreateChatCompletion?.length) {
      for (let hook of this.globalStore.hooks.beforeCreateChatCompletion) {
        body = await hook(body)
      }
    }

    options = options || {};

    const url = `${this.baseURL}/chat/completions`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    };

    const response = await retryWithSchedule(() => fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
      ...options
    }), [5000, 30000]);

    // 如果是流模式，我们要解析 EventStream 响应
    if (body.stream) {
      // 返回一个异步迭代器用于处理流式的响应
      return {
        [Symbol.asyncIterator]: async function* () {
          const onJsonParseError = (error) => {
            setTimeout(() => {
              ElMessage({
                showClose: true,
                message: `${error.message}`,
                type: 'error',
                duration: 10000,
              })
            }, 1000)
            console.error('Error parsing JSON:', error);
          }
          for await (const parsedData of parseSseJsonStream(response, { onJsonParseError })) {
            try {
              // forward real error when API that does not support HTTP status code (SADO-platform)
              if ((parsedData?.object == "error") && (parsedData?.code) && (parsedData.code != 200)) {
                throw new Error(`Failed to fetch completions (Code: ${parsedData.code}): ${JSON.stringify(parsedData)} `);
              }
              if (!parsedData.choices && parsedData.detail) {
                throw new Error(`Failed to fetch completions: ${JSON.stringify(parsedData)}`);
              }
              yield parsedData
            } catch (error) {
              setTimeout(() => {
                ElMessage({
                  showClose: true,
                  message: `${error.message}`,
                  type: 'error',
                  duration: 10000,
                })
              }, 1000)
              console.error('Error parsing JSON:', error);
              continue; // 如果解析错误，跳过当前 chunk
            }
          }
        },
      };
    } else {
      var raw = await response.text();
      const json = JSON.parse(raw);
      if (json.prompt_logprobs) {
        if (json.prompt_token_ids) {
          var chosens = json.prompt_token_ids.map(x => x.toString())
          if (chosens.length == json.prompt_logprobs.length && !json.prompt_logprobs[0]) {
            // aovid first prompt token is null
            chosens = chosens.slice(1)
          }
        } else {
          // workround for unknow which token is chosen in prompt_logprobs (vLLM BUG)
          var prompt_logprobs_raw = raw.split("prompt_logprobs")[1]

          const regex = /}},\{"(\d+)":/g;
          const allMatches = prompt_logprobs_raw.match(regex);
          var chosens = allMatches.map(match => match.match(/(\d+)/)[1])
          chosens = [raw.match(/{"(\d+)":\{"logprob":/)[1], ...chosens]
        }
        json.prompt_logprobs_list = chosens.map((chosenTokenId, index) => {
          var reverseIndex = index - chosens.length;
          var promptLogprob = json.prompt_logprobs[json.prompt_logprobs.length + reverseIndex];
          return promptLogprobsToTopLogprobs(promptLogprob, chosenTokenId);
        });
      }
      return json;
    }
  }

  async listModels() {
    const url = `${this.baseURL}/models`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    };

    const response = await fetch(url, {
      method: 'GET',
      headers: headers
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}\n${await response?.text()}`);
    }

    const json = await response.json();
    return json.data;
  }
}
