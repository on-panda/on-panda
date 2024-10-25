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
  }

  async createChatCompletion(chatConfig) {
    const url = `${this.baseURL}/chat/completions`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(chatConfig)
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch completions: ${response.statusText}`);
    }

    // 如果是流模式，我们要解析 EventStream 响应
    if (chatConfig.stream) {
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
                    yield parsedData; // 返回解析的 JSON 数据
                  } catch (error) {
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
      // 非流式响应，直接返回 JSON 数据
      const json = await response.json();
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
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }

    const json = await response.json();
    return json.data;
  }
}