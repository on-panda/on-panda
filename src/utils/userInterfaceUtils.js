import { ref, onMounted } from 'vue';
import { useEventListener } from '@/utils/commonUtils.js'

export function useScrollSwitchSync(scrollDiv) {
    /* Usage:
    <el-switch
        v-model="scrollSwitch.isSwitched.value"
        inline-prompt
        active-text="Y"
        inactive-text="N"
        @change="scrollSwitch.scrollToPosition"
    />
  
    const scrollDiv = ref(null);
    const scrollSwitch = useScrollSwitchSync(scrollDiv); // { isSwitched, scrollToPosition }
    */
    const isSwitched = ref(true);

    // 滚动到相应位置
    const scrollToPosition = () => {
        // 移除滚动事件监听，避免触发 syncSwitchWithScroll
        scrollDiv.value.removeEventListener('scroll', syncSwitchWithScroll);

        // 滚动到对应位置
        scrollDiv.value.scrollTo({
            left: isSwitched.value ? 0 : scrollDiv.value.scrollWidth,
            behavior: 'smooth'
        });

        // 滚动结束后再添加监听
        scrollDiv.value.addEventListener('scroll', syncSwitchWithScroll, { passive: true });
    };

    // 同步 Switch 和滚动位置
    const syncSwitchWithScroll = () => {
        const maxScrollLeft = scrollDiv.value.scrollWidth - scrollDiv.value.clientWidth;
        isSwitched.value = scrollDiv.value.scrollLeft <= maxScrollLeft / 2;
    };

    // 初始挂载时设置滚动位置
    onMounted(() => {
        scrollDiv.value.addEventListener('scroll', syncSwitchWithScroll, { passive: true });
        scrollToPosition();
    });

    return { isSwitched, scrollToPosition };
}

export function useSelectedNodes(containerRef) {
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