import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from '../../src/App.vue'
import onPandaPlugin from '../../src/index.js'
import 'element-plus/dist/index.css'

const app = createApp(App)
const pinia = createPinia()

// 使用onPandaPlugin安装所有组件和插件
app.use(onPandaPlugin)
app.use(pinia)

app.mount('#app')
