import MarkdownIt from 'markdown-it'
import mdKatex from '@ryanxcharles/markdown-it-katex'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'
import 'katex/dist/katex.css'

export const markdown = MarkdownIt({
  html: false,
  breaks: true,
  langPrefix: 'hljs language-',
  highlight: (code, lang) => {
    const language = hljs.getLanguage(lang) ? lang : 'plaintext'
    return hljs.highlight(code, { language }).value
  }
}).use(mdKatex)

