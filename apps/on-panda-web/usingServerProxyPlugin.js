import { Readable } from 'node:stream'

import { ProxyAgent } from 'undici'

import { verifyUrlIsLlmApiCall } from '../../src/utils/chatUtils.js'

export function createUsingServerProxyPlugin() {
  const middleware = createServerProxyMiddleware()

  return {
    name: 'using-server-proxy-middleware',
    configureServer(server) {
      server.middlewares.use('/using-server-proxy', middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/using-server-proxy', middleware)
    }
  }
}

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
      if (!verifyUrlIsLlmApiCall(targetUrl)) {
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
        if (['content-encoding', 'content-length'].includes(key.toLowerCase())) {
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
