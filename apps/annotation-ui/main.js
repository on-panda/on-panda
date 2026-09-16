import { createApp } from 'vue'
import { createPinia } from 'pinia'
import OnPandaAnnotate from '../../src/OnPandaAnnotate.vue'
import { onPandaPlugin } from '../../src/index.js'

window.isOnPandaWeb = true

const app = createApp(OnPandaAnnotate)
app.use(onPandaPlugin)
app.use(createPinia())
app.mount('#app')
