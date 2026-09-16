import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import { visualizer } from 'rollup-plugin-visualizer'
import vue from '@vitejs/plugin-vue'

import { createBypassCorsProxyPlugin } from './server/bypassCorsProxyPlugin.js'
import { createRuntimeImportPlugin } from './server/runtimeImportPlugin.js'
import { createUsingServerProxyPlugin } from './server/usingServerProxyPlugin.js'
import { createWebConfigPlugin } from './server/webConfigPlugin.js'

const packageDir = fileURLToPath(new URL('.', import.meta.url))
const repoDir = path.resolve(packageDir, '../..')
const webRoot = path.join(repoDir, 'apps/on-panda-web')

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const envDir = repoDir
  const env = loadEnv(mode, envDir, '')

  const defaultCustom = path.join(repoDir, 'src/utils/defaultCustom.js')
  const customModulePath = env.WEB_IMPORT_CUSTOM_CODE
  const resolvedCustomModule = customModulePath
  ? (path.isAbsolute(customModulePath) ? customModulePath : path.resolve(envDir, customModulePath))
  : defaultCustom

  const runtimeImportPath = env.VITE_ON_PANDA_WEB_RUNTIME_IMPORT
  const resolvedRuntimeImport = runtimeImportPath
    ? (path.isAbsolute(runtimeImportPath) ? runtimeImportPath : path.resolve(envDir, runtimeImportPath))
    : ''

  return {
    envDir,
    root: webRoot,
    publicDir: path.join(repoDir, 'public'),
    plugins: [
      vue(),
      createBypassCorsProxyPlugin(env.VITE_ON_PANDA_BROWSER_AGENT_PROXY_PATH),
      createRuntimeImportPlugin(resolvedRuntimeImport),
      createUsingServerProxyPlugin(),
      createWebConfigPlugin(),
      mode === 'analyze' && visualizer({
        open: true,
        gzipSize: true,
        brotliSize: true,
      }),
    ],
    resolve: {
      alias: {
        '@': path.join(webRoot, 'src'),
        './utils/defaultCustom.js': resolvedCustomModule,
      }
    },
    build: {
      outDir: path.join(packageDir, 'web'),
      emptyOutDir: true,
    },
    server: {
      proxy: {
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
