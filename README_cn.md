# onPanda：on-Policy Alignment Data Annotator

> Scaling up your data efficiency before scaling up your data.

**onPanda**（**on**-**P**olicy **a**lig**n**ment **d**ata **a**nnotator）是一套面向 LLM 对齐数据（SFT 与 RL）的标注工具。它结合前端工程与 GPT 模型的特点，让标注者在模型辅助下高效生成 SFT 回复，同时产出在线策略的 token 级偏好数据。



<div align="center">


<a href="https://on-panda.github.io/img/fig1_UI-v4.png">
  <img src="https://on-panda.github.io/img/fig1_UI-v4.png" style="max-width:350px" loading="lazy">
</a>

The token-level correction interface of onPanda

</div>

<br>
<br>
<div align="center">

Build with human efforts ❤️ <br>
For humans to steer LLM 😎🕹️🤖

</div>

## 功能

- 可视化回复 token 的概率和候选 token。
- 点击候选继续生成，或双击 token 后编辑并续写。
- 支持文本、图片、音频和工具调用。
- 导入、导出 `.panda.json` 标注数据。
- 接入 OpenAI 兼容的模型 API；配置和密钥仅保存在浏览器本地。

## 快速启动

需要 Node.js 20+ 和 pnpm。

```bash
pnpm install && pnpm dev
```

打开终端显示的地址，默认是 `http://localhost:5173`。

## 配置模型 API

在页面的“自定义 API 配置”中粘贴 JSON5 配置，例如：

```js
[
  {
    endpoint_name: 'my-api',
    tag_name: 'my-model',
    client_config: {
      base_url: 'https://example.com/v1',
      api_key: 'YOUR_API_KEY',
    },
    chat_config: {
      model: 'your-model-name',
      top_logprobs: 20,
    },
    support_continue_final_message: true,
  },
]
```

- 不填写 `chat_config.model` 时，onPanda 会请求接口的 `/models` 获取模型列表。
- `top_logprobs` 决定候选 token 数量；设为 `0` 会关闭概率和候选功能。
- 不支持原生续写 assistant 消息的接口，将 `support_continue_final_message` 设为 `false`。
- 请求由浏览器直接发送到模型 API，服务端需要允许 CORS。请勿将密钥提交到仓库。


## 构建与定制

```bash
pnpm build:web   # 构建网页应用
pnpm build       # 构建组件库
pnpm build:core  # 构建核心组件库
```

可在仓库根目录的 `.env.local` 指定构建时加载的自定义模块：

```dotenv
WEB_IMPORT_CUSTOM_CODE=src/assets/secret/custom.js
```

网页应用、核心组件库和根组件库分别使用 `WEB_IMPORT_CUSTOM_CODE`、`CORE_IMPORT_CUSTOM_CODE`、`MAIN_IMPORT_CUSTOM_CODE`。未配置时会使用 `src/utils/defaultCustom.js`。

## 许可

[MIT](LICENSE)
