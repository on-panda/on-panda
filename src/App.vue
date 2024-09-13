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

const patchs = computed(() => {
  const visableSegments = Array.from(segmenter.segment(assistentResponseContent.value));
  visableSegments.push({ segment: "" }) // add a empty segment at the end for EOT token
  visableSegments.push({ segment: "" })
  var patchs = []
  var tokenToSegmentString = "";
  var segmentIndex = 0;
  var tokenStartIndex = 0;
  for (const token of tokens.value) {
    const tokenContent = (token.delta?.content || "");
    var tokenIndex = token.streamIndex
    tokenToSegmentString += tokenContent;
    var patchString = visableSegments[segmentIndex].segment
    if (tokenToSegmentString.length >= patchString.length) {
      while (tokenToSegmentString.length > patchString.length) {
        segmentIndex++
        patchString += visableSegments[segmentIndex].segment
      }
      if (tokenToSegmentString != patchString) {
        // TODO: support segment split inside one token
        // assert 
        throw new Error("tokenToSegmentString != segment: " + tokenToSegmentString + " != " + patchString)
      }
      var patchTokens = tokens.value.slice(tokenStartIndex, tokenIndex + 1)
      patchs.push({ patch: patchString, tokens: patchTokens, prob: patchTokens.reduce((acc, token) => acc * token.prob, 1), index: patchs.length })
      tokenStartIndex = tokenIndex + 1
      tokenToSegmentString = ""
      segmentIndex++
    }
  }
  p(patchs)

  return patchs
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
    // max_tokens: 54,
    // temperature: 4,
  }, { skip_special_tokens: false, prompt_logprobs: 5 });
  var streamIndex = 0
  for await (const chunk of stream) {
    var delta = (chunk.choices[0]?.delta?.content || "");
    var token = chunk.choices[0];
    token.streamIndex = streamIndex
    if (chunk.choices) {
      addProbToToken(token)
      streamIndex++
      tokens.value.push(token);
    }
  }
}

function createSpanInPatchSpanHTML(textContent) {
  const span = document.createElement('span')
  span.className = 'spanInPatchSpan'  // .spanInPatchSpan CSS not work?
  span.textContent = textContent
  span.style['color'] = "rgb(180,180,180)"
  span.style['size'] = "small"
  span.style['user-select'] = "none"
  span.style['margin-left'] = "10px"
  return span.outerHTML
}


function replaceNewlinesWithSpans(str) {
  const regex = /\n/g;
  return str.replace(regex, (match) => {
    return createSpanInPatchSpanHTML('↵') + '<br>'
  });
}

function appendFinishReason(token) {
  if (token.finish_reason) {
    return createSpanInPatchSpanHTML(`<|${token.finish_reason}|>`)
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

const patchToSpanHTML = (patch) => {
  return patch.tokens.map(token => tokenToSpanHTML(token)).join("")
}

const handleMouseEnterPatchSpan = (event) => {
  const patchIndex = event.target.attributes["patch-index"].value
  const patch = patchs.value[parseInt(patchIndex)]

  patchTokens.value = patch.tokens
  event.target.classList.add('ActivatePatchSpan')
  console.log(patchIndex, event.target.textContent, patch.tokens.length, patch.prob)
}
const handleMouseLeavePatchSpan = (event) => {
  // console.log(event)
  event.target.classList.remove('ActivatePatchSpan')
}


var messages = [{ role: "user", content: "just repeat `=🧎🏿‍♂️‍➡️磊<hr>\n蘒    𝒀𝒆𝒔`, no other words" }]
// var messages = [{ role: "user", content:"just repeat `Yes,🧎🏿‍♂️‍➡️𝒀𝒆𝒔`, no other words" }]
// var messages = [{ role: "user", content: "just output a random float64 without any words" }]
// var messages = [{ role: "user", content: "用中文讲一个关于西游记的短笑话，不要有英文" }]

main();


// FloatPatchPannel
const patchTokens = ref([])

</script>
<template>
  <h2>onPanda: on-Policy Alignment Data Annotator (PoC)</h2>
  <code>Scaling up your data efficiency before scaling up your data.</code>


  <!-- <MessageMarkdown content="**Hello** _world_ $E=mc^2$!" /> -->
  <MessageMarkdown v-for="message in messages" :content="`### ${message['role']}:\n${message['content']}`" />
  <h3> {{ tokens ? tokens[0].delta.role:"unknown_role"}}:</h3>
  <div style="background-color: #eee;white-space: pre-wrap;cursor: default;">
    <span class="PatchSpan" v-for="patch in patchs" :style="probToColor(patch.prob)" :patch-index="patch.index"
      v-html="patchToSpanHTML(patch)" @mouseenter="handleMouseEnterPatchSpan"
      @mouseleave="handleMouseLeavePatchSpan"></span>

  </div>
  <hr>
  <div class="FloatPatchPannel">
    <div v-for="token in patchTokens" style="display: inline-block;">{{ token?.delta?.content }}</div>
  </div>


  <!-- <span class="PatchSpan" v-for="patch in patchs">{{ patch.patch }}</span> -->


  <!-- assistentResponseContent🧎🏿‍♂️‍➡️:
  <div style="background-color: #eee;white-space: pre-wrap;user-select: none;">
    {{ assistentResponseContent }}
  </div> -->
</template>

<style scoped>
.PatchSpan {
  box-shadow: inset -1px 0 rgb(200, 200, 200);
  /* 使用 inset 将阴影设为内阴影 */
}

.PatchSpan {
  white-space: pre-wrap;
  margin: 0;
  padding: 0;
  display: inline;
}

.ActivatePatchSpan {
  background-color: #ccc;
  border-radius: 4px;
}

* {
  font-family: Arial, sans-serif;
}
</style>
