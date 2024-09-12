<script setup>
import MessageMarkdown from './components/MessageMarkdown.vue'
import { escapeHTML } from '@/utils/commonUtils'
import { ref, computed } from 'vue'
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "http://127.0.0.1:8001/v1",
  apiKey: "sk-Nokey",
  dangerouslyAllowBrowser: true
});

const tokens = ref([]);

const assistentResponseContent = computed(() => {
  p(tokens.value)
  return tokens.value.map((token) => token.delta.content).join("");
});


// const assistentResponseByte = computed(() => {
//   const bytes = [].concat(...d.map(token => token?.logprobs?.content[0].bytes)).filter(isFinite)
//   return new TextDecoder('utf-8').decode(new Uint8Array(bytes))
// })

const probToColor = (prob) => {
  // const color = `rgba(255, 32, 0, ${(1 - prob)})`;
  // return { "background-color": color }
  // const green = Math.floor((prob*0.8+.1) * 255)
  const green = Math.floor((prob) * (255 - 128))
  const color = `rgb(${255 - green}, ${128 + green}, 128)`;
  // return {"box-shadow": "inset 0 -2px "+color}
  return { "border-bottom": "3px solid " + color }
}

const p = (obj) => {
  window.d = obj
  console.log(obj)
  return obj
}

const addProbToToken = (token) => {
  const logprob = token?.logprobs?.content[0].logprob || 0
  token.prob = Math.exp(logprob)
}

async function main() {
  const stream = await openai.chat.completions.create({
    model: 'meta-llama/Meta-Llama-3-8B-Instruct',
    // messages: [{ role: "user", content: "just repeat `=🧎🏿‍♂️‍➡️磊<hr>\n蘒    𝒀𝒆𝒔`, no other words" }],
    // messages: [{ role: "user", content:"just repeat `Yes,🧎🏿‍♂️‍➡️𝒀𝒆𝒔`, no other words" }],
    // messages: [{ role: "user", content: "just output a random float64 without any words" }],
    messages: [{ role: "user", content: "用中文说一个关于西游记的笑话，不要有英文" }],
    stream: true,
    logprobs: true,
    top_logprobs: 2,
    top_p: 1,
    top_k: 2,
    // max_tokens: 4,
  }, { skip_special_tokens: false, prompt_logprobs: 5 });
  var streamIndex = 0
  for await (const chunk of stream) {
    var delta = (chunk.choices[0]?.delta?.content || "");
    var token = chunk.choices[0];
    token.streamIndex = streamIndex
    addProbToToken(token)
    if (chunk.choices) {
      streamIndex++
      tokens.value.push(token);
    }
  }
}

function replaceNewlinesWithSpans(str) {
  const regex = /\n/g;
  return str.replace(regex, (match) => {
    const span = document.createElement('span')
    span.className = 'SpanInPatchSpan'  // .SpanInPatchSpan CSS not work?
    span.textContent = '↵'
    span.style['color'] = "rgb(180,180,180)"
    span.style['size'] = "small"
    span.style['user-select'] = "none"

    return span.outerHTML + '<br>'
  });
}

const tokenToSpanHTML = (token) => {
  const content = token?.delta?.content
  if (content) {
    var html = escapeHTML(content)
    html = replaceNewlinesWithSpans(html)
    return html
  }
}

const handleMouseEnterPatchSpan = (event) => {
  const streamIndex = event.target.attributes["stream-index"].value
  const token = tokens.value[parseInt(streamIndex)]

  console.log(streamIndex, event.target.textContent, token.prob)
}
const handleMouseLeavePatchSpan = (event) => {
  // console.log(event)
}

main();
</script>
<template>
  <h2>onPanda: on-Policy Alignment Data Annotator</h2>
  <blockquote>Scaling up your data efficiency before scaling up your data.</blockquote>


  <MessageMarkdown content="**Hello** _world_ $E=mc^2$!" />
  <div style="background-color: #eee;white-space: pre-wrap;">
    <span class="PatchSpan" v-for="token in tokens" :style="probToColor(token.prob)" :stream-index="token.streamIndex"
      v-html="tokenToSpanHTML(token)" @mouseenter="handleMouseEnterPatchSpan"
      @mouseleave="handleMouseLeavePatchSpan"></span>
  </div>
  assistentResponseContent🧎🏿‍♂️‍➡️:
  <div style="background-color: #eee;white-space: pre-wrap;user-select: none;">
    {{ assistentResponseContent }}
  </div>

</template>

<style scoped>
.PatchSpan2::after {
  content: "|";
  display: inline-flex;
  width: 0px;
  /* 竖线的宽度 */
  height: 100%;
  /* 竖线的高度，这里设置为100%以匹配父元素的高度 */
  background-color: black;
  /* 竖线的颜色 */
  vertical-align: middle;
  /* 可选：使竖线垂直居中 */
  /* margin-left: 10px; 可选：增加左边距以避免文本紧贴竖线 */
}


.PatchSpan {
  box-shadow: inset -1px 0 rgb(200, 200, 200);
  /* 使用 inset 将阴影设为内阴影 */
}

.PatchSpan {
  white-space: pre-wrap;
  margin: 0;
  padding: 0;
  display: inline;
  /* 或者使用 display: flex; */
}
</style>
