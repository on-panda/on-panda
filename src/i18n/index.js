import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN.js'
import enUS from './locales/en-US.js'

const messages = {
  'zh-CN': zhCN,
  'en-US': enUS
}

export const i18n = createI18n({
  legacy: false,
  locale: globalThis.localStorage?.getItem('locale') || globalThis.navigator?.language || 'en-US',
  fallbackLocale: 'en-US',
  warnHtmlInMessage: 'off',
  messages
})
