import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const appRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: appRoot,
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(appRoot, 'src'),
      // Resolve the local source during component development.
      '@on-panda/on-panda': path.resolve(appRoot, '../../src'),
    },
    dedupe: ['vue', 'pinia'],
  },
})
