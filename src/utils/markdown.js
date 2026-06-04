import MarkdownIt from 'markdown-it'
import { katex } from '@mdit/plugin-katex'
import markdownItCodeCopy from 'markdown-it-code-copy'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'
import 'katex/dist/katex.css'
import { i18n } from '../i18n/index.js'

// for fancy copy button
const copyFeedbackTimers = new WeakMap()

const resetCopyButtonLabel = (button) => {
  if (!button) {
    return
  }
  const span = button.querySelector('span')
  if (span) {
    span.textContent = i18n.global.t('common.copy')
  }
  button.dataset.copyFeedback = ''
  copyFeedbackTimers.delete(button)
}

const showCopyFeedback = (button, message) => {
  if (!button) {
    return
  }
  const span = button.querySelector('span')
  if (copyFeedbackTimers.has(button)) {
    clearTimeout(copyFeedbackTimers.get(button))
  }
  button.dataset.copyFeedback = 'active'
  if (span) {
    span.textContent = message
  }
  const timeoutId = setTimeout(() => resetCopyButtonLabel(button), 1500)
  copyFeedbackTimers.set(button, timeoutId)
}

export const markdown = MarkdownIt({
  html: false,
  breaks: true,
  langPrefix: 'hljs language-',
  highlight: (code, lang) => {
    const language = hljs.getLanguage(lang) ? lang : 'plaintext'
    return hljs.highlight(code, { language }).value
  }
}).use(katex, {
  delimiters: 'all'
}).use(markdownItCodeCopy, {
  buttonStyle: '',
  iconStyle: '',
  iconClass: '',
  element: '',
  onSuccess: ({ trigger }) => {
    showCopyFeedback(trigger, i18n.global.t('userMessages.copied'))
  },
  onError: ({ trigger }) => {
    showCopyFeedback(trigger, i18n.global.t('userMessages.copyFailed'))
  }
}).disable('escape')
