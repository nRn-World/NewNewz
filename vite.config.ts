import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/NewzLocal/' : '/', // served from nrnworld.one/NewzLocal/
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/fb': {
        target: 'https://www.flashback.org',
        changeOrigin: true,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewzLocal/0.1)' },
        rewrite: (p) => p.replace(/^\/fb/, ''),
      },
      '/rd': {
        target: 'https://www.reddit.com',
        changeOrigin: true,
        headers: { 'User-Agent': 'NewzLocal/0.1' },
        rewrite: (p) => p.replace(/^\/rd/, ''),
      },
      '/gn': {
        target: 'https://news.google.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/gn/, ''),
      },
      '/bn': {
        target: 'https://www.bing.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/bn/, ''),
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'maplibre', test: /node_modules[\\/]maplibre-gl/ }],
        },
      },
    },
  },
  optimizeDeps: { exclude: ['maplibre-gl'] }, // pre-bundling breaks maplibre's relative worker URL
}))
