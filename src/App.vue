<script setup>
import MessageMarkdown from './components/MessageMarkdown.vue'
import { escapeHTML } from '@/utils/commonUtils'
import { ref, computed, watch } from 'vue'
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
  return patchs
});



// const assistentResponseByte = computed(() => {
//   const bytes = [].concat(...d.map(token => token?.logprobs?.content[0].bytes)).filter(isFinite)
//   return new TextDecoder('utf-8').decode(new Uint8Array(bytes))
// })

const probToColor = (prob, transparency) => {
  const green = Math.floor((prob) * (255 - 128))
  var rgb = `${255 - green}, ${128 + green}, 128`;
  // return {"box-shadow": "inset 0 -2px "+color}
  if (0 < prob && prob < 0.0001) {
    rgb = "255, 0, 0"
  }
  if (transparency === undefined) {
    var color = `rgb(${rgb})`
  } else {
    var color = `rgba(${rgb}, ${transparency})`
  }
  return color
}
function toLegalVariableName(str) {
  const cleanedStr = str.replace(/[^a-zA-Z0-9_$]/g, '');
  return /^\d/.test(cleanedStr) ? '_' + cleanedStr : cleanedStr;
}

const p = (varName, obj) => {
  if (obj === undefined) {
    obj = varName
    varName = 'd'
  }
  var legalVarName = toLegalVariableName(varName)
  window[legalVarName] = obj
  console.log(`"${varName + (legalVarName === varName ? '' : '(' + legalVarName + ')')}":`, obj)
  return obj
}
window.p = p

const addProbToToken = (token) => {
  const logprob = token?.logprobs?.content[0].logprob || 0
  token.prob = Math.exp(logprob)
}


const requestBody = ref({
  model: 'meta-llama/Meta-Llama-3-8B-Instruct',
  messages: messages,
  stream: true,
  logprobs: true,
  top_logprobs: 20,
  top_p: 0.99999,
  // top_k: 2,
  // max_tokens: 54,
  temperature: 0,
})

async function requestLlmServer(messages) {
  messages = messages.value === undefined ? messages : messages.value
  const continue_final_message = messages[messages.length - 1].role == "assistant"
  var body = requestBody.value
  body.messages = messages
  if (continue_final_message) {
    body.add_generation_prompt = false
    body['chat_template_kwargs'] = { continue_final_message: continue_final_message }
  }
  p("body", body)
  const stream = await openai.chat.completions.create(body);
  var streamIndex = 0
  var tokensValuePtr = tokens.value
  for await (const chunk of stream) {
    if (continue_final_message && !streamIndex) { // before affect to tokens
      tokens.value = tokens.value.filter(token => !token.pruned)
      tokensValuePtr = tokens.value
      streamIndex = tokens.value.length
      continue  // first chunk is role, no more role for continue_final_message
    }
    var token = chunk.choices[0];
    token.streamIndex = streamIndex
    if (chunk.choices) {
      addProbToToken(token)
      streamIndex++
      if (tokens.value.length) {
        const lastToken = tokens.value[tokens.value.length - 1]
        if (lastToken.pruned) {
          token.pruned = lastToken.pruned
        }
      }
      // tokens.value.push(token);
      tokensValuePtr.push(token)
      p(token.delta?.content)
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

  acitvatePatch.value = patch
  event.target.classList.add('ActivatePatchSpan')

  setFloatPatchPannelBelow(event.target)

}
const handleMouseLeavePatchSpan = (event) => {
  // console.log(event)
  event.target.classList.remove('ActivatePatchSpan')
  floatPatchPannel.value.waitingToHide = true
  setTimeout(() => {
    if (floatPatchPannel.value.waitingToHide) {
      floatPatchPannel.value.visible = false;
      floatPatchPannel.value.waitingToHide = false;
    }
  }, 300);
}


var messages = [{ role: "user", content: "just repeat `=🧎🏿‍♂️‍➡️磊<hr>\n蘒    𝒀𝒆𝒔`, no other words" }]
// var messages = [{ role: "user", content:"just repeat `Yes,🧎🏿‍♂️‍➡️𝒀𝒆𝒔`, no other words" }]
// var messages = [{ role: "user", content: "just output a random float64 without any words" }]
var messages = [{ role: "user", content: "用中文讲一个关于西游记的100字短笑话，不要有英文" }]
// var messages = [{ role: "user", content: "奥数题:已知小王 2024年30岁，本来预计60岁退休。但现在中央每五年开一次会，每开一次会决定退休年龄延迟3年，求老王的真正退休年龄。" }]
// var messages = [
//     {
//         "role": "user",
//         "content": "用中文讲一个关于西游记的30字短笑话，不要有英文"
//     },
//     {
//         "role": "assistant",
//         "content": "孙悟空说：“我要去取经”，唐三藏问：“你带什么？”孙悟空说：“带瓶"
//     }
// ]

const messagesComputed = computed(() => {
  const final_message = tokens.value.filter(
    token => !token.pruned
  ).map(
    token => (token.delta || {})
  ).reduce((delta1, delta2) => {
    const delta = { ...delta1 }
    for (var key in delta2) {
      delta[key] = (delta[key] || "") + delta2[key]
    }
    return delta
  })
  return messages.concat([final_message])
})
p("tokens", tokens.value)
requestLlmServer(messages);


// floatPatchPannel
const acitvatePatch = ref({})
const acitvateLogprobItem = ref({})
const tokenToHtml = (tokenContent) => {
  if (tokenContent === undefined) {
    return "undefined"
  }
  if (tokenContent === "") {
    return "<|unsee|>"
  }
  return JSON.stringify(tokenContent)
}


const floatPatchPannel = ref({
  visible: false,
  waitingToHide: false,
  x: 0,
  y: 0,
})

watch(acitvatePatch, (newValue) => {
  acitvateLogprobItem.value = {}
});

function setFloatPatchPannelBelow(element) {
  const cellRect = element.getBoundingClientRect();
  // const containerRect = $el.querySelector('.table-container').getBoundingClientRect();
  floatPatchPannel.value.x = cellRect.left - 10
  floatPatchPannel.value.y = cellRect.bottom - 5
  floatPatchPannel.value.waitingToHide = false;
  floatPatchPannel.value.visible = true;
  // console.log(element, cellRect, floatPatchPannel)
}

function continueFromToken(token, continuePrefix) {
  continuePrefix = continuePrefix || ""
  const continuePrefixToken = { delta: { content: continuePrefix }, streamIndex: token.streamIndex, bifurcationPoint: true, logprobs: token.logprobs }
  tokens.value.splice(token.streamIndex, 0, continuePrefixToken);
  const messageWithContinuePrefix = messagesComputed.value

  // messageWithContinuePrefix[messageWithContinuePrefix.length-1]['content'] += continuePrefix
  requestLlmServer(messageWithContinuePrefix)
}

function clickOnLogprobItem(token, logprobItem) {
  for (const patch of patchs.value) {
    for (const patchToken of patch.tokens) {
      patchToken.pruned = patchToken.streamIndex >= token.streamIndex
      if (patchToken.streamIndex == token.streamIndex) {
        patchToken.bifurcationPoint = true
      }
    }
  }
  continueFromToken(token, logprobItem.token)
}

</script>
<template>
  <h2>onPanda: on-Policy Alignment Data Annotator (PoC)</h2>
  <code>Scaling up your data efficiency before scaling up your data.</code>


  <!-- <MessageMarkdown content="**Hello** _world_ $E=mc^2$!" /> -->
  <MessageMarkdown v-for="message in messages" :content="`### ${message['role']}:\n${message['content']}`" />
  <h3> {{ tokens.length ? tokens[0].delta.role : "unknown_role" }}:</h3>
  <p> by <code>{{ requestBody.model || "unknown_model" }} </code> </p>
  <div style="background-color: #eee;white-space: pre-wrap;cursor: default;">
    <span class="PatchSpan" v-for="patch in patchs" :style='{
      "border-bottom": "3px solid " + probToColor(patch.prob),
      ...(patch.tokens.some(t => t.pruned) ? { "color": "#999" } : {}),
      ...(patch.tokens.some(t => t.bifurcationPoint) ? { "background-color": "#e99" } : {})
    }' :patch-index="patch.index" v-html="patchToSpanHTML(patch)" @mouseenter="handleMouseEnterPatchSpan"
      @mouseleave="handleMouseLeavePatchSpan"></span>

  </div>
  <hr>
  <div class="floatPatchPannel" @mouseover="floatPatchPannel.waitingToHide = false" :style="{
    position: 'absolute',
    left: `${floatPatchPannel.x}px`,
    top: `${floatPatchPannel.y}px`,
  }" v-if="floatPatchPannel.visible">
    <div v-for="token in acitvatePatch.tokens.filter(token => (token?.delta?.content !== undefined))"
      class="tokenPannel" style="vertical-align:top; display: inline-block; padding: 5px;">
      <div class="floatPatchPannelHead" style="border-bottom: 2px solid #ccc;">
        <span class="tokenSpan" v-html="escapeHTML(tokenToHtml(token?.delta?.content))" />
      </div>
      <div class="tokenLogprobItems">
        <div v-for="logprobItem in token?.logprobs?.content[0].top_logprobs"
          style="display: block; background-color: #eee;" @click="clickOnLogprobItem(token, logprobItem)"
          @mouseenter="acitvateLogprobItem = logprobItem">
          <span class="tokenSpan" style="color: #444;">{{ tokenToHtml(logprobItem.token) }}</span>
          <span :style='{ "background-color": probToColor(Math.exp(logprobItem.logprob), 0.18), "float": "right" }'
            style="white-space: pre-wrap;font-family: Monospace;">:{{
              (Math.exp(logprobItem.logprob) * 100).toFixed(1).toString().padStart(5, ' ') }}%</span>
        </div>
      </div>
    </div>
    <footer>
      <hr>
      <span v-if="acitvateLogprobItem.logprob" style="white-space: pre-wrap;font-family: Monospace;">{{
        Math.exp(acitvateLogprobItem.logprob) * 100 }}%<br></span>
      <span v-if="acitvateLogprobItem.bytes" style="font-family: Monospace;"> bytes:
        [{{ acitvateLogprobItem.bytes.join(',') }}]</span>
      <button @click="floatPatchPannel.visible = false"
        style="padding: 0px; margin: 0 5px 5px 5px; float:right">❌</button>
    </footer>
  </div>


  <!-- <span class="PatchSpan" v-for="patch in patchs">{{ patch.patch }}</span> -->


  <!-- assistentResponseContent🧎🏿‍♂️‍➡️:
  <div style="background-color: #eee;white-space: pre-wrap;user-select: none;">
    {{ assistentResponseContent }}
  </div> -->
</template>

<style scoped>
.floatPatchPannelHead .tokenLogprobItems {
  display: block;
}

.tokenPannel {
  border: 1px solid #ccc;
  padding: 0px;
}

.floatPatchPannel {
  margin: 5px;
  border: 1px solid #ccc;
  border-radius: 5px;
  background-color: #f9f9f9;
  position: absolute;
}

.PatchSpan {
  box-shadow: inset -1px 0 rgb(200, 200, 200);
  /* 使用 inset 将阴影设为内阴影 */
}

.tokenSpan {
  white-space: pre-wrap;
  font-family: Monospace;
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
