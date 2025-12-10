import { fileURLToPath, URL } from 'node:url'
import { Readable } from 'node:stream'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { ProxyAgent } from 'undici'

function verifyIsLlmApiCall(url) {
  // check is LLM api call by /models or /completions
  return /\/models|\/completions/.test(url);
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  function createServerProxyMiddleware() {
    return async (req, res) => {
      try {
        const rawPath = req.url || ''
        const withoutPrefix = rawPath.startsWith('/using-server-proxy/')
          ? rawPath.replace(/^\/using-server-proxy\//, '')
          : rawPath.replace(/^\/+/, '')
        const incomingPath = decodeURIComponent(withoutPrefix)
        const match = incomingPath.match(/^(?<proxy>[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/]+)\/(?<target>https?:\/\/.+)$/)
        if (!match || !match.groups) {
          res.statusCode = 400
          res.end('Invalid proxy request: expected /using-server-proxy/<proxy>/<target>')
          return
        }
        const { proxy: proxyUrl, target } = match.groups
        const targetUrl = new URL(target)
        if (!verifyIsLlmApiCall(targetUrl)) {
          throw new Error(`Not a valid LLM API call: ${targetUrl}`)
        }

        const method = req.method || 'GET'
        const hopByHopHeaders = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'transfer-encoding', 'upgrade', 'host'])
        const headers = new Headers()
        Object.entries(req.headers).forEach(([key, value]) => {
          if (!value || hopByHopHeaders.has(key.toLowerCase())) {
            return
          }
          const values = Array.isArray(value) ? value : [value]
          values.forEach(val => headers.append(key, val))
        })

        const fetchInit = {
          method,
          headers,
          dispatcher: new ProxyAgent(proxyUrl),
          compress: false
        }
        const hasBody = !['GET', 'HEAD'].includes(method.toUpperCase())
        if (hasBody) {
          fetchInit.body = req
          fetchInit.duplex = 'half'
        }

        // console.log(`Proxying request from ${req.url} to ${targetUrl} with agent proxy ${proxyUrl}`)
        const upstreamResponse = await fetch(targetUrl.toString(), fetchInit)
        res.statusCode = upstreamResponse.status
        res.setHeader('content-encoding', 'identity')
        upstreamResponse.headers.forEach((value, key) => {
          if (key.toLowerCase() === 'content-encoding') {
            return
          }
          res.setHeader(key, value)
        })
        if (!upstreamResponse.body) {
          res.end()
          return
        }
        const proxyStream = Readable.fromWeb(upstreamResponse.body)
        // Avoid crashing the preview/dev server if the upstream connection errors mid-stream.
        proxyStream.on('error', (err) => {
          console.error('Server proxy stream failed', err)
          if (!res.headersSent) {
            res.statusCode = 502
            res.setHeader('content-type', 'text/plain')
            res.end('Proxy stream error')
          } else {
            res.destroy(err)
          }
        })
        proxyStream.pipe(res)
      } catch (error) {
        console.error('Server proxy failed', error)
        if (!res.headersSent) {
          res.statusCode = 500
          res.setHeader('content-type', 'text/plain')
        }
        res.end(`Proxy error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }
  }

  const usingServerProxyPlugin = {
    // Forward request with proxy@server
    // setting URL example: `/using-server-proxy/http://127.0.0.1:1087/https://target.com/v1`
    name: 'using-server-proxy-middleware',
    configureServer(server) {
      server.middlewares.use('/using-server-proxy', createServerProxyMiddleware())
    },
    configurePreviewServer(server) {
      server.middlewares.use('/using-server-proxy', createServerProxyMiddleware())
    }
  }

  const config = {
    plugins: [
      vue(),
      usingServerProxyPlugin
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))  // Deprecated due to lack of support Joint Debugging with other package.
      }
    },
    build: {
      lib: {
        entry: 'src/index.js',
        name: 'OnPanda',
        fileName: (format) => `on-panda.${format}.js`
      },
      rollupOptions: {
        external: ['vue', 'pinia'],
        output: {
          globals: {
            vue: 'Vue',
            pinia: 'Pinia'
          }
        }
      }
    },
    server: {
      proxy: {
        '/qwen-test': {  // TODO: del if cloudflare tunnel is ready
          target: 'http://113.44.140.251:12692',
          changeOrigin: true,
          rewrite: path => path.replace(/^\/qwen-test/, '/v1/')
        },
        '/bypass-CORS': {
          target: 'https://api.github.com/',  // placeholder
          changeOrigin: true,
          configure: (proxy, options) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              try {
                // console.log('proxy:', proxy, proxy.options, req.url);
                var url = new URL(req.url.replace(/^\/bypass-CORS\//, ''))
                // console.log(proxy.options)
                // console.log('url:', url)
                if (!verifyIsLlmApiCall(url)) {
                  // raise error
                  throw new Error(`Not a valid LLM API call: ${url} that should match /models or /completions, not allowed using /bypass-CORS`);
                }
                proxy.options.target = url.origin;
                proxyReq.path = url.pathname
              } catch (e) {
                console.error(e)
              }
            });
          },
        },
        '/cast': {
          target: 'http://127.0.0.1:9200',
          changeOrigin: true,
          rewrite: path => path.replace(/^\/cast/, '/')
        },
        '/debug': {
          target: 'http://127.0.0.1:9201',
          changeOrigin: true,
          rewrite: path => path.replace(/^\/debug/, '/')
        },
        '/2debug': {
          target: 'http://127.0.0.1:9202',
          changeOrigin: true,
          rewrite: path => path.replace(/^\/2debug/, '/')
        }
      }
    }
  }
  if (mode == 'app') {
    config.build = {}
  }
  return config
})
