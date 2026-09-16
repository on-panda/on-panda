#!/usr/bin/env node

import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSON5 from 'json5'

const packageDir = fileURLToPath(new URL('..', import.meta.url))
const defaultRootUrl = '/on-panda-annotate/'
const maxRequestBodyBytes = 1024 * 1024 * 1024

function parseArgs(args) {
  const options = {
    dir: process.cwd(),
    webConfig: '',
    port: 8000,
    projectName: '',
  }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--dir') {
      options.dir = args[++index]
    } else if (arg === '--web_config') {
      options.webConfig = args[++index]
    } else if (arg === '--port') {
      options.port = Number(args[++index])
    } else if (arg === '--project_name') {
      options.projectName = args[++index]
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: annotate [--web_config web_config.json5] [--dir .] [--port 8000] [--project_name name]')
      process.exit(0)
    }
  }
  return {
    ...options,
    dir: path.resolve(options.dir),
    webConfig: options.webConfig ? path.resolve(options.webConfig) : '',
  }
}

function jsonResponse(res, statusCode, data) {
  const body = JSON.stringify(data)
  res.statusCode = statusCode
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('content-length', Buffer.byteLength(body))
  res.end(body)
}

function requestErrorMessage(error) {
  if (error.code === 'ENOENT') {
    return 'File not found'
  }
  if (error.code === 'EACCES' || error.code === 'EPERM') {
    return 'Permission denied'
  }
  if (error.code === 'EISDIR') {
    return 'Expected a file'
  }
  return error.message
}

async function readRequestBody(req) {
  const contentLength = Number(req.headers['content-length'])
  if (Number.isFinite(contentLength) && contentLength > maxRequestBodyBytes) {
    req.resume()
    throw Object.assign(new Error('Request body is too large'), { statusCode: 413 })
  }
  const chunks = []
  let bodySize = 0
  for await (const chunk of req) {
    bodySize += chunk.length
    if (bodySize > maxRequestBodyBytes) {
      req.resume()
      throw Object.assign(new Error('Request body is too large'), { statusCode: 413 })
    }
    chunks.push(chunk)
  }
  if (!chunks.length) {
    return {}
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function pathForId(rootDir, id) {
  if (typeof id !== 'string' || !id || id.includes('\0') || path.posix.isAbsolute(id)) {
    throw new Error('Invalid panda json id')
  }
  const normalizedId = id.replaceAll('\\', '/')
  if (!/\.panda.*\.json$/.test(path.posix.basename(normalizedId))) {
    throw new Error('Invalid panda json id')
  }
  const filePath = path.resolve(rootDir, normalizedId)
  if (filePath !== rootDir && !filePath.startsWith(`${rootDir}${path.sep}`)) {
    throw new Error('Invalid panda json id')
  }
  return filePath
}

function isPathInside(rootDir, filePath) {
  return filePath === rootDir || filePath.startsWith(`${rootDir}${path.sep}`)
}

async function assertPathInside(rootDir, filePath, { allowMissing = false } = {}) {
  let probePath = filePath
  while (true) {
    try {
      const stat = await fs.lstat(probePath)
      if (stat.isSymbolicLink()) {
        throw new Error('Invalid panda json id')
      }
      if (probePath === filePath && !stat.isFile()) {
        throw Object.assign(new Error('Expected a file'), { code: 'EISDIR' })
      }
      const realPath = await fs.realpath(probePath)
      if (!isPathInside(rootDir, realPath)) {
        throw new Error('Invalid panda json id')
      }
      return
    } catch (error) {
      if (error.code !== 'ENOENT' || !allowMissing) {
        throw error
      }
      const parentPath = path.dirname(probePath)
      if (parentPath === probePath) {
        throw error
      }
      probePath = parentPath
    }
  }
}

function toId(rootDir, filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/')
}

async function collectJsonFiles(rootDir, currentDir = rootDir, result = []) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === 'panda_json_bin') {
      continue
    }
    const entryPath = path.join(currentDir, entry.name)
    if (entry.isDirectory()) {
      await collectJsonFiles(rootDir, entryPath, result)
    } else if (entry.isFile() && /\.panda.*\.json$/.test(entry.name)) {
      result.push({ id: toId(rootDir, entryPath) })
    }
  }
  return result
}

function backupPath(filePath, suffix = '') {
  const now = new Date()
  const pad = value => String(value).padStart(2, '0')
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}_${pad(now.getMinutes())}_${pad(now.getSeconds())}`
  const fileName = path.basename(filePath).replace(/\.json$/, `.t${timestamp}${suffix}.bin.panda.json`)
  return path.join(path.dirname(filePath), 'panda_json_bin', fileName)
}

async function moveToBackup(filePath) {
  let suffix = ''
  let targetPath = backupPath(filePath)
  while (true) {
    try {
      await fs.access(targetPath)
      suffix = suffix ? `.${Number(suffix.slice(1)) + 1}` : '.1'
      targetPath = backupPath(filePath, suffix)
    } catch (error) {
      if (error.code === 'ENOENT') {
        break
      }
      throw error
    }
  }
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  await fs.rename(filePath, targetPath)
}

async function readConfig(webConfig) {
  if (!webConfig) {
    return {}
  }
  return JSON5.parse(await fs.readFile(webConfig, 'utf8'))
}

async function readStaticFile(webRoot, requestPath, res) {
  const relativePath = requestPath.slice(defaultRootUrl.length) || 'index.html'
  const filePath = path.resolve(webRoot, relativePath)
  if (filePath !== webRoot && !filePath.startsWith(`${webRoot}${path.sep}`)) {
    return false
  }
  let file
  let servedPath = filePath
  try {
    file = await fs.readFile(filePath)
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
    servedPath = path.join(webRoot, 'index.html')
    file = await fs.readFile(servedPath)
  }
  res.statusCode = 200
  res.setHeader('content-type', contentType(servedPath))
  res.end(file)
  return true
}

function contentType(filePath) {
  const extension = path.extname(filePath)
  return {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
  }[extension] || 'application/octet-stream'
}

function routePath(requestPath) {
  if (requestPath.startsWith(defaultRootUrl)) {
    return requestPath.slice(defaultRootUrl.length)
  }
  return requestPath.replace(/^\/+/, '')
}

async function createServer(options) {
  const webRoot = path.join(packageDir, 'web')
  const rootDir = await fs.realpath(options.dir)
  if (!(await fs.stat(rootDir)).isDirectory()) {
    throw new Error('--dir must be a directory')
  }
  const projectName = options.projectName || path.basename(rootDir)
  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || '/', 'http://localhost')
      const origin = req.headers.origin
      if (origin && (!req.headers.host || new URL(origin).host !== req.headers.host)) {
        jsonResponse(res, 403, { error: 'Cross-origin request is not allowed' })
        return
      }
      const route = routePath(requestUrl.pathname)
      if (route === 'web_config.json5' && ['GET', 'POST'].includes(req.method)) {
        if (req.method === 'POST') {
          await readRequestBody(req)
        }
        jsonResponse(res, 200, await readConfig(options.webConfig))
        return
      }
      if (req.method === 'POST' && route === 'get_json_list') {
        await readRequestBody(req)
        const data = (await collectJsonFiles(rootDir)).sort((a, b) => a.id.localeCompare(b.id))
        jsonResponse(res, 200, { project_name: projectName, data })
        return
      }
      if (req.method === 'POST' && ['load_panda_json', 'delete_panda_json', 'save_panda_json'].includes(route)) {
        const body = await readRequestBody(req)
        const filePath = pathForId(rootDir, body.id)
        await assertPathInside(rootDir, filePath, { allowMissing: route === 'save_panda_json' })
        if (route === 'load_panda_json') {
          jsonResponse(res, 200, JSON.parse(await fs.readFile(filePath, 'utf8')))
          return
        }
        if (route === 'delete_panda_json') {
          await moveToBackup(filePath)
          jsonResponse(res, 200, { data: { id: body.id } })
          return
        }
        const data = body.data || body.panda_json || Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'id'))
        try {
          await fs.access(filePath)
          await moveToBackup(filePath)
        } catch (error) {
          if (error.code !== 'ENOENT') {
            throw error
          }
        }
        await fs.mkdir(path.dirname(filePath), { recursive: true })
        await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`)
        jsonResponse(res, 200, { data: { id: body.id } })
        return
      }
      if (requestUrl.pathname.startsWith(defaultRootUrl)) {
        await readStaticFile(webRoot, requestUrl.pathname, res)
        return
      }
      res.statusCode = 404
      res.end('Not found')
    } catch (error) {
      const statusCode = error.statusCode || (error.code === 'ENOENT' ? 404 : 400)
      jsonResponse(res, statusCode, { error: requestErrorMessage(error) })
    }
  })
  await new Promise(resolve => server.listen(options.port, '0.0.0.0', resolve))
  return server
}

const options = parseArgs(process.argv.slice(2))
createServer(options).then(() => {
  console.log(`onPanda annotate server: http://127.0.0.1:${options.port}${defaultRootUrl}`)
}).catch(error => {
  console.error(error)
  process.exitCode = 1
})
