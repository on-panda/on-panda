import fs from 'node:fs/promises'

import JSON5 from 'json5'

const webConfigUrl = '/on-panda-web/web_config.json5'

export function createWebConfigPlugin(webConfigPath = '') {
  const middleware = createWebConfigMiddleware(webConfigPath)
  return {
    name: 'on-panda-web-config',
    configureServer(server) {
      server.middlewares.use(webConfigUrl, middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(webConfigUrl, middleware)
    },
  }
}

function createWebConfigMiddleware(webConfigPath) {
  return async (req, res) => {
    if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
      res.statusCode = 405
      res.end('Method Not Allowed')
      return
    }
    try {
      const config = webConfigPath ? JSON5.parse(await fs.readFile(webConfigPath, 'utf8')) : {}
      const body = JSON.stringify(config)
      res.statusCode = 200
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.setHeader('cache-control', 'no-store')
      res.setHeader('content-length', Buffer.byteLength(body))
      res.end(req.method === 'HEAD' ? undefined : body)
    } catch (error) {
      res.statusCode = error.code === 'ENOENT' ? 404 : 400
      res.setHeader('content-type', 'text/plain; charset=utf-8')
      res.end(error.message)
    }
  }
}
