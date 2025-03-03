import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'
import App from './App.vue'
import { i18n } from './i18n'

const pinia = createPinia()
const app = createApp(App)

// 根据当前语言设置 Element Plus 的语言
const locale = localStorage.getItem('locale') || 'en-US'
app.use(ElementPlus, {
  locale: locale === 'zh-CN' ? zhCn : en
})

app.use(pinia)
app.use(i18n)
app.mount('#app')
