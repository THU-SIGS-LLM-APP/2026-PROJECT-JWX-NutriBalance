import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'

const apiKey = fs.readFileSync('./.env', 'utf-8')
  .split('\n')
  .find(line => line.startsWith('VITE_DEEPSEEK_API_KEY='))
  ?.split('=')[1] || '';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/deepseek': {
        target: 'https://api.deepseek.com/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/deepseek/, '/chat/completions'),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            if (apiKey) {
              proxyReq.setHeader('Authorization', `Bearer ${apiKey}`);
            }
          });
        },
      },
    },
  },
})
