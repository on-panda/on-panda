<template>
    <p ref="onPandaResponseTextRef" class="OnPandaResponseText onPandaContainers"
        style="white-space: pre-wrap;cursor: default;">
        <span class="PatchSpan" v-for="patch in patchs"
            :key="`t${pandaState.uuid.value}-d${pandaState.currentDialogKey.value}-p${patch.index}:${patch.patch}`"
            :style='{
                "border-bottom": "3px solid " + probToColor(patch.prob),
                ...(patch.tokens.some(t => t.bifurcationPoint) ? { "background-color": "#e99" } : {}),
                ...(patch.tokens.some(t => t.pruned) ? { "text-decoration": "line-through", "color": "#777" } : {}),
                ...(patch.tokens.some(t => t.selected) ? { "background-color": "#3064ce", "color": "#fff" } : {}),
                ...(patch.tokens.some(t => t.isReasoningContent) ? { "color": "#666" } : {}),
                // ...(patch.tokens.some(t => t.isReasoningContent) ? { "text-decoration": "underline dotted #999" } : {}),
                // ...(patch.tokens.some(t => t.isReasoningContent) ? { "background": "linear-gradient(to bottom, transparent 85%, #09f5 85%)" } : {}),
                ...(patch.tokens.some(t => t.modifiedByEditSelection) ? { "border-bottom": "3px solid #09f" } : {}),
            }' :patch-index="patch.index" v-html="patchToSpanHTML(patch)" @mouseenter="handleMouseEnterPatchSpan"
            @mouseleave="handleMouseLeavePatchSpan" @mousedown="handleMouseDownPatchSpan($event, patch)"
            @dblclick.prevent="setFloatInputPatch($event, patch)">
        </span>
        <el-tooltip
            v-if="apiConfig.support_continue_final_message && tokens.length && tokens[tokens.length - 1].finish_reason == 'length'"
            content="native continue generating" placement="bottom">
            <el-button :icon="DArrowRight" size="small" @click="operationCenter.continueGenerating()"
                style="margin-left: 10px;height: 16px" />
        </el-tooltip>
    </p>

    <div @mouseover="floatPatchPanel.waitingToHide = false" @mouseleave="floatPatchPanel.waitingToHide = true"
        ref="floatPatchPanelRef"
        style="position: fixed; padding-top: 4px;background-color: rgba(200, 200, 200, 0.3); z-index: 10;" :style="{
            left: `${floatPatchPanel.x}px`,
            top: `${floatPatchPanel.y}px`,
        }" v-if="floatPatchPanel.visible">
        <!-- `padding-top: 4px` to avoid next line's token activate @mouseover  -->
        <div class="floatPatchPanel" style="position: relative;">
            <div v-for="token in activatePatch?.tokens?.filter(token => (token?.delta?.content !== undefined))"
                class="tokenPanel" style="vertical-align:top; display: inline-block; padding: 5px;padding-left: 0px;">
                <div class="floatPatchPanelHead" style="border-bottom: 2px solid #ccc;">
                    <span class="tokenSpan" v-html="escapeHTML(tokenToHtml(token?.delta?.content))" />
                </div>
                <div class="tokenLogprobItems">
                    <div v-for="logprobItem in (token?.logprobs?.content?.[0]?.top_logprobs || []).concat([{ finish_reason: 'stop' }])"
                        style="display: block; background-color: #eee; cursor:pointer"
                        @mousedown="(event) => handleLogprobItemClick(event, token, logprobItem)"
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
            <footer class="tokenPanel" style="min-height: 24px; padding: 5px;">
                <button :icon="Close" @click="closeFloatPatchPanel"
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
    <div v-show="!floatInputPatch.visible">
        <SelectedTextPannel :selectedTextState="selectedTextState" :operationCenter="operationCenter" />
    </div>
</template>

<script setup>

import { ref, computed, watch, inject } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'

import { useGlobalStore } from '../stores/globalStore.js'
import { useEventListener, closeFloatPanelMeta, copyToClipboard, escapeHTML } from '../utils/commonUtils.js'
import { probOfToken } from '../utils/chatUtils.js'
import { probToColor } from '../utils/userInterfaceUtils.js'
import { SelectedTextStateClosure } from '../stores/SelectedTextState.js'

import SelectedTextPannel from './SelectedTextPannel.vue'
import { DArrowRight, Close } from '@element-plus/icons-vue'

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

function createSpanInPatchSpanHTML(textContent) {
    const span = document.createElement('span')
    span.className = 'spanInPatchSpan'  // .spanInPatchSpan CSS not work?
    span.textContent = textContent
    span.style['color'] = "rgb(180,180,180)"
    span.style['fontSize'] = "small"
    span.style['user-select'] = "none"
    span.style['-webkit-user-select'] = "none"  // for safari
    span.style['margin-left'] = "10px"
    // inline-block to prevent text-decoration: line-through from parent node
    span.style['display'] = "inline-block"
    span.style['text-decoration'] = "none"
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
    const assistantResponseContentAll = tokens.value.map((token) => token.delta.content).join("");
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
    const visableSegments = Array.from(segmenter.segment(assistantResponseContentAll));
    // add a empty segment at the end for EOT token
    Array.from({ length: 4 }, () => visableSegments.push({ segment: "" }));

    const patchs = []
    let segmentIndex = 0
    let currentSegmentString = visableSegments[segmentIndex]?.segment ?? ""
    let tokenToSegmentString = ""
    let tokenStartIndex = 0

    tokens.value.forEach((token, tokenIndex) => {
        const tokenContent = token.delta?.content || ""
        tokenToSegmentString += tokenContent

        while (
            segmentIndex < visableSegments.length - 1 &&
            tokenToSegmentString.length > currentSegmentString.length
        ) {
            segmentIndex += 1
            currentSegmentString += visableSegments[segmentIndex].segment
        }

        if (tokenToSegmentString === currentSegmentString) {
            const patchTokens = tokens.value.slice(tokenStartIndex, tokenIndex + 1)
            patchs.push({
                patch: currentSegmentString,
                tokens: patchTokens,
                prob: patchTokens.reduce((acc, currentToken) => acc * probOfToken(currentToken), 1),
                index: patchs.length,
            })
            tokenStartIndex = tokenIndex + 1
            tokenToSegmentString = ""
            segmentIndex += 1
            currentSegmentString = visableSegments[segmentIndex]?.segment ?? ""
        } else if (
            currentSegmentString &&
            !currentSegmentString.startsWith(tokenToSegmentString)
        ) {
            const patchTokens = tokens.value.slice(tokenStartIndex, tokenIndex + 1)
            patchs.push({
                patch: tokenToSegmentString,
                tokens: patchTokens,
                prob: patchTokens.reduce((acc, currentToken) => acc * probOfToken(currentToken), 1),
                index: patchs.length,
            })
            tokenStartIndex = tokenIndex + 1
            tokenToSegmentString = ""
            segmentIndex += 1
            currentSegmentString = visableSegments[segmentIndex]?.segment ?? ""
        }
    })

    return patchs
});

const selectedTextState = SelectedTextStateClosure({
    onPandaResponseTextRef,
    patchs,
    tokens,
    isMobile,
})


const handleMouseEnterPatchSpan = (event) => {
    if (event.buttons === 1) {
        return // If left mouse button is pressed, don't open panel
    }

    const patchIndex = event.target.attributes["patch-index"].value
    const patch = patchs.value[parseInt(patchIndex)]

    event.target.classList.add('ActivatePatchSpan')
    patch.target = event.target
    activatePatch.value = patch
    if (isMobile.value) {
        // Prevents false touches due to web size changes
        setTimeout(() => setFloatPatchPanelBelow(event.target), 1)
    } else {
        setFloatPatchPanelBelow(event.target)
    }
}

function handleMouseLeavePatchSpan(event) {
    // console.log(event)
    floatPatchPanel.value.waitingToHide = true
    setTimeout(() => {
        if (floatPatchPanel.value.waitingToHide) {
            closeFloatPatchPanel()
        }
    }, 300);
}

function isEventForCopy(event) {
    // if the event is triggered with the Alt key or middle mouse button, copy the text
    return event.altKey || event.button == 1;
}

function handleMouseDownPatchSpan(event, patch) {
    if (isEventForCopy(event)) {
        var content = patch.patch
        copyToClipboard(content).then(() => {
            ElMessage.success(`Copied "${content}" to clipboard`)
        })
    }
}

function closeFloatPatchPanel() {
    floatPatchPanel.value.visible = false;
    floatPatchPanel.value.waitingToHide = false;
    activatePatch.value = {}
}

function handleLogprobItemClick(event, token, logprobItem) {
    if (isEventForCopy(event)) {
        var content = logprobItem.token
        copyToClipboard(content).then(() => {
            ElMessage.success(`Copied "${content}" to clipboard`)
        })
    } else {
        operationCenter.continueWithChosen(token, logprobItem);
    }
}

// floatPatchPanel
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


const floatPatchPanel = ref({
    visible: false,
    waitingToHide: false,
    x: 0,
    y: 0,
})

const floatPatchPanelRef = ref(null)


// exceptTouch=true to avoide touch device close floatPatchPanel by click on another patchSpan
closeFloatPanelMeta(floatPatchPanelRef, closeFloatPatchPanel, true, true)

watch(activatePatch, function watchActivatePatch(newValue, oldValue) {
    activateLogprobItem.value = {}
    oldValue.target?.classList.remove('ActivatePatchSpan')
});

function setFloatPatchPanelBelow(element) {
    element = element || document.querySelector('.ActivatePatchSpan')
    if (!element) {
        return
    }
    const cellRect = element.getBoundingClientRect();
    floatPatchPanel.value.x = cellRect.left - 3
    floatPatchPanel.value.y = cellRect.bottom - 4
    if (floatPatchPanel.value.x + 120 > window.innerWidth) {
        // avoid floatPatchPanel out of window
        floatPatchPanel.value.x = floatPatchPanel.value.x - 85
    }
    floatPatchPanel.value.waitingToHide = false;
    floatPatchPanel.value.visible = true;
}


const floatInputPatch = ref({
    visible: false,
    attachedPatch: undefined,
    x: 0,
    y: 0,
})

const floatInputPatchRef = ref(null)

closeFloatPanelMeta(floatInputPatchRef, () => {
    floatInputPatch.value.visible = false
})

function setFloatInputPatch(event, patch) {
    // keep floatPatchPanel on， don't know why need setTimeout
    setTimeout(() => {
        activatePatch.value = patch
        floatPatchPanel.value.waitingToHide = false;
        floatPatchPanel.value.visible = true;
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
    setFloatPatchPanelBelow()
    selectedTextState.setFloatSelectedOperationPanelBelow()
}

// register handleReactiveFunctions to handleScrollDivFunctions
const handleScrollDivFunctions = inject('handleScrollDivFunctions', [])
handleScrollDivFunctions.push(handleReactiveFunctions)

responseState.registerInResponseText({ closeFloatPatchPanel })

useEventListener(window, 'resize', handleReactiveFunctions)
useEventListener(window, 'scroll', handleReactiveFunctions)

</script>

<style scoped>
.floatPatchPanelHead .tokenLogprobItems {
    display: block;
}

.tokenPanel {
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
