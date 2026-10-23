<a href="https://x.com/diyerxx/status/2101020850405462041"><img src="https://img.shields.io/static/v1?label=Intro&message=with%20video&color=blue"></a>
<a href="https://onpanda.diyer22.com/"><img src="https://img.shields.io/static/v1?label=Online&message=Demo&color=orange"></a>
<a href="https://arxiv.org/abs/2609.24983"><img src="https://img.shields.io/badge/arXiv-2609.24983-b31b1b.svg"></a>
<a href="https://huggingface.co/datasets/diyer22/Panda-CVL-test"><img src="https://img.shields.io/static/v1?label=HuggingFace&message=data&color=yellow"></a>
<a href="https://on-panda.github.io/agent-trajectory-annotation/"><img src="https://img.shields.io/badge/Blog-Agent%20Annotation-blue.svg"></a>
<a href="README_cn.md"><img src="https://img.shields.io/badge/Language-中文-lightgrey.svg"></a>


<div align="center">

# onPanda: Steer Your LLMs and Agents at the Token Level

**For token visualization and control, model inspection, data annotation, and installation-free harness.**


<a href="https://x.com/diyerxx/status/2101020850405462041">
  <img src="https://on-panda.github.io/img/onPanda-token-level-correction.gif" alt="onPanda token-level correction interface" style="width:500px; max-width:100%; height:auto">
</a>

<!-- onPanda's token-level correction interface -->

</div>

- 👉 [**Try it online**](https://onpanda.diyer22.com/) (mobile-friendly)
- 👉 [**Introduction**](https://x.com/diyerxx/status/2101020850405462041) (with short video)


## ▮ Features

onPanda is designed for geeks, power users, curious minds, and engineers. Its UI is built for deep exploration and efficient data annotation.

- The core loop is simple: hover over a token → click an alternative or edit freely → continue generation. You can edit every part of model output exposed by onPanda, including reasoning and tool calls.
- Edit prompts directly, branch tool calls, and use a tree structure to record branch history. This makes onPanda useful for model inspection and prompt engineering.
- Support multiple modalities, including images, video, and audio; use tool calls and connect MCP servers to perform tasks in real environments.
- Connect popular harnesses such as Claude Code, Codex, and OpenCode to execute tasks. Explore and compare their tool sets, system prompts, skills, and memory mechanisms.
- onPanda includes browser-agent, an agent that runs in the user's browser without installation. It uses the browser as its harness and provides JavaScript execution, information retrieval, interface interaction, multimedia I/O, local file access, and persistent memory.
- onPanda stands for on-Policy Alignment Data Annotator. See details below.

<details><summary><strong>For data annotation</strong> (Click to expand)</summary>

- Reduce median annotation time by **52%** vs. manual post-editing.
- Collect **both SFT and preference** data in the same workflow.
- Produce SFT data with high **on-policy** fidelity: ΔPPL <1% relative to the model’s resampling baseline.
- Capture **token-level supervision** with precise correction locations and naturally paired positive and negative examples—a promising direction for future LLM alignment.
- Annotate **agent trajectories**, with support for image, audio, and video inputs.
- Read the paper on onPanda's data annotation approach:
  - [onPanda: Efficient Annotation of On-Policy Alignment Data for LLMs and Agents via Token-Level Correction](https://arxiv.org/abs/2609.24983)
- Read the blog post on onPanda as an agent SFT trajectory annotation tool:
  - [**Efficient Agent Trajectory Annotation with onPanda**](https://on-panda.github.io/agent-trajectory-annotation/): Dynamically connect to agent environments and annotate multi-turn SFT and preference data with tool_calls and reasoning online
    
</details>

## ▮ Self-hosting

onPanda is a web application, and most of its functions can be used directly by opening [https://onpanda.diyer22.com/](https://onpanda.diyer22.com/) without installation or configuration. 

If you want to self-host, you need to install Node.js and npm, then run:

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

You can also add an API configuration through **Custom API Config** in the onPanda UI. Custom configurations are stored in the browser's local storage.

Mainstream inference software, such as vLLM, Ollama, etc., and some LLM inference platform APIs support the features required by onPanda. See our [compatibility document](https://github.com/on-panda/on-panda-docs/blob/main/content/en/API_compatibility.md).

## ▮ Resources

- For batch LLM data annotation or agent trajectory annotation, see the [research page](https://on-panda.github.io/research/) and [packages/annotate](packages/annotate/README.md).
- onPanda's core components can be imported and reused by other projects; see [apps/integration-example](apps/integration-example/README.md).
- [on-panda-python](https://github.com/on-panda/on-panda-python): Parse onPanda data into SFT data and token-level preference data.
- [on-panda-docs](https://github.com/on-panda/on-panda-docs): onPanda developer documentation.

## ▮ License

[MIT](LICENSE)

<!--
<br>
<br>
<div align="center">

Build with human efforts ❤️ <br>
For humans to steer LLM 😎🕹️🤖

</div> -->
