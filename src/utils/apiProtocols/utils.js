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
  const promptTokens = usage.prompt_tokens ?? usage.input_tokens
  const completionTokens = usage.completion_tokens ?? usage.output_tokens
  return {
    ...usage,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: usage.total_tokens ?? promptTokens + completionTokens,
  }
}
