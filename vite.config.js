import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const config = {
    plugins: [
      vue(),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    build: {
      lib: {
        entry: 'src/index.js',
        name: 'OnPanda',
        fileName: (format) => `on-panda.${format}.js`
      },
      rollupOptions: {
        external: ['vue', 'pinia'],
        output: {
          globals: {
            vue: 'Vue',
            pinia: 'Pinia'
          }
        }
      }
    },
    server: {
      proxy: {
        '/llama-cpu': {
          target: 'http://39.105.21.95:12481',
          changeOrigin: true,
          rewrite: path => path.replace(/^\/llama-cpu/, '/v1/')
        },
        '/qwen-cpu': {
          target: 'http://39.105.21.95:12482',
          changeOrigin: true,
          rewrite: path => path.replace(/^\/qwen-cpu/, '/v1/')
        },
        '/bypass-CORS': {
          target: 'https://api.github.com/',  // placeholder
          changeOrigin: true,
          configure: (proxy, options) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              try {
                // console.log('proxy:', proxy, proxy.options, req.url);
                var url = new URL(req.url.replace(/^\/bypass-CORS\//, ''))
                // console.log(proxy.options)
                // console.log('url:', url)
                proxy.options.target = url.origin;
                proxyReq.path = url.pathname
              } catch (e) {
                console.error(e)
              }
            });
          },
        },
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
  if (mode == 'app') {
    config.build = {}
  }
  return config
})
