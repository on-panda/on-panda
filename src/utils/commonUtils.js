
export function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj))
}

export async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

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


export async function convertImageUrlToBase64(imageUrl, fetchCall) {
  fetchCall = fetchCall || fetch // Use the default fetch if not provided
  try {
    // Fetch the image as a Blob
    const response = await fetchCall(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    const blob = await response.blob();

    // Get the image type (e.g., image/jpeg, image/png)
    const contentType = blob.type || "image/jpeg";

    // Convert the Blob to Base64
    const base64Image = await blobToBase64(blob);

    // Construct the JSON object
    return `data:${contentType};base64,${base64Image}`
  } catch (error) {
    console.error("Error converting image to Base64 JSON:", error);
    throw error;
  }
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]); // Extract Base64 part
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export const registerKeyActions = (keyActions) => {  // : { [key: string]: () => void }
  const handleKeyDown = (event) => { // : KeyboardEvent
    const isCtrl = event.ctrlKey || event.metaKey
    const eventKey = (isCtrl ? "Ctrl+" : "") + event.key
    // console.log(eventKey)
    if (eventKey in keyActions) {
      const target = event.target // as HTMLElement
      // 判断是否在编辑区域内，按下了 ctrl 就不用管编辑区了
      const notEditable = isCtrl ? true : (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && !target.isContentEditable)
      if (notEditable) {
        // console.log("keyActions:", eventKey, keyActions[eventKey].name)
        event.preventDefault()
        keyActions[eventKey]()
      }
    }
  }
  useEventListener(document, 'keydown', handleKeyDown)
  return handleKeyDown
}
