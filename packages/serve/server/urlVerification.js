export function verifyUrlIsLlmApiCall(url) {
  // check is LLM api call by /models or /completions
  return /(^|\/)(models|completions|messages)(\/|$)/.test(url.pathname)
}

export function verifyUrlIsMcp(url) {
  return /(^|\/)mcp(\/|$)/.test(url.pathname)
}
