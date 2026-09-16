import fs from 'node:fs'
import fsPromises from 'node:fs/promises'

export function createRuntimeImportPlugin(runtimeImportPath) {
  // For configurations that are included in `pnpm dev`/`preview` but not in git or the build.
  if (!runtimeImportPath) {
    return null
  }

  if (!fs.existsSync(runtimeImportPath)) {
    throw new Error(`VITE_ON_PANDA_WEB_RUNTIME_IMPORT file not found: ${runtimeImportPath}`)
  }

  return {
    name: 'on-panda-web-runtime-import',
    configureServer(server) {
      server.middlewares.use('/on-panda-web-runtime.js', createRuntimeFileMiddleware(runtimeImportPath))
    },
    configurePreviewServer(server) {
      server.middlewares.use('/on-panda-web-runtime.js', createRuntimeFileMiddleware(runtimeImportPath))
    }
  }
}

function createRuntimeFileMiddleware(filePath) {
  return async (req, res) => {
    if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
      res.statusCode = 405
      res.end('Method Not Allowed')
      return
    }
    try {
      const data = await fsPromises.readFile(filePath)
      res.statusCode = 200
      res.setHeader('content-type', 'text/javascript; charset=utf-8')
      if (req.method === 'HEAD') {
        res.end()
        return
      }
      res.end(data)
    } catch {
      res.statusCode = 404
      res.end('Not Found')
    }
  }
}
