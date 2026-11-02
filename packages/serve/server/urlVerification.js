export function verifyUrlIsLlmApiCall(url) {
  // check is LLM api call by /models, /completions, /messages or /responses
  return /(^|\/)(models|completions|messages|responses)(\/|$)/.test(url.pathname)
}

export function verifyUrlIsMcp(url) {
  return /(^|\/)mcp(\/|$)/.test(url.pathname)
}
