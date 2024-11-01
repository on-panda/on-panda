export const escapeHTML = (s) => {
  return s
    .replaceAll(/&/g, '&amp;')
    .replaceAll(/</g, '&lt;')
    .replaceAll(/>/g, '&gt;')
    .replaceAll(/"/g, '&quot;')
    .replaceAll(/'/g, '&#39;')
}


import { onMounted, onUnmounted } from 'vue'

export function useEventListener(target, event, callback) {
  onMounted(() => target.addEventListener(event, callback))
  onUnmounted(() => target.removeEventListener(event, callback))
}


export function closeFloatPannelMeta(refElement, closeFunction, usingEscapeKey = true) {
  function handleKeyDown(event) {
    if (usingEscapeKey && event.key === 'Escape') {
      closeFunction()
    }
  }
  useEventListener(window, 'keydown', handleKeyDown)
  function handleMouseClick(event) {
    if (refElement.value && !refElement.value.contains(event.target)) {
      closeFunction()
    }
  }
  useEventListener(window, 'click', handleMouseClick)
}