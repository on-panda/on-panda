<script setup>
import MessageMarkdown from './components/MessageMarkdown.vue'
import { escapeHTML } from '@/utils/commonUtils'
import { ref, computed, watch } from 'vue'
import { OpenAI } from './utils/fetchOpenaiApi.js'

// const userAgent = navigator.userAgent;
// const mobilePattern = /Mobi|Android/i;
// var isMobile = mobilePattern.test(userAgent);


const innerWidth = ref(window.innerWidth)
function handleResize() {
  innerWidth.value = window.innerWidth
}

var isMobile = computed(() => innerWidth.value < 700)


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

const warningContent = ref("")

function warning(content) {
  if (content instanceof Error) {

    let errorMessage = `
    <h2>Error Details</h2>
                    <strong>Error Name:</strong> ${content.name} <br>
                    <strong>Error Message:</strong> ${content.message} <br>
                    <strong>Error Type:</strong> ${content.constructor.name} <br>
                    ${content.fileName ? `<strong>File Name:</strong> ${content.fileName} <br>` : ''}
                    ${content.lineNumber ? `<strong>Line Number:</strong> ${content.lineNumber} <br>` : ''}
                    <strong>Error Stack:</strong> <pre>${content.stack}</pre>
                `;
    // <strong>Is Custom Error:</strong> ${error instanceof Error} <br>

    content = errorMessage
  }
  warningContent.value += "<p>" + content + "</p>"
}

const defaultApiConfig = {
  "support_continue_final_message": true,
  "clientConfig": {
    baseURL: window.location.origin + "/v1",
    apiKey: "sk-Nokey",
    dangerouslyAllowBrowser: true
  },
  "chatConfig": {
    model: 'meta-llama/Meta-Llama-3-8B-Instruct',
    messages: messages,
    stream: true,
    logprobs: true,
    top_logprobs: 20,
    // top_p: 0.99999,
    // top_p: 0.0001,
    // top_k: 2,
    // max_tokens: 4,
    max_tokens: 1024,
    temperature: 0.5,
  },
}



var messages = [{ role: "user", content: "just repeat `=🧎🏿‍♂️‍➡️磊<hr>\n蘒    𝒀𝒆𝒔`, no other words" }]
// var messages = [{ role: "user", content: "just output a random float128 number without any words, no code" }]
var messages = [{ role: "system", content: "" }, { role: "user", content: "讲一个关于西游记的100字短笑话" }]
// var messages = [{ role: "user", content: "Write a blog to introduce about: onPanda: on-Policy Alignment Data Annotator (PoC)\nScaling up your data efficiency before scaling up your data." }]
// var messages = [{ role: "user", content: "奥数题:已知小王 2024年30岁，本来预计60岁退休。但现在中央每五年开一次会，每开一次会决定退休年龄延迟3年，求老王的真正退休年龄。" }]
// var messages = [{ role: "user", content: "写藏头诗：人工智能，大有可为" }]
// var messages = [{ role: "user", content: "just reply `Y`" }]



// var apiConfig = await fetch('/src/assets/secret/gpt-4o.json')
//   .then(response => { response.json() })
//   .catch(error => { });
// 
// var apiConfig_ = {}
// import apiConfig_ from '@/assets/secret/gpt-4o.js'
// import apiConfig_ from '@/assets/secret/step2.json'
// import apiConfig_ from '@/assets/secret/glm-4-flash.json'
import apiConfig_ from '@/assets/secret/cast.js'
// import apiConfig_ from '@/assets/secret/debug.js'

// update apiConfig with defaultApiConfig
apiConfig_.clientConfig = { ...defaultApiConfig.clientConfig, ...apiConfig_.clientConfig }
apiConfig_.chatConfig = { ...defaultApiConfig.chatConfig, ...apiConfig_.chatConfig }
var apiConfig = { ...defaultApiConfig, ...apiConfig_ }
apiConfig.clientConfig.baseURL = apiConfig.clientConfig.baseURL.replace('${origin}', window.location.origin)
apiConfig = ref(apiConfig)


const openai = new OpenAI(apiConfig.value.clientConfig);
const tokens = ref([]);


async function requestLlmServer(messages) {
  messages = messages.value === undefined ? messages : messages.value
  messages = messages.filter(message => message.content)
  const continue_final_message = messages[messages.length - 1].role == "assistant"
  var body = apiConfig.value.chatConfig
  if (continue_final_message) {
    var lastMessageContent = messages[messages.length - 1].content
    var prefillTokensNumber = tokens.value.filter(token => !token.pruned).length
    if (apiConfig.value.support_continue_final_message) {
      body.add_generation_prompt = false
      body['chat_template_kwargs'] = { continue_final_message: continue_final_message }
    } else {
      const CONTINUE_PROMPT = "continue(do not repeat the last few words of your previous reply)"
      if (lastMessageContent.length < 20000000) {
        messages = messages.concat([
          { role: "user", content: CONTINUE_PROMPT },
        ])
      } else {  // not using
        var middleIndex = Math.floor(lastMessageContent.length / 2)
        messages = messages.slice(0, messages.length - 1).concat([
          { role: "assistant", content: lastMessageContent.slice(0, middleIndex) },
          { role: "user", content: CONTINUE_PROMPT },
          { role: "assistant", content: lastMessageContent.slice(middleIndex) },
          { role: "user", content: CONTINUE_PROMPT },
        ])
      }
    }
  }
  body.messages = messages
  try {
    var stream = await openai.chat.completions.create(body);
  } catch (error) {
    warning(error)
    throw error
  }

  var streamIndex = 0
  var generatedContent = ""
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
      streamIndex++
      if (tokens.value.length) {
        const lastToken = tokens.value[tokens.value.length - 1]
        if (lastToken.pruned) {
          token.pruned = lastToken.pruned
        }
      }
      tokensValuePtr.push(token)
      generatedContent += token?.delta?.content || ""
      if (continue_final_message && !apiConfig.value.support_continue_final_message) {
        // try remove duplicated prefill tokens for API not support continue_final_message
        if (generatedContent === lastMessageContent) {
          warning("API not support continue_final_message, remove duplicated prefill tokens")
          generatedContent = ""
          streamIndex = 0
          if (tokens.value === tokensValuePtr) {
            tokens.value = tokens.value.slice(0, prefillTokensNumber)
            tokensValuePtr = tokens.value
          } else {
            tokensValuePtr = tokens.value.slice(0, prefillTokensNumber)
          }
        }
      }
      // p(token.delta?.content, token)
    }
  }
}


const assistentResponseContent = computed(() => {
  return tokens.value.map((token) => token.delta.content).join("");
});


const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

function probOfToken(token) {
  var prob = Math.exp(token.logprobs?.content[0]?.logprob)
  if (!isFinite(prob)) {
    if (token.streamIndex === 0) {
      // first role token has no prob and will in first patch
      prob = 1
    }
  }
  return prob
}

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
      patchs.push({ patch: patchString, tokens: patchTokens, prob: patchTokens.reduce((acc, token) => acc * probOfToken(token), 1), index: patchs.length })
      tokenStartIndex = tokenIndex + 1
      tokenToSegmentString = ""
      segmentIndex++
    }
  }
  return patchs
});


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

  event.target.classList.add('ActivatePatchSpan')
  patch.target = event.target
  activatePatch.value = patch
  if (isMobile.value) {
    // Prevents false touches due to web size changes
    setTimeout(() => setFloatPatchPannelBelow(event.target), 1)
  } else {
    setFloatPatchPannelBelow(event.target)
  }
}

const handleMouseLeavePatchSpan = (event) => {
  // console.log(event)
  floatPatchPannel.value.waitingToHide = true
  setTimeout(() => {
    if (floatPatchPannel.value.waitingToHide) {
      closeFloatPatchPannel()
    }
  }, 300);
}

function closeFloatPatchPannel() {
  floatPatchPannel.value.visible = false;
  floatPatchPannel.value.waitingToHide = false;
  activatePatch.value = {}
}

const finalMessage = computed(() => {
  return tokens.value.filter(
    token => !token.pruned
  ).map(
    token => (token.delta || {})
  ).reduce((delta1, delta2) => {
    const delta = { ...delta1 }
    for (var key in delta2) {
      delta[key] = (delta[key] || "") + (delta2[key] || "")
    }
    return delta
  }, {})
})

const messagesComputed = computed(() => {
  if (finalMessage.value.content) {
    return messages.concat([finalMessage.value])
  } else {
    return messages
  }
})

requestLlmServer(messages);
p("tokens", tokens.value)
p("patchs", patchs)


// floatPatchPannel
const activatePatch = ref({})
const activateLogprobItem = ref({})
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

watch(activatePatch, (newValue, oldValue) => {
  activateLogprobItem.value = {}
  oldValue.target?.classList.remove('ActivatePatchSpan')
});

function setFloatPatchPannelBelow(element) {
  const cellRect = element.getBoundingClientRect();
  floatPatchPannel.value.x = cellRect.left + window.scrollX - 10
  floatPatchPannel.value.y = cellRect.bottom + window.scrollY - 5
  floatPatchPannel.value.waitingToHide = false;
  floatPatchPannel.value.visible = true;
}

function continueFromToken(token, continuePrefix, continuePrefixLogprob) {
  console.log(token, continuePrefix, continuePrefixLogprob)
  for (const patch of patchs.value) {
    for (const patchToken of patch.tokens) {
      patchToken.pruned = patchToken.streamIndex >= token.streamIndex
      if (patchToken.streamIndex == token.streamIndex) {
        patchToken.bifurcationPoint = true
      }
    }
  }
  continuePrefix = continuePrefix || ""
  // const continuePrefixToken = { delta: { content: continuePrefix }, streamIndex: token.streamIndex, bifurcationPoint: true, logprobs: token.logprobs }
  token = JSON.parse(JSON.stringify(token)) // deep copy
  token.delta.content = continuePrefix
  token.bifurcationPoint = true
  token.pruned = false
  token.logprobs.content[0].logprob = isFinite(continuePrefixLogprob) ? continuePrefixLogprob : -9999
  token.logprobs.content[0].token =
    tokens.value.splice(token.streamIndex, 0, token);
  const messageWithContinuePrefix = messagesComputed.value

  // messageWithContinuePrefix[messageWithContinuePrefix.length-1]['content'] += continuePrefix
  requestLlmServer(messageWithContinuePrefix)
}

function clickOnLogprobItem(token, logprobItem) {
  continueFromToken(token, logprobItem.token, logprobItem.logprob)
  if (isMobile.value) {
    setTimeout(closeFloatPatchPannel, 500)
  }
}


const floatInputPatch = ref({
  visible: false,
  attachedPatch: undefined,
  x: 0,
  y: 0,
})

function setFloatInputPatch(event, patch) {
  // keep floatPatchPannel on， don‘t know why need setTimeout
  setTimeout(() => {
    activatePatch.value = patch
    floatPatchPannel.value.waitingToHide = false;
    floatPatchPannel.value.visible = true;
  }, 20)

  const cellRect = event.target.getBoundingClientRect();
  floatInputPatch.value.attachedPatch = patch

  floatInputPatch.value.x = cellRect.left + window.scrollX - 3
  floatInputPatch.value.y = cellRect.top + window.scrollY - 5
  floatInputPatch.value.visible = true;
  setTimeout(() => {
    document.querySelector('.floatInputPatchInput').value = patch?.patch;
    document.querySelector('.floatInputPatchInput').focus()
  }, 2)

}


import { onMounted, onBeforeUnmount } from 'vue'

onMounted(async () => {
  handleResize();
  window.addEventListener('resize', handleResize);
})

onBeforeUnmount(async () => {
  window.removeEventListener('resize', handleResize);
})

</script>
<template>
  <del>
    <details>
      <summary>
        <small style="color: #888;">as Data Annotator:</small>
      </summary>
      <h2>onPanda: on-Policy Alignment Data Annotator (PoC)</h2>
      <code>Scaling up your data efficiency before scaling up your data.</code>
    </details>
  </del>
  <h2>onPanda coWriter: LLM-native collaborative writing tool </h2>
  <code>Precision byte-level control for LLM writing.</code>

  <details>
    <summary>
      <small style="color: #888;">usage:</small>
    </summary>
    - Move to the bad word, and alternative candidates will appear. <br>
    - Click a candidate to continue generating text based on the chosen word. <br>
    - Double-click a word to modify it, and the LLM will seamlessly continue writing. <br>
  </details>
  <hr>
  <div v-html="warningContent" style="background-color: #fdd;white-space: pre-wrap;cursor: default;"></div>

  <!-- <MessageMarkdown content="**Hello** _world_ $E=mc^2$!" /> -->
  <template v-for="message in messages">
    <p class="role-name"> {{ message['role'] }}:</p>
    <div style="display: flex; justify-content: space-between;">
      <textarea v-model="message['content']"
        style="width: 100%; box-sizing: border-box; padding: 5px; border: 1px solid #ccc;resize: vertical;height: 60px;"
        @keydown.ctrl.enter="tokens = []; requestLlmServer(messages)" />

      <button @click="tokens = []; requestLlmServer(messages)"
        style="margin: 5px; background-color: lightskyblue; color:aliceblue; padding: 8px;"> <b>Send➡️</b><br>
        <small>ctrl+enter</small> </button>
    </div>
    <details>
      <summary>
        <small style="color: #888;">rendered markdown:</small>
      </summary>
      <MessageMarkdown :content="`${message['content']}`" />
    </details>
    <!-- <hr style="margin-top:0px;color:#ccc"> -->
  </template>


  <p class="role-name"> {{ tokens.length ? tokens[0].delta.role : "unknown_role" }}:</p>
  <div style="width: 100%;overflow:scroll">
    <div style="display: flex; justify-content: space-between;" :style="{ 'width': isMobile ? '195%' : '100%' }">
      <div class="final-message-half-pannel">
        <small style="color: #888;"> by <code>{{ apiConfig.chatConfig.model || "unknown_model" }} </code> </small>
        <br>
        <br>
        <div style="background-color: #eee;white-space: pre-wrap;cursor: default;">
          <span class="PatchSpan" v-for="patch in patchs" :style='{
            "border-bottom": "3px solid " + probToColor(patch.prob),
            ...(patch.tokens.some(t => t.pruned) ? { "color": "#999" } : {}),
            ...(patch.tokens.some(t => t.bifurcationPoint) ? { "background-color": "#e99" } : {})
          }' :patch-index="patch.index" v-html="patchToSpanHTML(patch)" @mouseenter="handleMouseEnterPatchSpan"
            @mouseleave="handleMouseLeavePatchSpan" @dblclick.prevent="setFloatInputPatch($event, patch)"></span>
        </div>
        <br>
      </div>
      <hr style="color:#eee">
      <div class="final-message-half-pannel">
        <small style="color: #888;">rendered markdown:</small>
        <MessageMarkdown :content="finalMessage.content || '<|null|>'" style="background-color: #eee;" />
      </div>
    </div>
    <hr style="color:#ccc">
  </div>
  <br>
  <div class="floatPatchPannel" @mouseover="floatPatchPannel.waitingToHide = false"
    @mouseleave="floatPatchPannel.waitingToHide = true" :style="{
      position: 'absolute',
      left: `${floatPatchPannel.x}px`,
      top: `${floatPatchPannel.y}px`,
    }" v-if="floatPatchPannel.visible">
    <div v-for="token in activatePatch.tokens.filter(token => (token?.delta?.content !== undefined))"
      class="tokenPannel" style="vertical-align:top; display: inline-block; padding: 5px;">
      <div class="floatPatchPannelHead" style="border-bottom: 2px solid #ccc;">
        <span class="tokenSpan" v-html="escapeHTML(tokenToHtml(token?.delta?.content))" />
      </div>
      <div class="tokenLogprobItems">
        <div v-for="logprobItem in token?.logprobs?.content[0].top_logprobs"
          style="display: block; background-color: #eee;" @click="clickOnLogprobItem(token, logprobItem)"
          @mouseover="activateLogprobItem = logprobItem" @mouseenter="$event.target.style.backgroundColor = '#ddd'"
          @mouseleave="$event.target.style.backgroundColor = ''">
          <span class="tokenSpan" style="color: #444;">{{ tokenToHtml(logprobItem.token_piece || logprobItem.token)
            }}</span>
          <span :style='{ "background-color": probToColor(Math.exp(logprobItem.logprob), 0.18), "float": "right" }'
            style="white-space: pre-wrap;font-family: Monospace;">:{{
              (Math.exp(logprobItem.logprob) * 100).toFixed(1).toString().padStart(5, ' ') }}%</span>
        </div>
      </div>
    </div>
    <footer>
      <hr>
      <span v-if="activateLogprobItem.logprob" style="white-space: pre-wrap;font-family: Monospace;">{{
        Math.exp(activateLogprobItem.logprob) * 100 }}%<br></span>
      <span v-if="activateLogprobItem.bytes" style="font-family: Monospace;"> bytes:
        [{{ typeof activateLogprobItem.bytes === "object" ? activateLogprobItem.bytes.join(',') :
          activateLogprobItem.bytes
        }}]</span>
      <button @click="closeFloatPatchPannel" style="padding: 0px; margin: 0 5px 5px 5px; float:right">❌</button>
    </footer>
  </div>
  <div class="floatInputPatch" v-show="floatInputPatch.visible" :style="{
    position: 'absolute',
    left: `${floatInputPatch.x}px`,
    top: `${floatInputPatch.y}px`,
  }" style="display: flex;">
    <textarea type="text" placeholder="submit: `↵`; newline: `shift+↵`" style="height: 25px; width:auto;"
      class="floatInputPatchInput" @focus="$event.target.select()"
      @keydown.esc.prevent="floatInputPatch.visible = false"
      @keydown.enter="if (!$event.shiftKey) { continueFromToken(floatInputPatch.attachedPatch.tokens.find(x => x.logprobs?.content.length), $event.target.value, -999); floatInputPatch.visible = false; $event.preventDefault() }"
      @blur="floatInputPatch.visible = false; closeFloatPatchPannel()"></textarea>
  </div>
  <br v-for="_ in isMobile ? 30 : apiConfig.chatConfig.top_logprobs">


  <!-- <span class="PatchSpan" v-for="patch in patchs">{{ patch.patch }}</span> -->


  <!-- assistentResponseContent🧎🏿‍♂️‍➡️:
  <div style="background-color: #eee;white-space: pre-wrap;user-select: none;">
    {{ assistentResponseContent }}
  </div> -->
</template>

<style scoped>
/* Avoid automatic enlargement of mobile Web pages */
@media (max-width: 600px) {

  input,
  textarea {
    font-size: 16px;
  }
}

.role-name {
  color: #888;
  font-size: larger;
  font-weight: bold;
  margin-bottom: 2px;
  margin-top: 10px;
}

.final-message-half-pannel {
  display: inline-block;
  width: 49.5%;
}


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
  cursor: default;
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
