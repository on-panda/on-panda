
export function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj))
}

export function deepEqual(obj1, obj2, visited = new Set()) {
  if (obj1 === obj2) {
    return true;
  }
  if (obj1 == null || typeof obj1 !== "object" ||
    obj2 == null || typeof obj2 !== "object") {
    return false;
  }
  if (visited.has(obj1) || visited.has(obj2)) {
    return false;
  }
  visited.add(obj1);
  visited.add(obj2);

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  if (keys1.length !== keys2.length) {
    return false;
  }
  const keys2Set = new Set(keys2);
  for (const key of keys1) {
    if (!keys2Set.has(key) || !deepEqual(obj1[key], obj2[key], visited)) {
      return false;
    }
  }
  visited.delete(obj1);
  visited.delete(obj2);
  return true;
}

export async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function toLegalVariableName(str) {
  const cleanedStr = str.replace(/[^a-zA-Z0-9_$]/g, '');
  return /^\d/.test(cleanedStr) ? '_' + cleanedStr : cleanedStr;
}

export function ObjctKeyToCamelCaseNaming(obj) {
  obj = JSON.parse(JSON.stringify(obj))
  for (var key in obj) {
    if (obj.hasOwnProperty(key)) {
      var newKey = key.replace(/_([a-z])/g, function (g) { return g[1].toUpperCase(); });
      if (key == 'base_url') {
        newKey = 'baseURL'
      }
      if (newKey !== key) {
        obj[newKey] = obj[key];
        delete obj[key];
      }
    }
  }
  return obj
}

export function buildMockObject(logPrefix) {
  function createProxy(path = logPrefix) {
    return new Proxy(function () { }, {
      apply(target, thisArg, args) {
        path && console.log(`${path}()`, args);
        return createProxy(path && `${path}()`);
      },
      get(target, prop) {
        if (prop === 'toString' || prop === Symbol.toPrimitive) {
          return () => path;
        }
        return createProxy(path && `${path}.${prop}`);
      },
      set(target, prop, value) {
        path && console.log(`${path}.${prop} = `, value);
        return true;
      }
    });
  }
  return createProxy();
}

export const mockObject = buildMockObject()

export function p(varName, obj) {
  if (obj === undefined) {
    obj = varName
    varName = 'd'
    // debug history
    window['ddd'] = window.dd
    window['dd'] = window.d
  }
  var legalVarName = toLegalVariableName(varName)
  window[legalVarName] = obj
  console.log(`"${varName + (legalVarName === varName ? '' : '(' + legalVarName + ')')}":`, obj)
  return obj
}

window.p = p

export function getUnicodeLength(str) {
  return Array.from(str).length;
}

export const escapeHTML = (s) => {
  return s
    .replaceAll(/&/g, '&amp;')
    .replaceAll(/</g, '&lt;')
    .replaceAll(/>/g, '&gt;')
    .replaceAll(/"/g, '&quot;')
    .replaceAll(/'/g, '&#39;')
}


export function dateStringNow(includeMilliseconds = false, timestamp = null) {
  const now = timestamp ? new Date(timestamp) : new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  var str = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`
  if (includeMilliseconds) {
    const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
    str += `.${milliseconds}`
  }
  return str
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

export function duplicateWindow(pandaState) {
  // dump pandaState to loaclStorage
  // and open a new window with the same url
  const stateJson = pandaState.dump(true)
  localStorage.setItem('pandaStateDumpedForDuplicateWindow', JSON.stringify({pandaState: stateJson}))
  window.open(window.location.href)
}

export function tryLoadDuplicateWindow(pandaState) {
  // pop pandaState from loaclStorage, then load it
  const stateJson = localStorage.getItem('pandaStateDumpedForDuplicateWindow')
  if (stateJson) {
    pandaState.load(JSON.parse(stateJson).pandaState)
    localStorage.removeItem('pandaStateDumpedForDuplicateWindow')
    return true
  }
  return false
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


export function base64ToBlob(base64String) {
  const byteString = atob(base64String.split(',')[1]);
  const mimeString = base64String.split(',')[0].split(':')[1].split(';')[0];

  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);

  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }

  const blob = new Blob([ab], { type: mimeString });
  return URL.createObjectURL(blob);
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


export async function hashObjectSHA256Base64(obj, sortKeys = true) {
  // Fixed key order => SHA-256 => Base64
  function canonicalize(obj) {
    if (Array.isArray(obj)) {
      return '[' + obj.map(canonicalize).join(',') + ']';
    } else if (obj && typeof obj === 'object') {
      const keys = Object.keys(obj).sort();
      return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
    } else {
      return JSON.stringify(obj);
    }
  }
  if (sortKeys) {
    var canonicalString = canonicalize(obj);
  } else {
    var canonicalString = JSON.stringify(obj);
  }
  const encoder = new TextEncoder();
  const data = encoder.encode(canonicalString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
}

export function downloadJsonFile(obj, filename) {
  filename = filename || (dateStringNow() + '.panda.json')
  const jsonString = JSON.stringify(obj, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename
  a.click();
  URL.revokeObjectURL(url)
  return filename
}


export async function uploadJsonFile() {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json';
  fileInput.style.display = 'none';

  document.body.appendChild(fileInput);

  const promise = await new Promise((resolve, reject) => {
    fileInput.onchange = () => {
      const file = fileInput.files[0];
      if (!file) {
        reject(new Error('No file selected'));
        document.body.removeChild(fileInput);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          resolve({ name: file.name, file, data, });
        } catch (error) {
          reject(new Error('Invalid JSON file'));
        } finally {
          document.body.removeChild(fileInput);
        }
      };
      reader.onerror = () => {
        reject(new Error('File reading failed'));
        document.body.removeChild(fileInput);
      };

      reader.readAsText(file);
    };

    fileInput.click();
  });

  return promise;
}


export class TaskQueue {
  constructor() {
    this.queue = []
    this.running = false
  }
  async addTask(task) {
    this.queue.push(task)
    if (!this.running) {
      this.running = true
      while (this.queue.length > 0) {
        const task = this.queue.shift()
        const result = task()
        if (result instanceof Promise) {
          await result
        }
      }
      this.running = false
    }
  }
}
