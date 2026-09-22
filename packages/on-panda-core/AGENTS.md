
## Guidelines
**Frontend Guidelines**
- JavaScript Preferences
  - Do not add redundant fallbacks for fixed data structures. For example, use `tool.function.name` instead of `tool.function?.name || ''`.
  - For functions with multiple parameters, prefer object destructuring like `({a=1, b=2} = {})` over mixed parameters like `(a=1, {b=2, c=3} = {})`. Also, prefer named functions (e.g., `function xxx() {...}`) over anonymous ones so they have a name during debugging.
  - Prefer closures over classes.

**General Guidelines**
- Before starting, please review my new requirements, naming conventions, and architectural design. Check if they are reasonable and well-structured, if there are any issues, or if I missed any critical edge cases.
- Keep code changes to a minimum. Implementations should be concise, and the diff must be highly readable.
- When encountering unexpected behaviors or bugs, you must understand the root cause and fix it fundamentally.
  - If you truly cannot figure it out, just let me know. Never write band-aid fixes that only mask the symptoms without solving the root cause.
- If you encounter obvious, unexpected, and tricky issues during implementation:
  - Do not rush to solve them by writing code outside the scope of the original requirements and design.
  - Instead, investigate thoroughly and inform me. Let me make the final decision.
- Do not use defensive programming.
  - Avoid excessive fallbacks (e.g., too many `try-catch` blocks or conditional checks).
  - Do not over-defend against function arguments. You should assume the caller behaves correctly by default.
- Align your code style as closely as possible with the existing codebase. Preferences are as follows:
  - Interfaces/APIs should be concise, clear, and non-redundant. Before adding a new interface, carefully consider its necessity and design it well.
  - Think about whether there is a simpler solution that avoids adding a new interface altogether.
  - Unless it is a crucial API, avoid creating a new function if it only contains a single line of code.
  - Do not extract single-use helpers/wrappers into separate functions; inline them instead.
  - Do not move local business logic into `utils` unless there are at least 2 independent call sites genuinely reusing it within the current diff.
  - Do not introduce intermediate variables that merely act as aliases, unless they significantly improve semantic readability.
  - Prioritize keeping the existing call chain straightforward and readable. Do not make preemptive abstractions.
- If you are uncertain about anything, do not rush to implement it. Ask me first and let me decide.
- If you need to run a git commit, do not add yourself as a co-author.
- Be conservative when adding test cases. Only add them in critical areas or places prone to regressions.

