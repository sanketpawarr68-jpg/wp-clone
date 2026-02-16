import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'window',
  },
  server: {
    host: '0.0.0.0', // Allow external connections (required for tunneling)
    allowedHosts: true, // Allow any host header
    proxy: {
      '/socket.io': {
        target: 'http://127.0.0.1:5000',
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/socket.io/, '/socket.io'),
      },
    },
  },
})
