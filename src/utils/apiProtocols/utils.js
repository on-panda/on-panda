import { hashObjectSHA256Base64 } from '../commonUtils.js'

export function hashMessageOutput({ reasoning, content, tool_calls }) {
  return hashObjectSHA256Base64({ reasoning, content, tool_calls })
}

// Sort each run of tool messages in the order of the tool calls of its preceding assistant messages,
// since some models (e.g. GPT by Responses, Gemini) match tool results by position.
// Tool call ids are only unique in one response, e.g. Gemini's "functions.<name>:<index>".
export function sortToolMessages(messages) {
  const runs = []
  for (const message of messages) {
    if (message.role === runs.at(-1)?.[0].role) {
      runs.at(-1).push(message)
    } else {
      runs.push([message])
    }
  }
  let order = new Map()
  return runs.flatMap(run => {
    if (run[0].role === 'assistant') {
      // Consecutive assistant messages are one response
      order = new Map(run.flatMap(message => message.tool_calls || []).map((toolCall, index) => [toolCall.id, index]))
    } else if (run[0].role === 'tool') {
      run.sort((a, b) => order.get(a.tool_call_id) - order.get(b.tool_call_id))
    }
    return run
  })
}

export async function retryWithSchedule(fn, schedule) {
  const startTime = Date.now()
  let lastError
  for (let attempt = 0; attempt <= schedule.length; attempt++) {
    if (attempt > 0) {
      const elapsed = Date.now() - startTime
      const target = schedule[attempt - 1]
      if (elapsed >= target) continue
      await new Promise(r => setTimeout(r, target - elapsed))
    }
    let response
    try {
      response = await fn()
    } catch (error) {
      lastError = error
      if (error.name === 'AbortError') throw error
      continue
    }
    if (response.ok) return response
    lastError = new Error(`Failed to fetch: ${response.statusText}\n${await response?.text()}`)
    if (response.status >= 400 && response.status < 500) throw lastError
  }
  throw lastError
}

export function mergeHeaders(headers, extraHeaders = {}) {
  for (const [extraHeaderName, value] of Object.entries(extraHeaders)) {
    const existingHeaderName = Object.keys(headers).find(headerName => headerName.toLowerCase() === extraHeaderName.toLowerCase())
    if (existingHeaderName) {
      delete headers[existingHeaderName]
    }
    headers[extraHeaderName] = value
  }
  return headers
}

export function omitNullRequestFields(requestBody) {
  return Object.fromEntries(Object.entries(requestBody).filter(([, value]) => value !== null))
}

export async function* parseSseJsonStream(response, { onJsonParseError = null } = {}) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder("utf-8")
  let buffer = ''
  let done = false
  while (!done) {
    const { value, done: readerDone } = await reader.read()
    done = readerDone
    buffer += decoder.decode(value, { stream: !readerDone })
    const events = buffer.split(/\r?\n\r?\n/)

    buffer = events.pop()
    for (const event of events) {
      const dataLines = event.split(/\r?\n/).filter(line => line.startsWith('data: '))
      if (!dataLines.length) {
        continue
      }
      const jsonData = dataLines.map(line => line.slice(6)).join('\n')
      if (jsonData.trim() !== "[DONE]") {
        try {
          yield JSON.parse(jsonData)
        } catch (error) {
          if (onJsonParseError) {
            onJsonParseError(error)
            continue
          }
          throw error
        }
      }
    }
  }
}

export function normalizeUsage(usage = {}) {
  // Anthropic input_tokens excludes the cache reads and writes, which prompt_tokens includes like OpenAI.
  const promptTokens = usage.prompt_tokens ?? usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0)
  const completionTokens = usage.completion_tokens ?? usage.output_tokens
  return {
    ...usage,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: usage.total_tokens ?? promptTokens + completionTokens,
  }
}
