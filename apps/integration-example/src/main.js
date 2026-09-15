import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { onPandaPlugin } from '@on-panda/on-panda'
import '@on-panda/on-panda/style.css'

import App from './App.vue'

const app = createApp(App)
app.use(createPinia())
app.use(onPandaPlugin)
app.mount('#app')
