import { fileURLToPath, URL } from 'node:url'
import { Readable } from 'node:stream'

import { defineConfig, loadEnv } from 'vite'
import path from 'node:path'
import vue from '@vitejs/plugin-vue'
import { ProxyAgent } from 'undici'
import { visualizer } from 'rollup-plugin-visualizer'

function verifyIsLlmApiCall(url) {
  // check is LLM api call by /models or /completions
  return /\/models|\/completions/.test(url);
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const envDir = path.resolve(__dirname, '../../')
  const env = loadEnv(mode, envDir, '')
  const defaultCustom = fileURLToPath(new URL('../../src/utils/defaultCustom.js', import.meta.url))
  const customModulePath = env.WEB_IMPORT_CUSTOM_CODE
  const resolvedCustomModule = customModulePath
    ? (path.isAbsolute(customModulePath) ? customModulePath : path.resolve(envDir, customModulePath))
    : defaultCustom
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
    name: 'using-server-proxy-middleware',
    configureServer(server) {
      server.middlewares.use('/using-server-proxy', createServerProxyMiddleware())
    },
    configurePreviewServer(server) {
      server.middlewares.use('/using-server-proxy', createServerProxyMiddleware())
    }
  }

  return {
    envDir,
    root: fileURLToPath(new URL('.', import.meta.url)),
    publicDir: fileURLToPath(new URL('../../public', import.meta.url)),  // 静态资源目录在根目录的 public/
    plugins: [
      vue(),
      usingServerProxyPlugin,
      mode === 'analyze' && visualizer({
        open: true,
        gzipSize: true,
        brotliSize: true,
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),  // @ 指向 src 目录
        '@custom': resolvedCustomModule,
      }
    },
    build: {
      outDir: fileURLToPath(new URL('./dist', import.meta.url)),
      emptyOutDir: true,
    },
    server: {
      proxy: {
        '/qwen-test': {
          target: 'http://113.44.140.251:12692',
          changeOrigin: true,
          rewrite: path => path.replace(/^\/qwen-test/, '/v1/')
        },
        '/bypass-CORS': {
          target: 'https://api.github.com/',
          changeOrigin: true,
          configure: (proxy, options) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              try {
                var url = new URL(req.url.replace(/^\/bypass-CORS\//, ''))
                if (!verifyIsLlmApiCall(url)) {
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
})
