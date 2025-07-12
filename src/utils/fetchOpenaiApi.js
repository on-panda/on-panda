import { useGlobalStore } from '../stores/globalStore'
import { ElMessage } from 'element-plus'


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

    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
      ...options
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch completions: ${response.statusText}\n${await response?.text()}`);
    }

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
        // workround for unknow which token is chosen in prompt_logprobs (vLLM BUG)
        // list of {token_id: obj} => same as top_logprobs
        var prompt_logprobs_raw = raw.split("prompt_logprobs")[1]

        const regex = /}},\{"(\d+)":/g;
        const allMatches = prompt_logprobs_raw.match(regex);
        const chosens = allMatches.map(match => match.match(/(\d+)/)[1])


        json.prompt_logprobs_list = chosens.map((chosenTokenId, index) => {
          var reverseIndex = index - chosens.length;
          var promptLogprob = json.prompt_logprobs[json.prompt_logprobs.length + reverseIndex];
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

          var top_logprobs = sortedTokenIds.map(tokenId => {
            let logprob = promptLogprob[tokenId]
            logprob.token = logprob.decoded_token
            logprob.token_id = tokenId
            return logprob
          });
          var logprobChosen = JSON.parse(JSON.stringify(top_logprobs[0]))
          logprobChosen.top_logprobs = top_logprobs
          var logprobs = {
            content: [logprobChosen]
          }
          return logprobs
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