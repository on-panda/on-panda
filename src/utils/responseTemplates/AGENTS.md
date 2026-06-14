# Response Template Notes

## Core Contract

- `buildResponseTemplate({ apiConfig } = {})` is the public entry. Match only `apiConfig.response_template`.
- If no registered template matches, use `DefaultResponseTemplate`.
- A template owns two directions:
  - `apply(message)` converts an assistant message into `{ templatedPrompt, keyPathPromptMapping }`.
  - `parse(tokens)` converts streamed/generated tokens back into an assistant message.
- `responseTemplateType === "plain_text"` means the request/visual token stream is the model's literal response text, including special tokens.
- Keep persisted dialogs structured: `{ reasoning, content, tool_calls, finish_reason }`. Do not store raw template text such as `<think>...</think>` as `message.content`.
- A role-only model message is valid continuation prefill. Do not remove it in shared message assembly.
- If there is no meaningful role or text signal, the template parser should return `{}`. If role-only is a real protocol signal, preserve it.

## Plain Text Templates

- Plain-text continuation should send only one final assistant message with `content` from `responseTemplate.apply(message).templatedPrompt`.
- Let each template infer partial output from `finish_reason`: `stop` and `tool_calls` are complete, other values or missing values are partial.
- `finish_reason: "reasoning_end"` means the reasoning/thinking channel emitted its closing special token, but the assistant response is still partial.
- Do not include `reasoning`, `reasoning_content`, or `tool_calls` keys in the continuation request message.
- `buildViewTokens()` should render plain-text templates from `apply(message)` and append the finish reason token for display.

## Parser Rules

- Partial parsing is expected. Return the best stable structured message for incomplete output instead of waiting for every closing marker.
- If `finish_reason === "stop"` and parsed `tool_calls` exist, coerce it to `finish_reason: "tool_calls"`.
- If a structured delta switches from content-prefill to reasoning, move the old content into reasoning. Some servers resume a plain-text continuation by streaming reasoning deltas.
- Register model families by matching `response_template.name_or_path`, such as `/^moonshotai\/kimi-k2/i` for Kimi K2.x models.
- For reasoning models, do not output empty `<think></think>` when `message.reasoning` is absent.
- Reasoning-model continuation should preferably start with a special token such as `<think>`.
- Render `finish_reason: "reasoning_end"` as a closing special token such as `</think>` after reasoning.
- Keep the registry explicit in `responseTemplates/index.js`.
- For plain-text continuation requests, inspect the final request message: it should have `role` and `content`, but no `reasoning` or `tool_calls` fields.
- Mixed streams can exist: token `delta.content` may contain `<think>...`, followed in continuation by `delta.reasoning` and `delta.tool_calls`.
