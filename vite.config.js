import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    proxy: {
      '/v1': {
        target: 'http://39.105.21.95:12481',
        changeOrigin: true,
        // rewrite: path => path.replace(/^\/api/, '')
      },
      '/bypass-CORS': {
        target: 'https://api.xxx.com',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/bypass-CORS/, '/v1/')
      },
      '/cast': {
        target: 'http://127.0.0.1:9200',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/cast/, '/')
      }
    }
  }
})
