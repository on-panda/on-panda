<script setup>
import MessageMarkdown from './components/MessageMarkdown.vue'
import { escapeHTML } from '@/utils/commonUtils'
import { ref, computed } from 'vue'
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "http://39.105.21.95:12481/v1",
  apiKey: "sk-Nokey",
  dangerouslyAllowBrowser: true
});

const tokens = ref([]);



const assistentResponseContent = computed(() => {
  return tokens.value.map((token) => token.delta.content).join("");
});


const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

const segments = computed(() => {
  const visableSegments = Array.from(segmenter.segment(assistentResponseContent.value));
  var tokenToSegmentString = "";
  var segmentIndex = 0;
  var tokenStartIndex = 0;
  for (const token of tokens.value) {
    const tokenContent = (token.delta?.content || "");
    var tokenIndex = token.streamIndex
    tokenToSegmentString += tokenContent;
    var segment = visableSegments[segmentIndex].segment
    if (tokenToSegmentString.length >= segment.length) {
      if(tokenToSegmentString != segment){ // assert 
        throw new Error("tokenToSegmentString != segment: " + tokenToSegmentString + " != " + segment)
      }
      visableSegments[segmentIndex].tokenEndIndex = tokenIndex + 1
      visableSegments[segmentIndex].tokenStartIndex = tokenStartIndex
      tokenStartIndex = tokenIndex + 1
      tokenToSegmentString = ""
      segmentIndex++
    }
  }
  return visableSegments
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
    messages: messages,
    stream: true,
    logprobs: true,
    top_logprobs: 2,
    top_p: 1,
    // top_k: 2,
    // max_tokens: 4,
  }, { skip_special_tokens: false, prompt_logprobs: 5 });
  var streamIndex = 0
  for await (const chunk of stream) {
    var delta = (chunk.choices[0]?.delta?.content || "");
    var token = chunk.choices[0];
    token.streamIndex = streamIndex
    if (chunk.choices && token.delta.content!==undefined) {
      addProbToToken(token)
      streamIndex++
      tokens.value.push(token);
      p(tokens.value)
    }
  }
}

function replaceNewlinesWithSpans(str) {
  const regex = /\n/g;
  return str.replace(regex, (match) => {
    const span = document.createElement('span')
    span.className = 'SpanInSegmentSpan'  // .SpanInSegmentSpan CSS not work?
    span.textContent = '↵'
    span.style['color'] = "rgb(180,180,180)"
    span.style['size'] = "small"
    span.style['user-select'] = "none"

    return span.outerHTML + '<br>'
  });
}

function appendFinishReason(token) {
  if (token.finish_reason) {
    const span = document.createElement('span')
    span.className = 'SpanInSegmentSpan'  // .SpanInSegmentSpan CSS not work?
    span.textContent = `<|${token.finish_reason}|>`
    span.style['color'] = "rgb(180,180,180)"
    span.style['size'] = "small"
    span.style['user-select'] = "none"

    return span.outerHTML
  }
  return ""
}

const tokenToSpanHTML = (token) => {
  const content = token?.delta?.content
  html = ""
  if (content) {
    var html = escapeHTML(content)
    html = replaceNewlinesWithSpans(html)
  }
  html = html + appendFinishReason(token)
  return html
}

const handleMouseEnterSegmentSpan = (event) => {
  const streamIndex = event.target.attributes["stream-index"].value
  const token = tokens.value[parseInt(streamIndex)]

  console.log(streamIndex, event.target.textContent, token.prob)
}
const handleMouseLeaveSegmentSpan = (event) => {
  // console.log(event)
}


var messages = [{ role: "user", content: "just repeat `=🧎🏿‍♂️‍➡️磊<hr>\n蘒    𝒀𝒆𝒔`, no other words" }]
// var messages = [{ role: "user", content:"just repeat `Yes,🧎🏿‍♂️‍➡️𝒀𝒆𝒔`, no other words" }]
// var messages = [{ role: "user", content: "just output a random float64 without any words" }]
// var messages = [{ role: "user", content: "用中文讲一个关于西游记的短笑话，不要有英文" }]

main();
</script>
<template>
  <h2>onPanda: on-Policy Alignment Data Annotator (PoC)</h2>
  <code>Scaling up your data efficiency before scaling up your data.</code>


  <!-- <MessageMarkdown content="**Hello** _world_ $E=mc^2$!" /> -->
  <MessageMarkdown v-for="message in messages" :content="`### ${message['role']}:\n${message['content']}`" />
  <div style="background-color: #eee;white-space: pre-wrap;">
    <MessageMarkdown content="### assistant:" ></MessageMarkdown>
    <span class="SegmentSpan" v-for="token in tokens" :style="probToColor(token.prob)" :stream-index="token.streamIndex"
      v-html="tokenToSpanHTML(token)" @mouseenter="handleMouseEnterSegmentSpan"
      @mouseleave="handleMouseLeaveSegmentSpan"></span>
  </div>

  <!-- assistentResponseContent🧎🏿‍♂️‍➡️:
  <div style="background-color: #eee;white-space: pre-wrap;user-select: none;">
    {{ assistentResponseContent }}
  </div> -->
</template>

<style scoped>
.SegmentSpan2::after {
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


.SegmentSpan {
  box-shadow: inset -1px 0 rgb(200, 200, 200);
  /* 使用 inset 将阴影设为内阴影 */
}

.SegmentSpan {
  white-space: pre-wrap;
  margin: 0;
  padding: 0;
  display: inline;
  /* 或者使用 display: flex; */
}

* {
  font-family: Arial, sans-serif;
}
</style>
