import { Readable } from 'node:stream'

import { verifyUrlIsLlmApiCall, verifyUrlIsMcp } from '../../src/utils/chatUtils.js'

export function createBypassCorsProxyPlugin() {
  const middleware = createBypassCorsProxyMiddleware()

  return {
    name: 'bypass-cors-proxy-middleware',
    configureServer(server) {
      server.middlewares.use('/bypass-CORS', middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/bypass-CORS', middleware)
    }
  }
}

function createBypassCorsProxyMiddleware() {
  return async (req, res) => {
    try {
      const rawPath = req.url || ''
      const withoutPrefix = rawPath.startsWith('/bypass-CORS/')
        ? rawPath.replace(/^\/bypass-CORS\//, '')
        : rawPath.replace(/^\/+/, '')
      const targetUrl = new URL(decodeURIComponent(withoutPrefix))
      if (!verifyUrlIsLlmApiCall(targetUrl) && !verifyUrlIsMcp(targetUrl)) {
        res.statusCode = 400
        res.end(`Not a valid LLM API call or MCP endpoint: ${targetUrl}`)
        return
      }

      const method = req.method || 'GET'
      const hopByHopHeaders = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'transfer-encoding', 'upgrade', 'host'])
      const headers = new Headers()
      const abortController = new AbortController()
      const abortUpstream = () => abortController.abort()
      req.on('aborted', abortUpstream)
      res.on('close', () => {
        if (!res.writableEnded) {
          abortUpstream()
        }
      })
      Object.entries(req.headers).forEach(([key, value]) => {
        if (!value || hopByHopHeaders.has(key.toLowerCase()) || key.toLowerCase() === 'accept-encoding') {
          return
        }
        const values = Array.isArray(value) ? value : [value]
        values.forEach(val => headers.append(key, val))
      })
      headers.set('accept-encoding', 'identity')

      const fetchInit = {
        method,
        headers,
        compress: false,
        signal: abortController.signal,
      }
      const hasBody = !['GET', 'HEAD'].includes(method.toUpperCase())
      if (hasBody) {
        fetchInit.body = req
        fetchInit.duplex = 'half'
      }

      const upstreamResponse = await fetch(targetUrl.toString(), fetchInit)
      res.statusCode = upstreamResponse.status
      const upstreamContentEncoding = upstreamResponse.headers.get('content-encoding')
      const shouldNormalizeContentEncoding = upstreamContentEncoding && upstreamContentEncoding.toLowerCase() !== 'identity'
      if (shouldNormalizeContentEncoding) {
        res.setHeader('content-encoding', 'identity')
      }
      upstreamResponse.headers.forEach((value, key) => {
        const lowerKey = key.toLowerCase()
        if (hopByHopHeaders.has(lowerKey)) {
          return
        }
        if (shouldNormalizeContentEncoding && ['content-encoding', 'content-length'].includes(lowerKey)) {
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
        if (abortController.signal.aborted) {
          return
        }
        console.error('Bypass CORS proxy stream failed', err)
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
      if (abortController.signal.aborted) {
        return
      }
      console.error('Bypass CORS proxy failed', error)
      if (!res.headersSent) {
        res.statusCode = 500
        res.setHeader('content-type', 'text/plain')
      }
      res.end(`Proxy error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}
