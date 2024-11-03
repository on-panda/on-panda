

export function toLegalVariableName(str) {
  const cleanedStr = str.replace(/[^a-zA-Z0-9_$]/g, '');
  return /^\d/.test(cleanedStr) ? '_' + cleanedStr : cleanedStr;
}

export function p(varName, obj) {
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

export const escapeHTML = (s) => {
  return s
    .replaceAll(/&/g, '&amp;')
    .replaceAll(/</g, '&lt;')
    .replaceAll(/>/g, '&gt;')
    .replaceAll(/"/g, '&quot;')
    .replaceAll(/'/g, '&#39;')
}


import { onMounted, onUnmounted } from 'vue'

export function useEventListener(target, event, callback, options) {
  onMounted(() => target.addEventListener(event, callback, options))
  onUnmounted(() => target.removeEventListener(event, callback))
}


export function closeFloatPannelMeta(refElement, closeFunction, usingEscapeKey = true, exceptTouch = false) {
  function handleKeyDown(event) {
    if (usingEscapeKey && event.key === 'Escape') {
      closeFunction()
    }
  }
  useEventListener(window, 'keydown', handleKeyDown)

  // Complex logic for compatibility
  var supportsPointerEvent = exceptTouch && window.PointerEvent !== undefined;
  supportsPointerEvent = supportsPointerEvent && ('ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0)
  function handleMouseClick(event) {
    if (refElement.value && !refElement.value.contains(event.target)) {
      // 如果支持 PointerEvent 且 exceptTouch 为 true，且 support touch 进一步判断 pointerType
      if (supportsPointerEvent) {
        // 只在 pointerType 为 'mouse' 时才触发 closeFunction
        if (event.pointerType === 'mouse') {
          closeFunction();
        }
      } else {
        // 如果不支持 PointerEvent, touch 或者 exceptTouch 为 false，则直接触发 closeFunction
        closeFunction();
      }
    }
  }
  useEventListener(window, supportsPointerEvent ? 'PointerEvent' : 'click', handleMouseClick)
}


import { ElMessage } from 'element-plus'

export async function copyToClipboard(string) {

  await navigator.clipboard.writeText(string)
  ElMessage({
    showClose: true,
    message: 'Copied to clipboard',
    type: 'success',
    duration: 2000,
  })
}
