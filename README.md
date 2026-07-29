# onPanda: on-Policy Alignment Data Annotator

> Scaling up your data efficiency before scaling up your data.

**onPanda** (**on**-**P**olicy **a**lig**n**ment **d**ata **a**nnotator) is a data annotation tool for LLM alignment data, including SFT and RL. By combining frontend engineering with GPT models, it helps annotators efficiently produce SFT responses with model assistance while creating on-policy, token-level preference data.

<div align="center">

<a href="https://on-panda.github.io/img/fig1_UI-v4.png">
  <img src="https://on-panda.github.io/img/fig1_UI-v4.png" alt="onPanda token-level correction interface" style="max-width:350px" loading="lazy">
</a>

The token-level correction interface of onPanda

</div>

<br>
<br>
<div align="center">

Build with human efforts <br>
For humans to steer LLM

</div>

## Features

- Visualize probabilities and candidate tokens for model responses.
- Continue from a candidate, or double-click a token to edit it and continue generation.
- Support text, images, audio, and tool calls.
- Import and export `.panda.json` annotation data.
- Connect to OpenAI-compatible model APIs. API configurations and keys stay in browser local storage.

## Quick Start

Requires Node.js 20+ and pnpm.

```bash
pnpm install && pnpm dev
```

Open the address shown in the terminal. By default, it is `http://localhost:5173`.

## Configure a Model API

Paste a JSON5 configuration in **Custom API Config**, for example:

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

- If `chat_config.model` is omitted, onPanda fetches the model list from the endpoint's `/models` API.
- `top_logprobs` controls the number of candidate tokens. Set it to `0` to disable probabilities and candidates.
- Set `support_continue_final_message` to `false` for APIs that do not support native continuation of assistant messages.
- Requests are sent directly from the browser to the model API, so the server must allow CORS. Do not commit API keys to the repository.

## Build and Customize

```bash
pnpm build:web   # Build the web application
pnpm build       # Build the component library
pnpm build:core  # Build the core component library
```

Set a custom module to load during the build in `.env.local` at the repository root:

```dotenv
WEB_IMPORT_CUSTOM_CODE=src/assets/secret/custom.js
```

The web app, core component library, and root component library use `WEB_IMPORT_CUSTOM_CODE`, `CORE_IMPORT_CUSTOM_CODE`, and `MAIN_IMPORT_CUSTOM_CODE`, respectively. Without configuration, they use `src/utils/defaultCustom.js`.

## License

[MIT](LICENSE)
