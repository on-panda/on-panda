<template>
  <div :style="isMobile ? {} : { width: '90%', margin: '1em auto 2em' }">
    <details>
      <summary>
        <small style="color: #888;">as Data Annotator:</small>
      </summary>
      <h2>onPanda: on-Policy Alignment Data Annotator (PoC)</h2>
      <code>Scaling up your data efficiency before scaling up your data.</code>
    </details>

    <details>
      <summary>
        <small style="color: #888;">as Writing Tool:</small>
      </summary>
      <h2>onPanda: LLM-Native Collaborative Writing Tool </h2>
      <code>Precision byte-level control for LLM writing.</code>
    </details>

    <div style="text-align: center;">

      <img width="128" src="/img/on-panda-logo.png"
        :style="{ transform: _isLogoRotated ? 'rotate(360deg)' : 'rotate(0deg)', transition: 'transform 3s' }"
        @click="_isLogoRotated = !_isLogoRotated" />
      <br>
      <b :style="isMobile ? {} : { fontSize: '20px' }">onPanda: LLM-Native Interaction Design</b>
      <br>
      <br>
    </div>

    <details>
      <summary>
        <small style="color: #888;">usage:</small>
      </summary>
      <br>
      &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <img src="/img/onPanda-demo-candidate.gif"
        style="box-shadow: 0 0px 8px rgba(0, 0, 0, 0.5);width: 406px;max-width: 90%;">
      <br>
      <br>
      Usage:<br>
      <b>Basic Features:</b><br>
      - Hover over any word to see alternative suggestions<br>
      - Click a suggestion to continue generating from that point<br>
      - Double-click any word to manually edit and continue<br>
      - Select text to edit or let AI optimize it<br>

      <b>Advanced Features:</b><br>
      - Paste images directly for visual language model support<br>
      - Single-click image to enlarge, double-click to open<br>
      - Double-click role labels to edit them<br>

      <br><b>Beginner's tips:</b>
      <br>
      - You can try any button freely, except save button.<br>
      - Recommend clicking on all the examples below once.<br>
    </details>

    <el-divider content-position="left">
      examples:
    </el-divider>

    <div style="line-height: 2">
      <template v-for="(func, name) in exampleNameToFunc">
        <el-tag type="info" @click="func()" style="cursor: pointer; margin-left: 5px;">
          {{ name }}
        </el-tag>
      </template>
    </div>

    <el-divider content-position="left" style="margin-bottom: 5px;">
      <b> dialog:</b>
    </el-divider>
    <div class="dialogFixedPosition"
      :style="Object.assign(pandaState?.isDeleted.value ? { backgroundColor: '#ffe8e8' } : {}, isMobile ? {} : { padding: '10px' })"
      style="border-radius: 5px; ">
      <div class="promptMessages">
        <!-- <Message v-for="(message, index) in messages" :message="message" 
          @sendButton="opreators.newGenerate()"
          @deleteMessage="opreators.clearOrDeleteMessage(message, index)" @focus="opreators.editPrompt.before()"
          @blur="opreators.editPrompt.after()" /> -->
        <!-- change edit in compoment to edit in opreators -->
        <Message v-for="(message, index) in messages" :key="message.role + messageToSeq(message) + index"
          :message="message" :index="index" :opreators="opreators" />
      </div>

      <div class="responsePannel" :style="globalStore.cleanMode ? { maxWidth: '1024px' } : {}">
        <div class="finalMessageHeadBar" style="display: flex; justify-content: space-between;"
          :style="isMobile ? {} : { width: '50%' }">
          <MessageRole :message="finalMessage" />
          <span class="stretch" style="margin-right: auto" />
          <footer class="finalMessageControlButtons" style="display :flex; margin-top:5px; margin-bottom:-5px">
            <span class="stretch" style="margin-right: auto" />
            <el-tooltip v-if="!requestStatus.generating" content="continue" placement="top">
              <el-button :icon="DArrowRight" size="small" :disabled="!tokens?.length"
                @click="opreators.continueGenerating()" />
            </el-tooltip>
            <el-tooltip v-if="requestStatus.generating" content="stop generating" placement="top">
              <el-button :icon="VideoPause" size="small" @click="opreators.stopGenerating()" />
            </el-tooltip>
            <el-tooltip content="try again" placement="top">
              <el-button :icon="Refresh" size="small" @click="opreators.newGenerate()" />
            </el-tooltip>
            <el-tooltip v-if="0" content="edit (TBD)" placement="top">
              <el-button :icon="Edit" size="small" :disabled="true || !finalMessage.content" />
            </el-tooltip>
            <el-tooltip content="refresh tokens' probability" placement="top">
              <el-button :icon="View" size="small" :disabled="!finalMessage.content || requestStatus.generating"
                @click="requestPromptLogprobs" />
              @click="requestPromptLogprobs" />
            </el-tooltip>
            <el-tooltip placement="top" effect="light">
              <template #content>
                Click to copy response, <br>Or double-click to <br>
                <el-button size="small" @click="duplicateWindow(pandaState)">
                  Duplicate Window
                </el-button>
              </template>
              <el-button :icon="DocumentCopy" size="small" :disabled="!finalMessage.content"
                @click="copyToClipboard(finalMessage.content)" @dblclick="duplicateWindow(pandaState)" />
            </el-tooltip>
            &nbsp;&nbsp;&nbsp;
            <hr v-if="!isMobile" style="color:#eee; margin-top: -5px; margin-bottom: 4px">
          </footer>
          <el-switch v-if="isMobile" v-model="scrollSwitch.isSwitched.value" inline-prompt active-text="raw"
            inactive-text="MD" @change="scrollSwitch.scrollToPosition"
            style="margin-right: 8px;--el-switch-on-color: #aaa; --el-switch-off-color: #aaa; width:45px" />
        </div>
        <div class="replayStatisticsSubtitle" style="display: flex; justify-content: space-between;">
          <small style="color: #888;"> model:
            <code>{{ tokensModelNames }}</code>
            <span v-if="tokens.length && tokens[tokens.length - 1]?.usage?.prompt_tokens"> ｜ tokens: {{
              tokens[tokens.length
                - 1]?.usage?.prompt_tokens }} + {{ tokens[tokens.length - 1]?.usage?.completion_tokens }} </span>
            <span v-if="bitTokens.length > 1"> ｜
              <el-tooltip class="" effect="light" placement="bottom" raw-content>
                <template #content>
                  <MessageMarkdown
                    content="${\text{bits}} = - \sum_{i} \log_2(p_i)$. // note for vLLM server model: 
                  Logprob value are affected by sampling parameters, click: [🔗URL](https://github.com/vllm-project/vllm/issues/9453)" />
                </template>
                bits
              </el-tooltip>
              / tokens: {{ bitTotal.toFixed(1) }} ÷ {{ bitTokens.length }} = {{ (bitTotal /
                bitTokens.length).toFixed(2)
              }}
              <!-- <el-icon>
            <QuestionFilled style="height: 11px;" />
          </el-icon> -->
            </span>


          </small>
          <small style="color: #888;" v-if="!isMobile"> rendered markdown </small>
        </div>

        <div class="finalMessageTwoPannel" v-if="!globalStore.cleanMode"
          style="width: 100%;overflow:scroll;overflow-y:hidden" ref="scrollDiv">
          <div style="display: flex; justify-content: space-between;" :style="{ 'width': isMobile ? '195%' : '100%' }">
            <div class="final-message-half-pannel">
              <div style="background-color: #eee;white-space: pre-wrap;cursor: default;">
                <p style="color: #444" v-if="!tokens.length">
                  <span v-html="WaitingInfo"></span>
                </p>
                <p ref="rawOnPandaPannelRef">
                  <span class="PatchSpan" v-for="patch in patchs"
                    :key="`t${pandaState.uuid.value}-d${pandaState.currentDialogKey.value}-p${patch.index}:${patch.patch}`"
                    :style='{
                      "border-bottom": "3px solid " + probToColor(patch.prob),
                      ...(patch.tokens.some(t => t.pruned) ? { "color": "#999" } : {}),
                      ...(patch.tokens.some(t => t.bifurcationPoint) ? { "background-color": "#e99" } : {}),
                      ...(patch.tokens.some(t => t.selected) ? { "background-color": "#0078d7", "color": "#fff" } : {}),
                    }' :patch-index="patch.index" v-html="patchToSpanHTML(patch)"
                    @mouseenter="handleMouseEnterPatchSpan" @mouseleave="handleMouseLeavePatchSpan"
                    @dblclick.prevent="setFloatInputPatch($event, patch)"></span>
                  <el-tooltip
                    v-if="apiConfig.support_continue_final_message && tokens.length && tokens[tokens.length - 1].finish_reason == 'length'"
                    content="native continue generating" placement="bottom">
                    <el-button :icon="DArrowRight" size="small" @click="opreators.continueGenerating()"
                      style="margin-left: 10px;height: 16px" />
                  </el-tooltip>
                </p>
              </div>
            </div>
            <hr style="color:#eee">
            <div class="final-message-half-pannel">
              <MarkdownResponse :content="finalMessage.content" :WaitingInfo="WaitingInfo" />
            </div>
          </div>
        </div>
        <div v-if="globalStore.cleanMode">
          <MarkdownResponse :content="finalMessage.content" :WaitingInfo="WaitingInfo" />
        </div>
      </div>
    </div>


    <div @mouseover="floatPatchPannel.waitingToHide = false" @mouseleave="floatPatchPannel.waitingToHide = true"
      ref="floatPatchPannelRef"
      style="position: absolute; padding-top: 4px;background-color: rgba(200, 200, 200, 0.3); " :style="{
        position: 'absolute',
        left: `${floatPatchPannel.x}px`,
        top: `${floatPatchPannel.y}px`,
      }" v-if="floatPatchPannel.visible">
      <!-- `padding-top: 4px` to avoid next line's token activate @mouseover  -->
      <div class="floatPatchPannel" style="position: relative; z-index: 10;">
        <div v-for="token in activatePatch?.tokens?.filter(token => (token?.delta?.content !== undefined))"
          class="tokenPannel" style="vertical-align:top; display: inline-block; padding: 5px;padding-left: 0px;">
          <div class="floatPatchPannelHead" style="border-bottom: 2px solid #ccc;">
            <span class="tokenSpan" v-html="escapeHTML(tokenToHtml(token?.delta?.content))" />
          </div>
          <div class="tokenLogprobItems">
            <div v-for="logprobItem in token?.logprobs?.content[0].top_logprobs"
              style="display: block; background-color: #eee;" @click="() => {
                opreators.continueWithChosen(token, logprobItem)
              }" @mouseover="activateLogprobItem = logprobItem"
              @mouseenter="$event.target.style.backgroundColor = '#ddd'"
              @mouseleave="$event.target.style.backgroundColor = ''">
              <span class="tokenSpan" style="color: #444;">{{ tokenToHtml(logprobItem.token)
                }}</span>
              <span :style='{ "background-color": probToColor(Math.exp(logprobItem.logprob), 0.18), "float": "right" }'
                style="white-space: pre-wrap;font-family: Monospace;">:{{
                  (Math.exp(logprobItem.logprob) * 100).toFixed(1).toString().padStart(5, ' ') }}%</span>
            </div>
          </div>
        </div>
        <footer class="tokenPannel" style="min-height: 24px; padding: 5px;">
          <button :icon="Close" @click="closeFloatPatchPannel"
            style="padding: 0px; margin: 0 0px -5px 0px; float:right;">❌</button>
          <span v-if="activateLogprobItem.logprob" style="font-family: Monospace;"> {{
            (-Math.log2(Math.exp(activateLogprobItem.logprob))).toFixed(2) }} bit
            <br>
            {{
              Math.exp(activateLogprobItem.logprob) * 100 }}%<br></span>
          <span v-if="activateLogprobItem.bytes" style="font-family: Monospace;"> bytes:
            [{{ typeof activateLogprobItem.bytes === "object" ? activateLogprobItem.bytes.join(',') :
              activateLogprobItem.bytes }}]
          </span>
          <br>
          <span v-if="activateLogprobItem.token_piece" style="font-family: Monospace;"> token_piece:
            "{{ activateLogprobItem.token_piece }}"
          </span>
        </footer>
      </div>
    </div>


    <div ref="floatInputPatchRef" class="floatInputPatch" v-show="floatInputPatch.visible" :style="{
      position: 'absolute',
      left: `${floatInputPatch.x}px`,
      top: `${floatInputPatch.y}px`,
    }" style="display: flex">
      <textarea type="text" placeholder="submit: `↵`; newline: `shift+↵`" style="height: 25px; width:auto;"
        class="floatInputPatchInput" @focus="$event.target.select()"
        @keydown.enter="if (!$event.shiftKey) { opreators.continueWithInput(floatInputPatch.attachedPatch.tokens.find(x => x.delta?.content?.length), $event.target.value, -999); floatInputPatch.visible = false; $event.preventDefault() }" />
    </div>

    <div ref='floatSelectedOpreationPannelRef' class="floatSelectedOpreationPannel"
      v-show="floatSelectedOpreationPannel.visible && !floatInputPatch.visible || floatSelectedOpreationPannel.improveInputVisible"
      :style="{
        position: 'absolute',
        left: `${floatSelectedOpreationPannel.x}px`,
        top: `${floatSelectedOpreationPannel.y}px`,
      }">
      <el-button-group class="floatSelectedOpreationPannelButtons"
        v-show="!floatSelectedOpreationPannel.improveInputVisible" style="z-index: 15;" @click="selectedTokens.map(
          token => token.selected = true
        )" :size="isMobile ? '' : 'small'">
        <el-tooltip content="Manually edit" placement="bottom">
          <el-button :disabled="true" :icon="Edit" />
        </el-tooltip>
        <el-tooltip content="Improve by AI" placement="bottom">
          <el-button :icon="ChatLineRound" @click="floatSelectedOpreationPannel.improveInputVisible = true" />
        </el-tooltip>
        <el-tooltip content="Explain by AI" placement="bottom">
          <el-button :disabled="true" :icon="QuestionFilled" />
        </el-tooltip>
        <el-tooltip content="Try again" placement="bottom">
          <el-button :disabled="true" :icon="Refresh" />
        </el-tooltip>
      </el-button-group>
      <div v-show="floatSelectedOpreationPannel.improveInputVisible"
        style="display: flex; justify-content: space-between;">
        <textarea v-model="floatSelectedOpreationPannel.improveInputText" type="text"
          placeholder="Instruction for AI to improve" style="height: 25px; width:auto;" @focus="$event.target.select()"
          @keydown.enter="improveSelectedText" />

        <el-button :icon='Promotion' size="" @click="improveSelectedText"></el-button>
      </div>
    </div>
    <br>
    <DialogControlPannel />
    <AnnotatorPanel
      v-if="pandaState.dialogCache.value?.annotate || pandaState.pandaTree.value?.description || pandaState.pandaTree.value?.comment || globalStore.debug" />

    <el-divider content-position="left" style="margin-bottom: 5px;">new message:</el-divider>
    <div :style="{ opacity: newTurnMessage.content ? 1 : 0.5 }">
      <Message :message="newTurnMessage" @deleteMessage="newTurnMessage.content = ''"
        @sendButton="opreators.newRoundMessage()" />
    </div>

    <!-- <div v-html="warningContent" style="background-color: #fdd;white-space: pre-wrap;cursor: default;"></div> -->

    <pre v-show="false">{{ JSON.stringify(selectedTokens.map(token => token.delta.content), null, 2) }}</pre>

    <el-divider content-position="left">
      <b>control parameter:</b>
    </el-divider>

    <el-form class="toolbar options" label-width="140px">
      <el-form-item label="model">
        <el-select-v2 v-model="modelName" filterable :options="Object.keys(apiConfigs).map((x, idx) => ({
          value: x,
          label: x,
        }))" placeholder="Select model" style="width: 440px" size="small" />
      </el-form-item>

      <div style="line-height: 1.85;margin-top: -20px;margin-bottom: -5px;" :align="isMobile ? 'right' : ''">
        <span v-for="_ in (isMobile ? 0 : 30)">&nbsp;</span>
        <template v-for="(value, key) in modelNameTags">
          <el-tag :type="modelName.includes(value) ? 'primary' : 'info'" @click="modelName = value"
            style="cursor: pointer;margin-left: 5px;">
            {{ key }}
          </el-tag>
        </template>
      </div>
      <br>

      <el-form-item label="temperature">
        <el-input-number v-model="chatConfig.temperature" :min="0" :max="10" :step="0.01" size="small" />
      </el-form-item>

      <el-form-item label="max_tokens">
        <el-input-number v-model="chatConfig.max_tokens" :min="1" :max="1048576" :step="1" size="small" />
      </el-form-item>

      <el-form-item label="top_p">
        <el-input-number v-model="chatConfig.top_p" :min="0" :max="1" :step="0.01" size="small" />
      </el-form-item>

      <!-- <el-form-item label="Freq. Penalty">
        <el-input-number v-model="chatConfig.frequency_penalty" :min="0" :max="10" :step="0.01"
          size="small" />
      </el-form-item> -->

      <el-form-item label="top_logprobs">
        <el-input-number v-model="chatConfig.top_logprobs" :min="0" :max="50" :step="1" size="small" />
      </el-form-item>

      <el-form-item label="continue generating">
        <small>
          <el-tag :type="apiConfig.support_continue_final_message ? 'success' : 'danger'">
            {{ apiConfig.support_continue_final_message ? "native" : "prompt engineering" }}
          </el-tag>
          &nbsp;
          <el-tooltip class="" effect="light" placement="top" raw-content>
            <template #content>
              <MessageMarkdown
                :content="'Is this model support continue final message natively?\n\nIf not, the engineering prompt will be used for continue generating: \n\n> ' + CONTINUE_PROMPT" />
            </template>
            <el-icon>
              <InfoFilled />
            </el-icon>
          </el-tooltip>
        </small>
      </el-form-item>
    </el-form>
    <div v-if="warningContent"
      style="background-color: #fdd;white-space: pre-wrap;cursor: default;overflow-x: scroll; padding: 10px">
      <h3>Error Messages:</h3>
      <div v-html="warningContent"></div>
    </div>
    <br v-for="_ in (isMobile ? 12 : apiConfig.chat_config.top_logprobs)">
  </div>
</template>

<script setup>
import { ref, computed, watch, toValue, provide } from 'vue'
import { onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import Message from './components/Message.vue'
import MessageRole from './components/MessageRole.vue'
import MessageMarkdown from './components/MessageMarkdown.vue'
import AnnotatorPanel from './components/AnnotatorPanel.vue'
import DialogControlPannel from './components/DialogControlPannel.vue'

import { OpenAI } from './utils/fetchOpenaiApi.js'
import { useGlobalStore } from './stores/globalStore.js'
import { useEventListener, closeFloatPannelMeta, buildMockObject } from '@/utils/commonUtils.js'
import { p, escapeHTML, copyToClipboard, duplicateWindow, tryLoadDuplicateWindow, deepCopy, deepEqual, ObjctKeyToCamelCaseNaming } from '@/utils/commonUtils.js'
import { tokensToSeq, normalizeRequest, messageToSeq } from './utils/chatUtils.js'

import { DocumentCopy, Edit, Refresh, VideoPause, DArrowRight, ChatLineRound, QuestionFilled, Promotion, View, Close, InfoFilled } from '@element-plus/icons-vue'

const globalStore = useGlobalStore()


var bitTokens = computed(() => tokens.value.filter(token => typeof token.logprobs?.content[0]?.logprob === "number"))

var bitTotal = computed(
  () => bitTokens.value.reduce((sum, token) => sum + - Math.log2(probOfToken(token)), 0)
)

async function requestPromptLogprobs() {
  // TODO auto run when chat_config is changed
  var messages = messagesComputed.value
  messages = messages.filter(message => message.content)
  console.assert(messages[messages.length - 1].role == "assistant", "last message should be assistant", messages)
  var body = {
    messages: messages,
    model: apiConfig.value.chat_config.model,
    temperature: apiConfig.value.chat_config.temperature,
    logprobs: true,
    add_generation_prompt: false,
    continue_final_message: true,
    max_tokens: 1,
    top_logprobs: apiConfig.value.chat_config.top_logprobs,
    prompt_logprobs: apiConfig.value.chat_config.top_logprobs,
  }
  try {

    var json = await openai.value.chat.completions.create(normalizeRequest(body));

    var lastMessageContent = messages[messages.length - 1].content
    var lastMessageContent_ = ''
    var tokensNew = []
    if (!json.prompt_logprobs_list) {
      ElMessage({
        showClose: true,
        message: 'No prompt_logprobs in response, maybe the model does not support prompt_logprobs',
        type: 'error',
        duration: 10000,
      })
      return
    }
    for (var i = json.prompt_logprobs_list.length - 1; i >= 0; i--) {
      var logprobs = json.prompt_logprobs_list[i]
      var token_content = logprobs.content[0].token

      if ((token_content + lastMessageContent_).length > lastMessageContent.length) {
        break
      }
      tokensNew.unshift({
        delta: { role: tokens.value[0].delta.role, content: token_content },
        logprobs: logprobs,
        model: tokens.value[0].model,
      })
      lastMessageContent_ = token_content + lastMessageContent_
    }
    var lastToken = json.choices[0]
    var usage = {
      prompt_tokens: json.prompt_logprobs_list.length - tokensNew.length + 2,
      completion_tokens: tokensNew.length,
    }
    if (lastToken?.finish_reason == "stop") {  // if finish_reason is stop, add to tokensNew
      tokensNew.push({
        delta: { role: tokens.value[0].role, content: "" },
        logprobs: lastToken.logprobs,
        model: json.model,
        finish_reason: lastToken.finish_reason,
      })
      usage.completion_tokens += 1
    }

    lastToken = tokensNew[tokensNew.length - 1]
    lastToken.model = json.model
    lastToken.usage = usage

    tokensNew.map((token, tokenIndex) => {
      token.tokenIndex = tokenIndex
    })

    tokens.value = tokensNew
    ElMessage({
      showClose: true,
      message: 'Response probability refreshed',
      type: 'success',
      duration: 5000,
    })
  }
  catch (error) {
    warning(error)
    throw error
  }
}


function useSelectedNodes(containerRef) {
  const selectedNodes = ref({ startNode: null, endNode: null });

  const mouseUpUpdateSelectedNodes = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      selectedNodes.value = { startNode: null, endNode: null };
      return;
    }

    const range = selection.getRangeAt(0);
    let startNode = range.startContainer;
    let endNode = range.endContainer;
    // If startNode or endNode is a text node (nodeType 3), get their parentElement
    if (startNode.nodeType === 3) {
      startNode = startNode.parentElement;
    }
    if (endNode.nodeType === 3) {
      endNode = endNode.parentElement;
    }

    // Check if startNode and endNode are within containerRef
    if (
      containerRef &&
      containerRef.value &&
      containerRef.value.contains(startNode) &&
      containerRef.value.contains(endNode)
    ) {
      selectedNodes.value = { startNode, endNode };
    } else {
      selectedNodes.value = { startNode: null, endNode: null };
    }
    // console.log('text node', startNode, endNode, selection, range);
  }

  useEventListener(document, 'mouseup', mouseUpUpdateSelectedNodes);
  useEventListener(document, 'touchend', mouseUpUpdateSelectedNodes);
  useEventListener(document, 'focusin', mouseUpUpdateSelectedNodes);  // Close when double click

  return selectedNodes;
}

const rawOnPandaPannelRef = ref(null);
const selectedNodes = useSelectedNodes(rawOnPandaPannelRef);


const selectedTokens = computed(() => {
  floatSelectedOpreationPannel.value.visible = false
  if (!selectedNodes.value.startNode || !selectedNodes.value.endNode) {
    return [];
  }
  // avoid select the span-in-span patch
  var startNode = selectedNodes.value.startNode
  startNode = ('patch-index' in startNode.attributes) ? startNode : startNode.parentElement

  var endNode = selectedNodes.value.endNode
  endNode = ('patch-index' in endNode.attributes) ? endNode : endNode.parentElement

  //set FloatSelectedOpreationPannel
  setFloatSelectedOpreationPannelBelow()
  floatSelectedOpreationPannel.value.visible = true

  const startPatchIndex = Number(startNode.attributes['patch-index'].value)
  const endPatchIndex = Number(endNode.attributes['patch-index'].value)
  // console.log('selectedNodes', startPatchIndex, endPatchIndex)

  const startTokenIndex = patchs.value[startPatchIndex].tokens[0].tokenIndex
  const endPatch = patchs.value[endPatchIndex]
  const endTokenIndex = endPatch.tokens[endPatch.tokens.length - 1].tokenIndex
  return tokens.value.slice(startTokenIndex, endTokenIndex + 1)
});

function setFloatSelectedOpreationPannelBelow() {
  var endNode = selectedNodes.value.endNode
  if (!endNode) {
    return
  }
  endNode = ('patch-index' in endNode.attributes) ? endNode : endNode.parentElement
  var endNodeRect = endNode.getBoundingClientRect()
  const pixelsPerButton = isMobile.value ? 45 : 35
  const x = endNodeRect.right + window.scrollX - pixelsPerButton * document.querySelectorAll('.floatSelectedOpreationPannelButtons button').length
  floatSelectedOpreationPannel.value.x = Math.max(x, 10)
  floatSelectedOpreationPannel.value.y = endNodeRect.bottom + window.scrollY + 2
}



const floatSelectedOpreationPannel = ref({
  visible: false,
  improveInputText: "",
  improveInputVisible: false,
  x: 0,
  y: 0,
})

const floatSelectedOpreationPannelRef = ref(null)
closeFloatPannelMeta(floatSelectedOpreationPannelRef, () => {
  // On mobile devices it disappears immediately after clicking, rendering the tool tips position invalid.
  setTimeout(() => {
    floatSelectedOpreationPannel.value.improveInputVisible = false
  }, 10)
})

function improveSelectedText() {
  const selectedText = selectedTokens.value.map(token => token.delta.content).join("")
  console.log('improveSelectedText', floatSelectedOpreationPannel.value.improveInputText, selectedText)
  floatSelectedOpreationPannel.value.improveInputVisible = false
}

const innerWidth = ref(window.innerWidth)
const _isLogoRotated = ref(false)

function handleResize() {
  innerWidth.value = window.innerWidth
}
useEventListener(window, 'resize', handleResize)
handleResize()

var isMobile = computed(() => innerWidth.value < 700)
var isMobileByUserAgent = (/Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i).test(navigator.userAgent) && ('ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0)


import { useScrollSwitchSync } from '@/utils/scrollSwitch.js'

const scrollDiv = ref(null)
const scrollSwitch = useScrollSwitchSync(scrollDiv); // { isSwitched, scrollToPosition }


const warningContent = ref("")
const warningNumber = ref(0)

function warning(content) {
  if (content instanceof Error) {

    ElMessage({
      showClose: true,
      message: content.message,
      type: 'error',
      duration: 10000,
    })
    let errorMessage = `
    <strong>Error Name:</strong> ${content.name} <br>
    <strong>Error Message:</strong> ${content.message} <br>
    <strong>Error Type:</strong> ${content.constructor.name} <br>
    ${content.fileName ? `<strong>File Name:</strong> ${content.fileName} <br>` : ''}
    ${content.lineNumber ? `<strong>Line Number:</strong> ${content.lineNumber} <br>` : ''}
    <strong>Error Stack:</strong> <pre>${content.stack}</pre>
                `;
    // <strong>Is Custom Error:</strong> ${error instanceof Error} <br>

    content = errorMessage
  } else {
    console.log('warning:', content)
    var json = JSON.stringify(content, null, 2)
    content = '<pre>' + json + '</pre>'
  }
  const now = new Date();
  const dateTimeString = now.toLocaleString();
  warningNumber.value += 1
  warningContent.value = "<hr><br><b>" + warningNumber.value + ' th error, ' + "</b>" + dateTimeString + "<br>" + content + warningContent.value
}

const defaultApiConfig = {
  "support_continue_final_message": true,
  "endpoint_name": "endpoint-name",
  "model_roles": ["assistant"],
  "client_config": {
    base_url: window.location.origin + "/llama-cpu",
    // base_url: window.location.origin + "/qwen-cpu",
    api_key: "sk-Nokey",
    dangerouslyAllowBrowser: true
  },
  "chat_config": {
    model: 'meta-llama/Meta-Llama-3-8B-Instruct',
    // model: 'Qwen/Qwen2.5-1.5B-Instruct',
  },
}

const chatConfig = ref({
  stream: true,
  logprobs: true,
  top_logprobs: 20,
  // top_k: 2,
  max_tokens: 3072,
  temperature: 0.5,
  stream_options: {
    include_usage: true,
  },
})

const exampleNameToFunc = {
  "clear": () => {
    opreators.pandaState = pandaState
    pandaState.setEmpty()
  },
  "default": () => {
    modelName.value = "on-panda"
    opreators.loadMessagesWithPandaTree(messagesDefaultExample)
    opreators.newGenerate()
  },
  "R in 🍓": () => {
    opreators.loadMessagesWithPandaTree([{ role: "system", content: "" }, { role: "user", content: "🍍菠萝的英文单词有几个 P ?", description: "answer is 3", comment: "`comment` is editable for annotator" }])
    opreators.newGenerate()
  },
  "image": () => {
    modelName.value = "image"
    opreators.loadMessagesWithPandaTree(messagesImageExample)
    opreators.newGenerate()
  },
  // "audio": () => {
  //   modelName.value = "audio"
  //   opreators.loadMessagesWithPandaTree(messagesAudioExample
  //   )
  //   opreators.newGenerate()
  // },
  "tokenizer": () => {
    opreators.loadMessagesWithPandaTree(messagesTokenizerExample
    )
    opreators.newGenerate()
  },
  "random": () => {
    opreators.loadMessagesWithPandaTree([{ role: "user", content: "just output a random float128 number without any words, no code" }]
    )
    opreators.newGenerate()
  },
  "笑话": () => {
    opreators.loadMessagesWithPandaTree([{ role: "user", content: "讲一个关于西游记的笑话, 100字" }]
    )
    opreators.newGenerate()
  },
  "诗": () => {
    opreators.loadMessagesWithPandaTree([{ role: "user", content: "写藏头诗：\n人工智能，大有可为" }]
    )
    opreators.newGenerate()
  },
  "计算": () => {
    opreators.loadMessagesWithPandaTree([{ role: "system", content: "" }, { role: "user", content: "已知小王 2024年30岁，本来预计60岁退休。但现在中央每五年开一次会，每开一次会决定退休年龄延迟3年，求老王的真正退休年龄。" }]
    )
    opreators.newGenerate()
  },
  "count": () => {
    opreators.loadMessagesWithPandaTree([{ role: "system", content: "" }, { role: "user", content: "How many 1 in 01011010101111011011?", description: "Answer is 13" }]
    )
    opreators.newGenerate()
  },
  "AIME": () => {
    opreators.loadMessagesWithPandaTree([{ role: "system", content: "" }, { role: "user", content: "Real numbers $x$ and $y$ with $x,y>1$ satisfy $\log_x(y^x)=\log_y(x^{4y})=10.$ What is the value of $xy$?", description: "Answer is 25" }]
    )
    opreators.newGenerate()
  },
  "continue": () => {
    loadMessages(messagesContinueExample)
    setTimeout(() => opreators.continueGenerating(), 2000)
  },
  "annotate": async () => {
    pandaState.setExample()
    opreators.pandaState = pandaState
    await sleep(100)
    opreators.continueGenerating()
  }
}
var messages
// var messages = [{ role: "user", content: "just repeat 1 time: `पत्नी`" }]
var messagesDefaultExample = [{ role: "system", content: "" }, { role: "user", content: "🍓草莓的英文单词有几个 R ?" }]

messages = messagesDefaultExample

var messagesTokenizerExample = [{ role: "user", content: "Repeat only once, no other words:\n```\n<|磊|>🧎🏿‍♂️‍➡️\\n<hr>\n蘒    𝒀𝒆𝒔पत्नी\n```" }]

var messagesContinueExample = [{ role: "user", content: "Tell me a common saying" }, { "role": "assistant", "content": "An apple a day, keeps", "finish_reason": "stop" }]

// VLM
var messagesImageExample = [{
  role: "user", content: [
    { type: "text", text: "图中左侧的 “v” 是由什么形状构成？\n" },
    {
      type: "image_url", image_url: {
        url: "https://docs.vllm.ai/en/latest/_static/vllm-logo-text-light.png"
      },
    }
  ]
}]

var messagesAudioExample = [
  {
    "role": "system",
    "content": ""
  },
  {
    "role": "user",
    "content": [
      { type: "text", text: "分两步:\n1. 把这段语音转换为文字\n2. 回答语音中的问题\n" },
      {
        "type": "audio_token",
        "audio_token": "<audio_667><audio_667><audio_4390><audio_1326><audio_3886><audio_993><audio_689><audio_4171><audio_1367><audio_1349><audio_194><audio_853><audio_3690><audio_1044><audio_3123><audio_759><audio_776><audio_2449><audio_2502><audio_3738><audio_573><audio_573><audio_1226><audio_3270><audio_2377><audio_72><audio_35><audio_4106><audio_2267><audio_2930><audio_321><audio_321><audio_1155><audio_3274><audio_3450><audio_866><audio_54><audio_3317><audio_1535><audio_1484><audio_54><audio_925><audio_2264><audio_3593><audio_1089><audio_925><audio_133><audio_1484><audio_1768><audio_1146><audio_634><audio_634><audio_3074><audio_3311><audio_4329><audio_123><audio_936><audio_2265><audio_3172><audio_2317><audio_866><audio_72><audio_1048><audio_5080><audio_2377><audio_72><audio_936><audio_3211><audio_1795><audio_1039><audio_571><audio_431><audio_3186><audio_3186><audio_3186>"
      }
    ]
  }
]

// messages = messagesImageExample
// messages = messagesAudioExample
var messages = ref(messages)


function loadMessages(newMessages) {
  if (newMessages[newMessages.length - 1].role == "assistant") {
    var lastMessage = newMessages[newMessages.length - 1]
    var isEqual = deepEqual(finalMessage.value, lastMessage)
    if (!isEqual) {
      tokens.value = []
      var newTokens = convertMessageToTokens(lastMessage)
      tokens.value = newTokens
    }
    newMessages = newMessages.slice(0, newMessages.length - 1)
  } else {
    tokens.value = []
  }
  messages.value = newMessages
}

function convertMessageToTokens(message) {
  if (message.role == "assistant") {
    var content = message.content
    var tokens = Array.from(segmenter.segment(content)).map((token, tokenIndex) => {
      return {
        delta: { content: token.segment },
        tokenIndex: tokenIndex,
        logprobs: { content: [{ token: token.segment, top_logprobs: [] }] },
      }
    })
    if (tokens && tokens.length > 0) {
      tokens[0].delta.role = "assistant"
      if (message.finish_reason) {
        tokens[tokens.length - 1].finish_reason = message.finish_reason
      }
      if (!message.finish_reason || message.finish_reason == "length") {
        tokens[tokens.length - 1].bifurcationPoint = true
      }
    } else {  // final message is empty content but with role name
      tokens = [{
        delta: { role: message.role, content: "" },
        tokenIndex: 0,
        logprobs: { content: [{ token: "", top_logprobs: [], logprob: 0 }] },
      }]
    }
  }
  return tokens
}

// TODO mv to workround and rename to monkeyPatch.js
import apiConfigList from '@/assets/secret/apiConfigList.js'
// list of apiConfigs, if model is not set, fetch all models.

var metaApiConfigs = ref([defaultApiConfig, ...apiConfigList])

const apiConfigs = ref({});

watch(metaApiConfigs, async function watchMetaApiConfigs(newValue) {
  const configs = [];
  for (let apiConfig of newValue) {
    apiConfig = JSON.parse(JSON.stringify(apiConfig));
    if (apiConfig.chat_config.model) {
      configs.push(apiConfig);
    } else {
      try {
        const openai = new OpenAI(ObjctKeyToCamelCaseNaming(apiConfig.client_config));
        const list = await openai.models.list();
        for await (const model of list) {
          const apiConfigWithModel = JSON.parse(JSON.stringify(apiConfig));
          apiConfigWithModel.chat_config.model = model.id;
          configs.push(apiConfigWithModel);
        }
      } catch (error) {
        warning(error)
        console.log("Error in fetching models list");
        console.log(error);
      }
    }
  }
  apiConfigs.value = configs.reduce((obj, config, index) => {
    var key = `${index + 1}—` + (config.endpoint_name ? config.endpoint_name + "—" : "") + (config.chat_config.model || '<|None|>')
    if (isMobile.value) {
      key = `${index + 1} | ` + (config.chat_config.model || '<|None|>') + ' | ' + (config.endpoint_name ? config.endpoint_name : "")
    }
    obj[key] = config;
    return obj;
  }, {});
}, { immediate: true });

var modelName = ref('on-panda')  // using endpoint_name == 'on-panda' as default model
// var modelName = ref('llama3')
// var modelName = ref('image')
// var modelName = ref('audio')

// setTimeout(requestPromptLogprobs, 3000)

watch(modelName, async function watchModelName(newValue) {  // set modelName to page title
  if (document.title.endsWith("onPanda")) {
    document.title = newValue + " | onPanda"
  }
})

const modelNameTags = {
  'on-panda': 'on-panda',
  'o1': 'oone',
  'image': 'image',
  'audio': 'audio',
  'llama': 'others-llama3p1-70b-chat',
  // 'qwen': 'others-qwen2p5-72b-chat',
  'gpt4o': 'chatgpt-4o-latest',
  'claude': 'claude-3-5-sonnet-20241022',
}

const chatConfigKeys = Object.keys(chatConfig.value)

const apiConfigChosen = computed(() => {
  var apiConfigChosen = defaultApiConfig
  for (const [key, config] of Object.entries(apiConfigs.value)) {
    if (key.includes(modelName.value)) {
      apiConfigChosen = config
      break
    }
  }
  for (const key of chatConfigKeys) { // apply apiConfigChosen.chat_config
    if (key in apiConfigChosen.chat_config) {
      chatConfig.value[key] = apiConfigChosen.chat_config[key]
    }
  }
  return apiConfigChosen
})

const apiConfig = computed(() => {
  // update apiConfig with defaultApiConfig
  var apiConfig = { ...apiConfigChosen.value }  // copy instead of reference
  apiConfig.client_config = { ...defaultApiConfig.client_config, ...apiConfig.client_config }
  apiConfig.chat_config = { ...defaultApiConfig.chat_config, ...apiConfig.chat_config, ...chatConfig.value }
  apiConfig = { ...defaultApiConfig, ...apiConfig }
  apiConfig.client_config.base_url = apiConfig.client_config.base_url.replace('${origin}', window.location.origin)

  return apiConfig
})


const openai = computed(() =>
  new OpenAI(ObjctKeyToCamelCaseNaming(apiConfig.value.client_config))
)
const tokens = ref([]);

const tokensModelNames = computed(() => {

  var tokensModelNames = []
  tokens.value.map(token => {
    if (token.model && !tokensModelNames.includes(token.model)) {
      tokensModelNames.push(token.model)
    }
  })

  if (tokensModelNames.length === 0) {
    return "unknown_model"
  }
  return tokensModelNames.join(", ")
})

const requestStatus = ref({
  requestTimes: 0,
  generating: false,
})

const WaitingInfo = computed(() => {
  if (requestStatus.value.generating) {
    return `⏳ <b>No.${requestStatus.value.requestTimes}</b> request, waiting response from model: <br>  <code style='margin-left:30px'> ${apiConfig.value.chat_config.model} </code>`
  } else {
    return "➡️ Please click the send button."
  }
})


const CONTINUE_PROMPT = "continue(do not repeat the last few words of your previous reply)"

async function requestLlmServer(messages) {
  messages = toValue(messages)
  const modelRoles = apiConfig.value?.model_roles || ["assistant"]
  const continue_final_message = modelRoles.includes(messages[messages.length - 1].role)
  if (continue_final_message) { // if continue_final_message, not filter the final message with role
    messages = messages.slice(0, messages.length - 1).filter(message => message.content).concat([
      messages[messages.length - 1],
    ])
  } else {
    messages = messages.filter(message => message.content)
  }
  var body = JSON.parse(JSON.stringify(apiConfig.value.chat_config))
  if (continue_final_message) {
    var lastMessageContent = messages[messages.length - 1].content
    var prefillTokensNumber = tokens.value.filter(token => !token.pruned).length
    if (apiConfig.value.support_continue_final_message) {
      body.add_generation_prompt = false
      // body['chat_template_kwargs'] = { continue_final_message: continue_final_message }
      body['continue_final_message'] = continue_final_message
      body['echo'] = false

    } else {
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

  requestStatus.value.generating = true
  requestStatus.value.requestTimes++
  var requestID = requestStatus.value.requestTimes
  var requestModel = apiConfig.value.chat_config.model

  const fetchController = new AbortController();

  var FIRST_TOKEN_TIMEOUT_SECOND = 5 * 60
  let firstTokenTimeoutId = setTimeout(() => {
    var errorMessage = `No.${requestID} request: First token timeout error: >= ` + FIRST_TOKEN_TIMEOUT_SECOND + ` seconds, abort request to model: ${requestModel}.`
    fetchController.abort(errorMessage)
    var error = new Error(errorMessage);
    warning(error)
  }, FIRST_TOKEN_TIMEOUT_SECOND * 1000);

  try {
    var stream = await openai.value.chat.completions.create(normalizeRequest(body), { signal: fetchController.signal });

    var tokenIndex = 0
    var streamIndex = -1
    var generatedContent = ""
    var tokensValuePtr = tokens.value
    for await (const chunk of stream) {
      if ("error" in chunk) {
        throw new Error(JSON.stringify(chunk))
      }
      if (requestID !== requestStatus.value.requestTimes) {
        console.log(new Error(`Request ID mismatch ${requestID} !== ${requestStatus.value.requestTimes}, stope request ID ${requestID}`))

        fetchController.abort()  // tell server to stop generating for saving resource
        return
      }
      if (!requestStatus.value.generating) {
        fetchController.abort()
        return
      }
      if (continue_final_message && !tokenIndex) { // before affect to tokens
        // to remove the last token's finish_reason
        if (tokens.value.length) {
          // at least remain first token for role
          while (tokens.value[tokens.value.length - 1].delta.content === "" && tokens.value.length > 1) {
            tokens.value.pop()
          }
          delete tokens.value[tokens.value.length - 1].finish_reason
        }
        // remove all pruned tokens
        tokens.value = tokens.value.filter(token => !token.pruned)
        tokensValuePtr = tokens.value
        tokenIndex = tokens.value.length
        continue  // first chunk is role, no more role for continue_final_message
      }
      var token = chunk.choices[0];
      if (!token?.delta) {
        continue
      }
      streamIndex++
      if (streamIndex === 0) { // first token
        clearTimeout(firstTokenTimeoutId)
      }
      if (continue_final_message && streamIndex == 1 && token.delta.content == lastMessageContent) {
        // avoid vllm echo bug https://github.com/vllm-project/vllm/issues/10111
        // TODO: remove this after vllm fix the bug
        continue
      }
      token.tokenIndex = tokenIndex
      if (chunk.model) {
        token.model = chunk.model
      }
      if (chunk.usage) {
        token.usage = chunk.usage
      }

      if (chunk.choices) {
        tokenIndex++
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
            tokenIndex = 0
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
    if (tokens.value.length > 2) {  // workround for last token is empty and only have finish_reason
      const lastToken = tokens.value[tokens.value.length - 1]
      const lastToken2 = tokens.value[tokens.value.length - 2]
      if (lastToken.finish_reason && !lastToken.logprobs && lastToken2.logprobs) {
        lastToken2.finish_reason = lastToken.finish_reason
        for (var key in ['stop_reason', 'usage']) {
          if (lastToken[key]) {
            lastToken2[key] = lastToken[key]
          }
        }
        tokens.value.pop()
      }
    }
    requestStatus.value.generating = false
  } catch (error) {
    requestStatus.value.generating = false
    warning(error)
    throw error
  }
}


class OpreatorCenter {
  // continue generating, stop, continue with chosen, continue with input, edit prompt(include role), new round, edit response, refresh, load example, load panda tree.
  constructor() {
  }
  pandaState = buildMockObject()
  continueGenerating = () => {
    this.pandaState.beforeOperation()
    // var isTryGeneratingOnEot = tokens.value.length && tokens.value[tokens.value.length - 1].finish_reason === "stop"
    // if (isTryGeneratingOnEot) {
    // }
    pandaState.nextNotSameOperationCache = {
      operator: "continue_generating",
      on_policy: true,
    }
    requestLlmServer(messagesComputed.value)
  }

  stopGenerating = () => {
    this.pandaState.beforeOperation()
    requestStatus.value.generating = false
  }

  continueWithChosen = (token, logprobItem) => {
    // function clickOnLogprobItem() {
    this.pandaState.beforeOperation()
    prepareContinueFromToken(token, logprobItem.token, logprobItem.logprob)
    this.pandaState.afterOperation({
      operator: "continue_with_chosen",
      on_policy: true,
    }, true)
    requestLlmServer(messagesComputed.value)
    if (isMobile.value) {
      window.setTimeout(closeFloatPatchPannel, 500)
    }
  }

  continueWithInput = (token, continuePrefix, continuePrefixLogprob) => {
    this.pandaState.beforeOperation()
    prepareContinueFromToken(token, continuePrefix, continuePrefixLogprob)
    this.pandaState.afterOperation({
      operator: "continue_with_input",
      on_policy: true,
    }, true)
    requestLlmServer(messagesComputed.value)
  }

  newGenerate = () => {
    if (!finalMessage.value.content && finalMessage.value.role && apiConfig.value.support_continue_final_message) {
      // if only has role, try using continue generating
      this.continueGenerating()
    } else {
      this.pandaState.beforeOperation()
      tokens.value = []
      this.pandaState.afterOperation({
        operator: "new_generate",
        is_new_generated: true,
        on_policy: true,
      })
      requestLlmServer(messages.value)
    }
  }

  newRoundMessage = () => {  // TODO remove auto write back's append opreation
    this.pandaState.beforeOperation()
    var role = newTurnMessage.value.role
    messages.value = (messagesComputed.value.concat([newTurnMessage.value]))
    tokens.value = [];
    newTurnMessage.value = { role: role, content: '' }
    this.pandaState.afterOperation({
      operator: "new_round_message",
      on_policy: true,
    })
    requestLlmServer(messages)
  }

  clearOrDeleteMessage = (message, index) => {
    this.pandaState.beforeOperation()
    if (message.content) {
      // after beforeOperation(), message has been recomputed
      var messageRefresh = messages.value[index]
      messageRefresh.content = ""
      this.pandaState.afterOperation({
        operator: "edit_prompt_clear",
        on_policy: false,
      })
    } else {
      messages.value.splice(index, 1)
      this.pandaState.afterOperation({
        operator: "edit_prompt_delete",
        on_policy: false,
      })
    }
  }

  editPrompt = {
    // long user editing time between `before` and `after`. which will stop generating. abondon!
    before: () => {
      this.pandaState.beforeOperation()
    },
    after: (opreation) => {
      this.pandaState.afterOperation(Object.assign({
        operator: "edit_prompt",
        on_policy: false,
      }, opreation || {}))
    }
  }

  updatePromptContent = (content, index, message) => {
    this.pandaState.beforeOperation()
    var messageRefresh = messages.value[index]
    messageRefresh.content = content
    this.pandaState.afterOperation({
      operator: "edit_prompt",
      on_policy: false,
    })
  }

  editRole = {
    before: () => {
      this.pandaState.beforeOperation()
    },
    after: () => {
      this.pandaState.afterOperation({
        operator: "edit_prompt_role",
        on_policy: false,
      })
    }
  }

  editResponse = () => {
  }

  loadMessagesWithPandaTree = (messages) => {
    this.pandaState.beforeOperation()
    this.pandaState = pandaState
    const dialogNew = { messages: deepCopy(messages) }
    const pandaTreeNew = { dialogs: { 1: dialogNew } }
    this.pandaState.load(pandaTreeNew)
  }
}

function prepareContinueFromToken(token, continuePrefix, continuePrefixLogprob) {
  for (const patch of patchs.value) {
    for (const patchToken of patch.tokens) {
      patchToken.pruned = patchToken.tokenIndex >= token.tokenIndex
      if (patchToken.tokenIndex == token.tokenIndex) {
        patchToken.bifurcationPoint = true
      }
    }
  }
  continuePrefix = continuePrefix || ""
  // const continuePrefixToken = { delta: { content: continuePrefix }, tokenIndex: token.tokenIndex, bifurcationPoint: true, logprobs: token.logprobs }
  token = deepCopy(token)
  delete token.finish_reason
  token.delta.content = continuePrefix
  token.bifurcationPoint = true
  token.pruned = false
  token.logprobs.content[0].logprob = isFinite(continuePrefixLogprob) ? continuePrefixLogprob : -9999
  token.logprobs.content[0].token = continuePrefix
  tokens.value.splice(token.tokenIndex, 0, token);
}

const opreators = new OpreatorCenter()

provide('opreators.editRole', opreators.editRole)

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

function probOfToken(token) {
  var logprob = token.logprobs?.content[0]?.logprob
  var prob = Math.exp(logprob)

  if (typeof logprob !== 'number') {
    if (token.tokenIndex === 0 && !('content' in token.delta)) {
      // if first role token has no prob and will in first patch
      prob = 1
    }
  }
  return prob
}

const patchs = computed(() => {
  const assistentResponseContentAll = tokens.value.map((token) => token.delta.content).join("");
  const visableSegments = Array.from(segmenter.segment(assistentResponseContentAll));
  // add a empty segment at the end for EOT token
  Array.from({ length: 4 }, (_, i) => visableSegments.push({ segment: "" }));
  var patchs = []
  var tokenToSegmentString = "";
  var segmentIndex = 0;
  var tokenStartIndex = 0;
  for (const token of tokens.value) {
    const tokenContent = (token.delta?.content || "");
    var tokenIndex = token.tokenIndex
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
  if (0 <= prob && prob < 0.0001) {
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

function handleMouseLeavePatchSpan(event) {
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

const newTurnMessage = ref({ role: 'user', content: '' })

const finalMessage = computed(() => {
  var role = null  // Compatible with Claude that each token has a role
  var finish_reason
  var finalMessage = tokens.value.filter(
    token => !token.pruned
  ).map(
    token => {
      if (token.finish_reason) {
        finish_reason = token.finish_reason
      }
      return (token.delta || {})
    }
  ).reduce((delta1, delta2) => {
    const delta = { ...delta1 }
    for (var key in delta2) {
      delta[key] = (delta[key] || "") + (delta2[key] || "")
      if (key === "role" && delta2.role) {
        role = delta2.role
      }
    }
    return delta
  }, {})
  if (role) {
    finalMessage.role = role
  } else if (tokens.value.length) {
    finalMessage.role = "assistant" // when has token, the default role is assistant
  }
  if (role && !finalMessage.content) {  // only role but no content
    finalMessage.content = ""
  }
  // Compatible with different models for continue generating
  // For keys other than assistant and user, if v is the empty string, then delete
  for (var key in finalMessage) {
    if (key !== "role" && key !== "content" && finalMessage[key] === "") {
      delete finalMessage[key]
    }
  }
  if (finish_reason) {
    finalMessage.finish_reason = finish_reason
  }
  return finalMessage
})

const messagesComputed = computed(() => {
  if (finalMessage.value.content || finalMessage.value.role) {
    return messages.value.concat([finalMessage.value])
  } else {
    return messages.value
  }
})



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

const floatPatchPannelRef = ref(null)


// exceptTouch=true to avoide touch device close floatPatchPannel by click on another patchSpan
closeFloatPannelMeta(floatPatchPannelRef, closeFloatPatchPannel, true, true)

watch(activatePatch, function watchActivatePatch(newValue, oldValue) {
  activateLogprobItem.value = {}
  oldValue.target?.classList.remove('ActivatePatchSpan')
});

function setFloatPatchPannelBelow(element) {
  element = element || document.querySelector('.ActivatePatchSpan')
  if (!element) {
    return
  }
  const cellRect = element.getBoundingClientRect();
  floatPatchPannel.value.x = cellRect.left + window.scrollX - 3
  floatPatchPannel.value.y = cellRect.bottom + window.scrollY - 4
  if (floatPatchPannel.value.x + 120 > window.innerWidth) {
    // avoid floatPatchPannel out of window
    floatPatchPannel.value.x = floatPatchPannel.value.x - 85
  }
  floatPatchPannel.value.waitingToHide = false;
  floatPatchPannel.value.visible = true;
}


const floatInputPatch = ref({
  visible: false,
  attachedPatch: undefined,
  x: 0,
  y: 0,
})

const floatInputPatchRef = ref(null)

closeFloatPannelMeta(floatInputPatchRef, () => {
  floatInputPatch.value.visible = false
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

function handleReactiveFunctions() {
  setFloatPatchPannelBelow()
  setFloatSelectedOpreationPannelBelow()
}

useEventListener(window, 'resize', handleReactiveFunctions)



import { pandaState } from './stores/pandaState'
import { sleep } from '@/utils/commonUtils'
import MarkdownResponse from './components/widgets/MarkdownResponse.vue'

watch(pandaState.dialogCache,
  function watchPandaStateDialogCache(newValue, oldValue) {
    if (newValue.messages) {
      // this will stop generating when edit
      requestStatus.value.generating = false
      loadMessages(newValue.messages)
      pandaState.tryRestoreTokens()
      // p(tokensToSeq(tokens.value))
      // console.trace()
    }
  }, { flush: 'sync' })

const dialogComputed = computed(() => {

  const dialog = { ...pandaState.dialogCache.value }
  dialog.messages = [...messagesComputed.value]
  // should add new newTurnMessage? No, becasue when load again, newTurnMessage become finalMessage
  // if (newTurnMessage.value.content) {
  //   dialog.messages.push(newTurnMessage.value)
  // }
  return dialog
})

pandaState.registerDialogComputed(dialogComputed)
pandaState.registerApiConfig(apiConfig)
pandaState.registerTokens(tokens)

onMounted(async () => {
  scrollDiv.value.addEventListener('scroll', handleReactiveFunctions);
  try {
    await import('@/assets/secret/workaround.js');
  } catch (error) {
    console.error('Failed to load workaround.js:', error);
  }

  if (!tryLoadDuplicateWindow(pandaState)) { // duplicate window has higher priority
    var exampleFunc = exampleNameToFunc['default']
    if (globalStore.debug) {
      // var exampleFunc = exampleNameToFunc['annotate']
    }
    // var exampleFunc = exampleNameToFunc['image']
    setTimeout(async function launchExampleFunc() {
      await exampleFunc()
      p("tokens", tokens)
      p("patchs", patchs)
    }, 2000)
  }
})

onBeforeUnmount(async () => {
})



</script>

<style scoped>
/* Avoid automatic enlargement of mobile Web pages */
@media (max-width: 600px) {

  input,
  textarea {
    font-size: 16px;
  }
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
  border: 1px solid #ccc;
  border-radius: 5px;
  background-color: #f9f9f9;
}

.floatPatchPannel {
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
