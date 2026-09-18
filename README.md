# 🐼 onPanda: Steer Your LLMs and Agents at the Token Level

A web app for token visualization and control, model inspection, data annotation, and more.

<div align="center">

<a href="https://on-panda.github.io/img/fig1_UI-v4.png">
  <img src="https://on-panda.github.io/img/fig1_UI-v4.png" alt="onPanda token-level correction interface" style="width:350px; max-width:100%; height:auto" loading="lazy">
</a>

The token-level correction interface of onPanda

</div>

<!-- **onPanda** (**on**-**P**olicy **a**lig**n**ment **d**ata **a**nnotator) is a data annotation tool for LLM alignment data, including SFT and RL. By combining frontend engineering with GPT models, it helps annotators efficiently produce SFT responses with model assistance while creating on-policy, token-level preference data. -->

## Features

onPanda is designed for geeks, power users, curious minds, and engineers. Its UI is built for deep exploration and efficient data annotation.

- The core loop is simple: hover over a token → click an alternative or edit freely → continue generation. You can edit every part of model output exposed by onPanda, including reasoning and tool calls.
- Edit prompts directly, branch tool calls, and use a tree structure to record branch history. This makes onPanda useful for model inspection and prompt engineering.
- Support multiple modalities, including images, video, and audio; use tool calls and connect MCP servers to perform tasks in real environments.
- Connect popular harnesses such as Claude Code, Codex, and OpenCode to execute tasks. Explore and compare their tool sets, system prompts, skills, and memory mechanisms.
- onPanda includes browser-agent, an agent that runs in the user's browser without installation. It uses the browser as its harness and provides JavaScript execution, information retrieval, interface interaction, multimedia I/O, local file access, and persistent memory.
- onPanda stands for on-Policy Alignment Data Annotator. Read the paper on onPanda's data annotation approach:
  - [onPanda: Efficient Annotation of On-Policy Alignment Data for LLMs and Agents via Token-Level Correction](https://on-panda.github.io/research/)

**Try it online** (works on mobile): [https://onpanda.diyer22.com/](https://onpanda.diyer22.com/)


## Self-hosting

Requires Node.js and npm.

```bash
npx -y @on-panda/serve --port 8080 --web_config web_config.json5
```

The optional `--web_config` flag provides preset LLM API configurations to the onPanda UI.

Example `web_config.json5`:

```js
{
  apiConfigs: [
    {
      endpoint_name: 'my-api',
      tag_name: 'my-model',
      client_config: {
        base_url: 'https://vllm-test-api.diyer22.com/v1',
        api_key: 'YOUR_API_KEY',
      },
      chat_config: {
        model: 'your-model-name', // If omitted, onPanda fetches the model list from the endpoint's `/models` API.
        top_logprobs: 20,
      },
    },
  ]
}
```

You can also add an API configuration through **Custom API Config** in the onPanda UI. Custom configurations are stored in browser local storage.


## Resources

- For batch LLM data annotation, see the [project page](https://on-panda.github.io/research/) and [packages/annotate](packages/annotate/README.md).
- onPanda's core components can be imported and reused by other projects; see [apps/integration-example](apps/integration-example/README.md).
- [on-panda-python](https://github.com/on-panda/on-panda-python): Parse onPanda data into SFT data and token-level preference data.
- [on-panda-docs](https://github.com/on-panda/on-panda-docs): onPanda developer documentation.

## License

[MIT](LICENSE)

<!--
<br>
<br>
<div align="center">

Build with human efforts ❤️ <br>
For humans to steer LLM 😎🕹️🤖

</div> -->
