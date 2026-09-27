# 🐼 onPanda: Steer Your LLMs and Agents at the Token Level

用于 token 可视化与控制、模型检查、数据标注等工作的 Web 应用。

<div align="center">

<a href="https://on-panda.github.io/img/onPanda-token-level-correction.gif">
  <img src="https://on-panda.github.io/img/onPanda-token-level-correction.gif" alt="onPanda 的 token 级纠错界面" style="width:500px; max-width:100%; height:auto">
</a>

<!-- onPanda 的 token 级纠错界面 -->

</div>

- 👉 [**在线体验**](https://onpanda.diyer22.com/)（支持移动端）
- 👉 [详细介绍](https://x.com/diyerxx/status/2101020850405462041)


## ▮ 特色

onPanda 面向极客、重度用户、好奇的探索者和工程师，界面为深入探索和高效数据标注而设计。

- 核心循环很简单：悬停在一个 token 上 → 点击候选项或自由编辑 → 继续生成。可以编辑模型输出的各个部分，包括 reasoning 和 tool calls。
- 可以直接编辑 prompt、分叉 tool calls，并使用树形结构记录分叉历史，让 onPanda 适合模型检查和 prompt 工程。
- 支持多种模态，包括图片、视频和音频；支持工具调用，并可接入 MCP，在真实环境中执行任务。
- 支持接入主流 harness 执行任务，例如 Claude Code、Codex 和 OpenCode。用户可以方便地探索和比较各个 harness 的 tool set、system prompt、skill 和 memory 机制。
- onPanda 内置 browser-agent，这是一个运行在用户浏览器中的免安装 agent。它把浏览器作为 harness，提供 JavaScript 代码运行、信息搜集、界面交互、多媒体 I/O、本地文件访问和持久化记忆等能力。
- onPanda 的全称是 on-Policy Alignment Data Annotator。详情见下方折叠详情。

<details><summary><strong>关于数据标注</strong>（点击展开）</summary>

- 相比人工后处理，标注时间中位数缩短 **52%**。
- 一次标注，同时产出 **SFT 与 preference** 数据。
- 生成 **on-policy** 的 SFT 数据：ΔPPL 相比模型重采样基线的相对变化 <1%。
- 附带 **token-level correction** 数据，为后续训练提供了位置精确、正负样本天然配对的细粒度监督信号——有潜力成为 LLM 对齐新范式。
- 支持标注 **Agent 轨迹**，并支持图像、音频和视频输入。
- 欢迎阅读 onPanda 在数据标注方向的论文：
  - [onPanda: Efficient Annotation of On-Policy Alignment Data for LLMs and Agents via Token-Level Correction](https://on-panda.github.io/research/)
    
</details>

## ▮ 自托管

需要 Node.js 和 npm。

```bash
npx -y @on-panda/serve --port 8080 --web_config web_config.json5
```

可选的 `--web_config` 用来为 onPanda 界面预设 LLM API 配置。

`web_config.json5` 示例：

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
        model: 'your-model-name', // 不填写，则 onPanda 会请求接口的 `/models` 获取模型列表。
        top_logprobs: 20,
      },
    },
  ]
}
```

除了通过 `--web_config` 配置 LLM API，也可以在 onPanda 界面中点击“自定义 API 配置”添加。自定义配置保存在浏览器的 localStorage 中。


## ▮ 资源

- 批量标注 LLM 数据请参阅 [项目主页](https://on-panda.github.io/research/) 和 [packages/annotate](packages/annotate/README.md)。
- onPanda 的核心组件可以被其他项目导入和复用，见 [apps/integration-example](apps/integration-example/README.md)。
- [on-panda-python](https://github.com/on-panda/on-panda-python)：将 onPanda 数据解析为 SFT 数据和 token-level 偏好数据。
- [on-panda-docs](https://github.com/on-panda/on-panda-docs)：onPanda 开发文档。

## ▮ 许可

[MIT](LICENSE)

<!--
<br>
<br>
<div align="center">

Build with human efforts ❤️ <br>
For humans to steer LLM 😎🕹️🤖

</div> -->
