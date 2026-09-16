export function withSafeProxyMiddleware(proxyName, middleware) {
  return async (req, res) => {
    try {
      await middleware(req, res)
    } catch (error) {
      console.error(`${proxyName} crashed`, error)
      if (res.headersSent) {
        if (!res.writableEnded) {
          res.end()
        }
        return
      }
      res.statusCode = 500
      res.setHeader('content-type', 'text/plain')
      res.end(`Proxy error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}
