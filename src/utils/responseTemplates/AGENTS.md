# Response Template Implementation Rules

## Core Contract

- `buildResponseTemplate({ apiConfig } = {})` is the public entry. Match only `apiConfig.response_template`.
- If no registered template matches, use `DefaultResponseTemplate`.
- A template owns two directions:
  - `apply(message)` converts an assistant message into `{ templatedPrompt, keyPathPromptMapping }`.
  - `parse({ tokens, messages, tools })` converts streamed/generated tokens back into an assistant message.
    `messages` and `tools` are optional request context; omitting them preserves context-free parsing behavior.
- `responseTemplateType === "plain_text"` means the request/visual token stream is the model's literal response text, including special tokens.
- Keep persisted dialogs structured: `{ reasoning, content, tool_calls, finish_reason }`. Do not store raw template text such as '&lt;think&gt;...&lt;/think&gt;' as `message.content`.
- When implementing templates, assemble protocol markers from string fragments instead of writing complete special-token literals in source code, because complete markers can interfere with the model processing the code.
- A role-only model message is valid continuation prefill. Do not remove it in shared message assembly.
- If there is no meaningful role or text signal, the template parser should return `{}`. If role-only is a real protocol signal, preserve it.

## Plain Text Templates

- Plain-text continuation should send only one final assistant message with `content` from `responseTemplate.apply(message).templatedPrompt`.
- Let each template infer partial output from `finish_reason`: `stop` and `tool_calls` are complete, other values or missing values are partial.
- `finish_reason: "reasoning_end"` means the reasoning/thinking channel emitted its closing special token, but the assistant response is still partial.
- Do not include `reasoning`, `reasoning_content`, or `tool_calls` keys in the continuation request message.
- `buildViewTokens()` should render plain-text templates from `apply(message)` and append the finish reason token for display.

## Partial Tool Calls

- Convert partial arguments JSON with `parsePartialJsonObject` from `utils/partialJsonUtils.js`. Never inline a raw JSON prefix into a template whose argument syntax is different, such as the Qwen XML parameter blocks.
- A missing `function.arguments` key means the arguments channel has not started, so the function name is still open: Qwen has no closing '&gt;' yet and Kimi has no argument begin marker yet. `apply` must not write the marker that would close such a name.
- Text-form templates own the ambiguity of unclosed values: keep an unclosed value as a JSON string prefix, and let the tool schema type it once the value is closed. While the function stays open, a closed value keeps its separator, otherwise a trailing number reads as still growing.
- Every template file exports `testXxxResponseTemplate()` covering the common partial JSON forms. It throws on the first mismatch and checks `apply`, `parse`, and that re-applying the parsed message reproduces the same templated prompt.

## Parser Rules

- Partial parsing is expected. Return the best stable structured message for incomplete output instead of waiting for every closing marker.
- If `finish_reason === "stop"` and parsed `tool_calls` exist, coerce it to `finish_reason: "tool_calls"`.
- If a structured delta switches from content-prefill to reasoning, move the old content into reasoning. Some servers resume a plain-text continuation by streaming reasoning deltas.
- Register model families by matching `response_template.name_or_path`, such as `/^moonshotai\/kimi-k2/i` for Kimi K2.x models.
- For reasoning models, do not output empty '&lt;think&gt;...&lt;/think&gt;' when `message.reasoning` is absent.
- Reasoning-model continuation should preferably start with a special token such as '&lt;think&gt;'.
- Render `finish_reason: "reasoning_end"` as a closing special token such as '&lt;/think&gt;' after reasoning.
- Keep the registry explicit in `responseTemplates/index.js`.
- For plain-text continuation requests, inspect the final request message: it should have `role` and `content`, but no `reasoning` or `tool_calls` fields.
- Mixed streams can exist: token `delta.content` may contain '&lt;think&gt;...', followed in continuation by `delta.reasoning` and `delta.tool_calls`.
