import { ref, computed } from 'vue'

import { closeFloatPanelMeta } from '../utils/commonUtils.js'
import { tokenToDisplayString } from '../utils/chatTemplateUtils.js'
import { useSelectedNodes } from '../utils/userInterfaceUtils.js'
import { useGlobalStore } from './globalStore.js'

export function SelectedTextStateClosure({
    onPandaResponseTextRef = null,
    patches = null,
    tokens = null,
} = {}) {
    const selectedNodes = useSelectedNodes(onPandaResponseTextRef);
    const globalStore = useGlobalStore();

    const floatSelectedOperationPanel = ref({
        visible: false,
        improveInputText: "",
        improveInputVisible: false,
        replacementInputVisible: false,
        x: 0,
        y: 0,
    })

    const floatSelectedOperationPanelRef = ref(null)
    closeFloatPanelMeta(floatSelectedOperationPanelRef, () => {
        // On mobile devices it disappears immediately after clicking, rendering the tool tips position invalid.
        setTimeout(() => {
            floatSelectedOperationPanel.value.improveInputVisible = false
            floatSelectedOperationPanel.value.replacementInputVisible = false
        }, 10)
    })

    function setFloatSelectedOperationPanelBelow() {
        var endNode = selectedNodes.value.endNode
        if (!endNode) {
            return
        }
        endNode = ('patch-index' in endNode.attributes) ? endNode : endNode.parentElement
        var endNodeRect = endNode.getBoundingClientRect()
        const pixelsPerButton = globalStore.isMobile ? 45 : 35
        const x = endNodeRect.right - pixelsPerButton * onPandaResponseTextRef.value.parentNode.querySelectorAll('.floatSelectedOperationPanelButtons button').length
        floatSelectedOperationPanel.value.x = Math.max(x, 10)
        floatSelectedOperationPanel.value.y = endNodeRect.bottom + 2
    }

    const selectedTokens = computed(() => {
        floatSelectedOperationPanel.value.visible = false
        if (!selectedNodes.value.startNode || !selectedNodes.value.endNode) {
            return [];
        }
        // avoid select the span-in-span patch
        var startNode = selectedNodes.value.startNode
        startNode = ('patch-index' in startNode.attributes) ? startNode : startNode.parentElement

        var endNode = selectedNodes.value.endNode
        endNode = ('patch-index' in endNode.attributes) ? endNode : endNode.parentElement

        //set FloatSelectedOperationPanel
        setFloatSelectedOperationPanelBelow()
        floatSelectedOperationPanel.value.visible = true

        const startPatchIndex = Number(startNode.attributes['patch-index'].value)
        const endPatchIndex = Number(endNode.attributes['patch-index'].value)

        const startTokenIndex = patches.value[startPatchIndex].tokens[0].tokenIndex
        const endPatch = patches.value[endPatchIndex]
        const endTokenIndex = endPatch.tokens[endPatch.tokens.length - 1].tokenIndex
        return tokens.value.slice(startTokenIndex, endTokenIndex + 1)
    });

    const selectedText = computed(() => {
        if (!selectedTokens.value.length) {
            return ""
        }
        return selectedTokens.value.map(token => tokenToDisplayString(token, tokens.value)).join("")
    })

    function improveSelectedText() {
        floatSelectedOperationPanel.value.improveInputVisible = false
    }

    return {
        selectedNodes,
        selectedTokens,
        selectedText,
        floatSelectedOperationPanel,
        floatSelectedOperationPanelRef,
        setFloatSelectedOperationPanelBelow,
        improveSelectedText,
    }
}
