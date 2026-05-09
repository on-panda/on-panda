import { useGlobalStore } from '../stores/globalStore'
import { ElMessage } from 'element-plus'

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

export async function* splitMultiTokensChunk(stream) {
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
    if (typeof delta.reasoning_content === 'string' || typeof delta.reasoning === 'string' && delta.content === "") {
      // sometimes, reasoning_content or reasoning is string and content is empty string
      delete delta.content
    }
    const deltaField = delta && (('content' in delta && 'content') ||
      ('reasoning_content' in delta && 'reasoning_content') ||
      ('reasoning' in delta && 'reasoning'))
    if (!deltaField) {
      yield chunk
      continue
    }
    choice.tokenInfo = choice.tokenInfo ?? ''  // add tokenInfo for debugging TODO: remove
    choice.tokenInfo += delta?.[deltaField] ?? ''

    const deltaText = delta?.[deltaField] ?? ''
    const tokensText = logprobsContent.map(item => item?.token ?? '').join('')

    for (let i = 0; i < logprobsContent.length; i++) {
      const logprobItem = logprobsContent[i]
      const isLast = i === logprobsContent.length - 1
      if (tokensText == deltaText) {  // try to split
        var splitTokenText = logprobItem?.token ?? ''
      } else {  // else its one patch
        var splitTokenText = isLast ? deltaText : ''
      }
      const splitDelta = { ...delta, [deltaField]: splitTokenText }
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

// Fetch with retry on transient failures (5xx, network/CORS) at fixed offsets (ms) from the first attempt's start.
// Skip an offset if it has already elapsed; throw the last error after all offsets are exhausted.
// Bail immediately on AbortError or HTTP 4xx.
async function retryWithSchedule(fn, schedule) {
  const startTime = Date.now()
  let lastError
  for (let attempt = 0; attempt <= schedule.length; attempt++) {
    if (attempt > 0) {
      const elapsed = Date.now() - startTime
      const target = schedule[attempt - 1]
      if (elapsed >= target) continue
      await new Promise(r => setTimeout(r, target - elapsed))
    }
    let response
    try {
      response = await fn()
    } catch (error) {
      lastError = error
      if (error.name === 'AbortError') throw error
      continue
    }
    if (response.ok) return response
    lastError = new Error(`Failed to fetch: ${response.statusText}\n${await response?.text()}`)
    if (response.status >= 400 && response.status < 500) throw lastError
  }
  throw lastError
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
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = ''; // 用于存储未完整的 chunk
      let done = false;

      // 返回一个异步迭代器用于处理流式的响应
      return {
        [Symbol.asyncIterator]: async function* () {
          while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            buffer += decoder.decode(value, { stream: !readerDone });
            let events = buffer.split(/\r?\n\r?\n/);

            buffer = events.pop(); // 保留最后一个部分，如果它不是完整的数据会保留到下次解析
            for (let event of events) {
              if (event.startsWith("data: ")) {
                const jsonData = event.slice(6); // 去掉 "data: "
                if (jsonData.trim() !== "[DONE]") {
                  try {
                    const parsedData = JSON.parse(jsonData);
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
              }
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
