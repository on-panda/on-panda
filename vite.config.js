import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

function verifyIsLlmApiCall(url) {
  // check is LLM api call by /models or /completions
  return /\/models|\/completions/.test(url);
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const config = {
    plugins: [
      vue(),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))  // Deprecated due to lack of support Joint Debugging with other package.
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
        '/qwen-test': {  // TODO: del if cloudflare tunnel is ready
          target: 'http://113.44.140.251:12692',
          changeOrigin: true,
          rewrite: path => path.replace(/^\/qwen-test/, '/v1/')
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
                if (!verifyIsLlmApiCall(url)) {
                  // raise error
                  throw new Error(`Not a valid LLM API call: ${url} that should match /models or /completions, not allowed using /bypass-CORS`);
                }
                proxy.options.target = url.origin;
                proxyReq.path = url.pathname
              } catch (e) {
                console.error(e)
              }
            });
          },
        },
        '/using-server-proxy': {
          // Forward request with proxy@server
          // setting URL example: `/using-server-proxy/http://127.0.0.1:1087/https://target.com/v1`
          proxyUrl: 'socks5://127.0.0.1:1080',
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
