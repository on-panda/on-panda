import prefixer from 'postcss-prefix-selector'

export default {
  plugins: [
    prefixer({
      prefix: '.onPandaContainers',
      // add prefix for KaTeX css
      includeFiles: [/katex[\\/](?:dist[\\/])?katex(?:\.min)?\.css$/],
      // keep :root/html/body etc. global selectors, not replace
      skipGlobalSelectors: true,
      // if you want to special handle selectors starting with html/body, you can do this:
      // transform(prefix, selector, prefixedSelector, filePath, rule) {
      //   if (/^(html|body)\b/.test(selector)) {
      //     return selector.replace(/^([^\s,>+~]+)/, `$1 ${prefix}`)
      //   }
      //   return prefixedSelector
      // },
    }),
  ],
}
