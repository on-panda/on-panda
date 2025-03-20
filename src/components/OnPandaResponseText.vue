<template>

    <p ref="onPandaResponseTextRef" class="OnPandaResponseText" style="white-space: pre-wrap;cursor: default;">
        <span class="PatchSpan" v-for="patch in patchs"
            :key="`t${pandaState.uuid.value}-d${pandaState.currentDialogKey.value}-p${patch.index}:${patch.patch}`"
            :style='{
                "border-bottom": "3px solid " + probToColor(patch.prob),
                ...(patch.tokens.some(t => t.pruned) ? { "color": "#999" } : {}),
                ...(patch.tokens.some(t => t.isReasoningContent) ? { "color": "#666" } : {}),
                ...(patch.tokens.some(t => t.bifurcationPoint) ? { "background-color": "#e99" } : {}),
                ...(patch.tokens.some(t => t.selected) ? { "background-color": "#0078d7", "color": "#fff" } : {}),
            }' :patch-index="patch.index" v-html="patchToSpanHTML(patch)" @mouseenter="handleMouseEnterPatchSpan"
            @mouseleave="handleMouseLeavePatchSpan" @dblclick.prevent="setFloatInputPatch($event, patch)"></span>
        <el-tooltip
            v-if="apiConfig.support_continue_final_message && tokens.length && tokens[tokens.length - 1].finish_reason == 'length'"
            content="native continue generating" placement="bottom">
            <el-button :icon="DArrowRight" size="small" @click="operationCenter.continueGenerating()"
                style="margin-left: 10px;height: 16px" />
        </el-tooltip>
    </p>

    <div @mouseover="floatPatchPannel.waitingToHide = false" @mouseleave="floatPatchPannel.waitingToHide = true"
        ref="floatPatchPannelRef"
        style="position: fixed; padding-top: 4px;background-color: rgba(200, 200, 200, 0.3); z-index: 10;" :style="{
            left: `${floatPatchPannel.x}px`,
            top: `${floatPatchPannel.y}px`,
        }" v-if="floatPatchPannel.visible">
        <!-- `padding-top: 4px` to avoid next line's token activate @mouseover  -->
        <div class="floatPatchPannel" style="position: relative;">
            <div v-for="token in activatePatch?.tokens?.filter(token => (token?.delta?.content !== undefined))"
                class="tokenPannel" style="vertical-align:top; display: inline-block; padding: 5px;padding-left: 0px;">
                <div class="floatPatchPannelHead" style="border-bottom: 2px solid #ccc;">
                    <span class="tokenSpan" v-html="escapeHTML(tokenToHtml(token?.delta?.content))" />
                </div>
                <div class="tokenLogprobItems">
                    <div v-for="logprobItem in (token?.logprobs?.content[0]?.top_logprobs || []).concat([{ finish_reason: 'stop' }])"
                        style="display: block; background-color: #eee; cursor:pointer"
                        @click="(event) => handleLogprobItemClick(event, token, logprobItem)"
                        @mouseover="activateLogprobItem = logprobItem"
                        @mouseenter="$event.target.style.backgroundColor = '#ddd'"
                        @mouseleave="$event.target.style.backgroundColor = ''">
                        <span class="tokenSpan" style="color: #444;">{{ (logprobItem.finish_reason &&
                            `&lt;|${logprobItem.finish_reason}|&gt;`) || tokenToHtml(logprobItem.token) }}</span>
                        <span v-if="logprobItem.logprob !== undefined"
                            :style='{ "background-color": probToColor(Math.exp(logprobItem.logprob), 0.18) }'
                            style="float: right;white-space: pre-wrap;font-family: Monospace;">:{{
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
        left: `${floatInputPatch.x}px`,
        top: `${floatInputPatch.y}px`,
    }" style="display: flex; position: fixed">
        <textarea type="text" :placeholder="t('placeholders.submitEnter')" style="height: 25px; width:auto;"
            class="floatInputPatchInput" @focus="$event.target.select()"
            @keydown.enter="if (!$event.shiftKey) { operationCenter.continueWithInput(floatInputPatch.attachedPatch.tokens[0], $event.target.value, -999); floatInputPatch.visible = false; $event.preventDefault() }" />
    </div>

    <div ref='floatSelectedOperationPannelRef' class="floatSelectedOperationPannel"
        v-show="floatSelectedOperationPannel.visible && !floatInputPatch.visible || floatSelectedOperationPannel.improveInputVisible"
        :style="{
            left: `${floatSelectedOperationPannel.x}px`,
            top: `${floatSelectedOperationPannel.y}px`,
        }" style="position: fixed">
        <el-button-group class="floatSelectedOperationPannelButtons"
            v-show="!floatSelectedOperationPannel.improveInputVisible" style="z-index: 15;" @click="selectedTokens.map(
                token => token.selected = true
            )" :size="isMobile ? '' : 'small'">
            <el-tooltip content="Manually edit" placement="bottom">
                <el-button :disabled="true" :icon="Edit" />
            </el-tooltip>
            <el-tooltip content="Improve by AI" placement="bottom">
                <el-button :icon="ChatLineRound" @click="floatSelectedOperationPannel.improveInputVisible = true" />
            </el-tooltip>
            <el-tooltip content="Explain by AI" placement="bottom">
                <el-button :disabled="true" :icon="QuestionFilled" />
            </el-tooltip>
            <el-tooltip content="Try again" placement="bottom">
                <el-button :disabled="true" :icon="Refresh" />
            </el-tooltip>
        </el-button-group>
        <div v-show="floatSelectedOperationPannel.improveInputVisible"
            style="display: flex; justify-content: space-between;">
            <textarea v-model="floatSelectedOperationPannel.improveInputText" type="text"
                placeholder="Instruction for AI to improve" style="height: 25px; width:auto;"
                @focus="$event.target.select()" @keydown.enter="improveSelectedText" />

            <el-button :icon='Promotion' size="" @click="improveSelectedText"></el-button>
        </div>
    </div>

    <pre v-show="false">{{JSON.stringify(selectedTokens.map(token => token.delta.content), null, 2)}}</pre>
</template>

<script setup>

import { ref, computed, watch, inject } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'

import { useGlobalStore } from '@/stores/globalStore.js'
import { useEventListener, closeFloatPannelMeta } from '@/utils/commonUtils.js'
import { p, escapeHTML } from '@/utils/commonUtils.js'
import { tokensToSeq, probOfToken } from '@/utils/chatUtils.js'
import { probToColor, useSelectedNodes } from '@/utils/userInterfaceUtils.js'

import { Edit, Refresh, DArrowRight, ChatLineRound, QuestionFilled, Promotion, Close } from '@element-plus/icons-vue'

const props = defineProps({
    responseState: {
        type: Object,
        description: 'The response state object',
    },
})

const responseState = props.responseState
const pandaState = responseState.pandaState
const tokens = responseState.tokens
const operationCenter = responseState.operationCenter
const apiConfig = responseState.apiConfig

const globalStore = useGlobalStore()
var isMobile = computed(() => globalStore.isMobile)

const { t } = useI18n()



const onPandaResponseTextRef = ref(null);
const selectedNodes = useSelectedNodes(onPandaResponseTextRef);

const selectedTokens = computed(() => {
    floatSelectedOperationPannel.value.visible = false
    if (!selectedNodes.value.startNode || !selectedNodes.value.endNode) {
        return [];
    }
    // avoid select the span-in-span patch
    var startNode = selectedNodes.value.startNode
    startNode = ('patch-index' in startNode.attributes) ? startNode : startNode.parentElement

    var endNode = selectedNodes.value.endNode
    endNode = ('patch-index' in endNode.attributes) ? endNode : endNode.parentElement

    //set FloatSelectedOperationPannel
    setFloatSelectedOperationPannelBelow()
    floatSelectedOperationPannel.value.visible = true

    const startPatchIndex = Number(startNode.attributes['patch-index'].value)
    const endPatchIndex = Number(endNode.attributes['patch-index'].value)
    // console.log('selectedNodes', startPatchIndex, endPatchIndex)

    const startTokenIndex = patchs.value[startPatchIndex].tokens[0].tokenIndex
    const endPatch = patchs.value[endPatchIndex]
    const endTokenIndex = endPatch.tokens[endPatch.tokens.length - 1].tokenIndex
    return tokens.value.slice(startTokenIndex, endTokenIndex + 1)
});


function setFloatSelectedOperationPannelBelow() {
    var endNode = selectedNodes.value.endNode
    if (!endNode) {
        return
    }
    endNode = ('patch-index' in endNode.attributes) ? endNode : endNode.parentElement
    var endNodeRect = endNode.getBoundingClientRect()
    const pixelsPerButton = isMobile.value ? 45 : 35
    const x = endNodeRect.right - pixelsPerButton * document.querySelectorAll('.floatSelectedOperationPannelButtons button').length
    floatSelectedOperationPannel.value.x = Math.max(x, 10)
    floatSelectedOperationPannel.value.y = endNodeRect.bottom + 2
}



const floatSelectedOperationPannel = ref({
    visible: false,
    improveInputText: "",
    improveInputVisible: false,
    x: 0,
    y: 0,
})

const floatSelectedOperationPannelRef = ref(null)
closeFloatPannelMeta(floatSelectedOperationPannelRef, () => {
    // On mobile devices it disappears immediately after clicking, rendering the tool tips position invalid.
    setTimeout(() => {
        floatSelectedOperationPannel.value.improveInputVisible = false
    }, 10)
})

function improveSelectedText() {
    const selectedText = selectedTokens.value.map(token => token.delta.content).join("")
    console.log('improveSelectedText', floatSelectedOperationPannel.value.improveInputText, selectedText)
    floatSelectedOperationPannel.value.improveInputVisible = false
}

function createSpanInPatchSpanHTML(textContent) {
    const span = document.createElement('span')
    span.className = 'spanInPatchSpan'  // .spanInPatchSpan CSS not work?
    span.textContent = textContent
    span.style['color'] = "rgb(180,180,180)"
    span.style['size'] = "small"
    span.style['user-select'] = "none"
    span.style['-webkit-user-select'] = "none"  // for safari
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

const patchs = computed(() => {
    const assistentResponseContentAll = tokens.value.map((token) => token.delta.content).join("");
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
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

function handleLogprobItemClick(event, token, logprobItem) {
    if (event.altKey) {
        var content = logprobItem.token
        navigator.clipboard.writeText(content).then(() => {
            ElMessage.success(`Copied "${content}" to clipboard`)
        })
    } else {
        operationCenter.continueWithChosen(token, logprobItem);
    }
}

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
    floatPatchPannel.value.x = cellRect.left - 3
    floatPatchPannel.value.y = cellRect.bottom - 4
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
    // keep floatPatchPannel on， don't know why need setTimeout
    setTimeout(() => {
        activatePatch.value = patch
        floatPatchPannel.value.waitingToHide = false;
        floatPatchPannel.value.visible = true;
    }, 20)

    const cellRect = event.target.getBoundingClientRect();
    floatInputPatch.value.attachedPatch = patch

    floatInputPatch.value.x = cellRect.left - 3
    floatInputPatch.value.y = cellRect.top - 5
    floatInputPatch.value.visible = true;
    setTimeout(() => {
        document.querySelector('.floatInputPatchInput').value = patch?.patch;
        document.querySelector('.floatInputPatchInput').focus()
    }, 2)

}

function handleReactiveFunctions() {
    setFloatPatchPannelBelow()
    setFloatSelectedOperationPannelBelow()
}

// register handleReactiveFunctions to handleScrollDivFunctions
const handleScrollDivFunctions = inject('handleScrollDivFunctions', [])
handleScrollDivFunctions.push(handleReactiveFunctions)

responseState.registerInResponseText({ closeFloatPatchPannel })

useEventListener(window, 'resize', handleReactiveFunctions)
useEventListener(window, 'scroll', handleReactiveFunctions)

</script>

<style scoped>
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

.PatchSpan {
    box-shadow: inset -1px 0 rgb(200, 200, 200);
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
</style>
