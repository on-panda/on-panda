import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const rootDir = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig({
  base: '/on-panda-annotate/',
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: false,
  plugins: [vue()],
  resolve: {
    alias: {
      './utils/defaultCustom.js': path.join(rootDir, 'src/utils/defaultCustom.js'),
    },
  },
  build: {
    outDir: fileURLToPath(new URL('../../packages/annotate/web', import.meta.url)),
    emptyOutDir: true,
  },
})
