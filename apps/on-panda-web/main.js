import { createApp } from 'vue'
import { createPinia } from 'pinia'
import OnPandaWeb from '../../src/OnPandaWeb.vue'
import { onPandaPlugin } from '../../src/index.js'

const app = createApp(OnPandaWeb)
const pinia = createPinia()

// 使用onPandaPlugin安装所有组件和插件
app.use(onPandaPlugin)
app.use(pinia)

app.mount('#app')
