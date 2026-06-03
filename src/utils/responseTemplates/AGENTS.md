# Response Template Notes

## Core Contract

- `buildResponseTemplate({ apiConfig } = {})` is the public entry. Match only `apiConfig.response_template`; do not fall back to `chat_config.model` unless the product decision changes.
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
- Do not include `reasoning`, `reasoning_content`, or `tool_calls` keys in the continuation request message.
- `buildViewTokens()` should render plain-text templates from `apply(message)` and append the finish reason token for display.
- For plain-text templates, trust explicit `finish_reason`; do not infer `tool_calls` purely from `message.tool_calls`.

## Parser Rules

- Prefer a small parser that matches the template grammar over a generic configurable mini-language until there are multiple real templates to justify it.
- Partial parsing is expected. Return the best stable structured message for incomplete output instead of waiting for every closing marker.
- Empty template text should not create a fake assistant turn. Preserve role-only messages only when the protocol makes that role meaningful.
- Preserve tool-call argument text exactly. It is JSON text, not an object to normalize.
- If `finish_reason === "stop"` and parsed `tool_calls` exist, coerce it to `finish_reason: "tool_calls"`.
- Mixed streams are real: a server may stream plain-text reasoning/content in `delta.content`, then structured `delta.tool_calls`. Normalize the plain-text prefix before persisting.
- If a structured delta switches from content-prefill to reasoning, move the old content into reasoning. Some servers resume a plain-text continuation by streaming reasoning deltas.

## Kimi K2

- Register Kimi by `response_template.name_or_path` matching `/^moonshotai\/kimi-k2/i`.
- Kimi `apply()` format:
  - optional `<think>{reasoning}</think>`
  - content
  - optional `<|tool_calls_section_begin|>...<|tool_calls_section_end|>`
- Do not output empty `<think></think>` when `message.reasoning` is absent.
- Tool-call ids use `functions.{name}:{index}`.
- Kimi reasoning continuation content must start with `<think>`. Do not depend on a server-side chat template to inject it.
- For a pure reasoning prefix with no content/tool calls yet, keep it open as `<think>{reasoning}`.
- Normalize repeated opening `<think>` markers in `apply()`; parser normalization is only a fallback.
- Kimi/vLLM continuation can return `<think>...</think>` in `delta.content` before structured tool calls. Parse that prefix back into `reasoning` and `content`.

## Registry And Bundling

- Keep the registry explicit in `responseTemplates/index.js`.
- Adding a new template currently means bundling its parser/apply code into the frontend. This is acceptable while templates are few and parser behavior is model-specific.
- Do not move local one-off parser logic into shared utils until there are at least two real reuse points.

## Debug Checklist

- After token-level continuation, switching away from the new dialog must not create another dialog.
- Compare `currentDialog.messages.at(-1)` and `dialogComputed.messages.at(-1)`: they should differ only by key order, not by raw template text vs structured fields.
- For plain-text continuation requests, inspect the final request message: it should have `role`, `content`, and maybe `partial`, but no `reasoning` or `tool_calls`.
- Test mixed streams with `delta.content` containing `<think>...</think>` plus later `delta.tool_calls`.
