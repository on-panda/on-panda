# onPanda integration examples
This app demonstrates the public component API of onPanda

## Run the examples

```bash
pnpm install
pnpm dev
```

Open the URL shown by Vite, usually `http://localhost:5173`.


## Component integration
The example components are:
- `OnPandaWeb` as a complete web application.
- `ResponseStateClosure` with `OnPandaResponseText` and `OnPandaResponsePanel`.
- `DialogWithControlStateClosure` with `OnPandaDialogWithControl`.


Install the package and its Vue integration dependencies in your own app:

```bash
pnpm add @on-panda/on-panda vue pinia vue-i18n element-plus
```

Install the plugin once when creating the app:

```js
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { onPandaPlugin } from '@on-panda/on-panda'
import '@on-panda/on-panda/style.css'

const app = createApp(App)
app.use(createPinia())
app.use(onPandaPlugin)
app.mount('#app')
```

### Complete application

`OnPandaWeb` owns the dialog and control state for a complete onPanda UI:

```vue
<OnPandaWeb
  :apiConfigs="apiConfigs"
  :modelNameTags="{ 'on-panda': 'tiny-model-for-api-test' }"
/>
```

`apiConfigs` is an array of OpenAI-compatible endpoint configurations. A configured `chat_config.model` avoids a model-list request:

```js
const apiConfigs = [{
  endpoint_name: 'public-test',
  client_config: {
    base_url: 'https://vllm-test-api.diyer22.com/v1',
    api_key: 'null',
  },
  chat_config: {
    model: 'tiny-model-for-api-test',
    top_logprobs: 20,
  },
}]
```

### Response components

Use `ResponseStateClosure` when your app owns the messages and wants to render only a response:

```vue
<OnPandaResponseText :responseState="responseState" />
<OnPandaResponsePanel :responseState="responseState" />
```

```js
const responseState = ResponseStateClosure({ messages, apiConfig })
responseState.operationCenter.generateNew()
responseState.finalMessage.value
```

`messages` and `apiConfig` can be Vue refs. `finalMessage.value` contains the generated assistant message after the request completes.

### Dialog component with controls

Use `DialogWithControlStateClosure` when you want the dialog editor and onPanda controls without the `OnPandaWeb` wrapper:

```js
const dialogWithControlState = DialogWithControlStateClosure({
  apiConfigs,
  modelNameTags: { 'on-panda': 'tiny-model-for-api-test' },
})

dialogWithControlState.operationCenter.loadMessages(messages)
```

```vue
<OnPandaDialogWithControl
  :dialogWithControlState="dialogWithControlState"
/>
```

The runnable source for these snippets is in [`src`](./src).
