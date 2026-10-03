import { Readable } from 'node:stream'

import { withSafeProxyMiddleware } from './safeProxyMiddleware.js'
import { verifyUrlIsLlmApiCall, verifyUrlIsMcp } from './urlVerification.js'

export function createApiProxyPlugin(browserAgentProxyPath = '') {
  const apiProxyMiddleware = withSafeProxyMiddleware('API proxy', createApiProxyMiddleware({
    verifyUrl: targetUrl => verifyUrlIsLlmApiCall(targetUrl) || verifyUrlIsMcp(targetUrl),
  }))
  // Browser-agent proxy: forwards arbitrary URLs as a fallback for cors-internet.
  const browserAgentMiddleware = browserAgentProxyPath
    ? withSafeProxyMiddleware('Browser agent proxy', createApiProxyMiddleware())
    : null
  const register = (server) => {
    server.middlewares.use('/api-proxy', apiProxyMiddleware)
    // Legacy mount, so existing api configs pointing at '/bypass-CORS' keep working.
    server.middlewares.use('/bypass-CORS', apiProxyMiddleware)
    if (browserAgentMiddleware) server.middlewares.use(browserAgentProxyPath, browserAgentMiddleware)
  }

  return {
    name: 'api-proxy-middleware',
    configureServer: register,
    configurePreviewServer: register,
  }
}

function createApiProxyMiddleware({ verifyUrl } = {}) {
  return async (req, res) => {
    const abortController = new AbortController()
    try {
      // Connect already trimmed the mount prefix off req.url, e.g. '/https://api.example.com/v1/completions'.
      const targetUrl = new URL(decodeURIComponent(req.url.replace(/^\/+/, '')))
      if (verifyUrl && !verifyUrl(targetUrl)) {
        res.statusCode = 400
        res.end(`Not an allowed target URL: ${targetUrl}`)
        return
      }

      const method = req.method || 'GET'
      const hopByHopHeaders = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'transfer-encoding', 'upgrade', 'host'])
      const headers = new Headers()
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
        console.error('API proxy stream failed', err)
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
      console.error('API proxy failed', error)
      if (!res.headersSent) {
        res.statusCode = 500
        res.setHeader('content-type', 'text/plain')
      }
      res.end(`Proxy error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}
