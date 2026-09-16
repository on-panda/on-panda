#!/usr/bin/env node

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { preview } from 'vite'

import { createBypassCorsProxyPlugin } from '../server/bypassCorsProxyPlugin.js'
import { createRuntimeImportPlugin } from '../server/runtimeImportPlugin.js'
import { createUsingServerProxyPlugin } from '../server/usingServerProxyPlugin.js'
import { createWebConfigPlugin } from '../server/webConfigPlugin.js'

const packageDir = fileURLToPath(new URL('..', import.meta.url))

function parseArgs(args) {
  const options = {
    port: 4173,
    webConfig: '',
  }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--web_config') {
      options.webConfig = args[++index]
    } else if (arg === '--port') {
      options.port = Number(args[++index])
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: serve [--web_config web_config.json5] [--port 4173]')
      process.exit(0)
    }
  }
  return {
    ...options,
    webConfig: options.webConfig ? path.resolve(options.webConfig) : '',
  }
}

async function startServer(options) {
  const runtimeImportPath = process.env.VITE_ON_PANDA_WEB_RUNTIME_IMPORT
    ? path.resolve(process.cwd(), process.env.VITE_ON_PANDA_WEB_RUNTIME_IMPORT)
    : ''
  const server = await preview({
    root: packageDir,
    appType: 'spa',
    plugins: [
      createBypassCorsProxyPlugin(process.env.VITE_ON_PANDA_BROWSER_AGENT_PROXY_PATH),
      createRuntimeImportPlugin(runtimeImportPath),
      createUsingServerProxyPlugin(),
      createWebConfigPlugin(options.webConfig),
    ],
    build: {
      outDir: 'web',
    },
    preview: {
      host: '0.0.0.0',
      port: options.port,
    },
  })
  const [url] = server.resolvedUrls.local
  console.log(`onPanda web server: ${url}`)
}

const options = parseArgs(process.argv.slice(2))
startServer(options).catch(error => {
  console.error(error)
  process.exitCode = 1
})
