import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import { visualizer } from 'rollup-plugin-visualizer'
import vue from '@vitejs/plugin-vue'

import { createBypassCorsProxyPlugin } from './bypassCorsProxyPlugin.js'
import { createRuntimeImportPlugin } from './runtimeImportPlugin.js'
import { createUsingServerProxyPlugin } from './usingServerProxyPlugin.js'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const envDir = path.resolve(__dirname, '../../')
  const env = loadEnv(mode, envDir, '')

  const defaultCustom = fileURLToPath(new URL('../../src/utils/defaultCustom.js', import.meta.url))
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
    root: fileURLToPath(new URL('.', import.meta.url)),
    publicDir: fileURLToPath(new URL('../../public', import.meta.url)),
    plugins: [
      vue(),
      createBypassCorsProxyPlugin(),
      createRuntimeImportPlugin(resolvedRuntimeImport),
      createUsingServerProxyPlugin(),
      mode === 'analyze' && visualizer({
        open: true,
        gzipSize: true,
        brotliSize: true,
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        './utils/defaultCustom.js': resolvedCustomModule,
      }
    },
    build: {
      outDir: fileURLToPath(new URL('./dist', import.meta.url)),
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
