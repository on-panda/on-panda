# onPanda: on-Policy Alignment Data Annotator
Scaling up your data efficiency before scaling up your data.


**onPanda**(**on**-**P**olicy **a**lig**n**ment **d**ata **a**nnotator) is a data annotation tool, or solution, for LLM alignment data(both SFT and RL). By combining the characteristics of front-end engineering and GPT models, annotators can efficiently generate SFT responses with the model's aid, while also producing on-policy token-level preference data.

## Custom module configuration

You can inject deployment-specific custom logic at build time by pointing Vite to a custom module. The app loads it via `import('./utils/defaultCustom.js')`, and Vite resolves `./utils/defaultCustom.js` to the path from env. Each build target uses its own env key (all read from the repo root `.env.local`):

- `WEB_IMPORT_CUSTOM_CODE` for `apps/on-panda-web`
- `CORE_IMPORT_CUSTOM_CODE` for `packages/on-panda-core`
- `MAIN_IMPORT_CUSTOM_CODE` for the root build

Example `.env.local`:

```dotenv
WEB_IMPORT_CUSTOM_CODE=src/assets/secret/custom.js
```

If the variable is not set, the build falls back to `src/utils/defaultCustom.js` (no-op).
