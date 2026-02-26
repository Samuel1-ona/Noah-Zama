import { defineConfig, searchForWorkspaceRoot } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      buffer: 'buffer',
      process: 'process/browser.js',
      stream: 'stream-browserify',
      events: 'events',
      util: 'util',
    }
  },
  define: {
    'process.env': {},
    global: 'globalThis',
  },
  server: {
    fs: {
      allow: [
        searchForWorkspaceRoot(process.cwd()),
        resolve(__dirname, '../sdk'),
      ]
    },
    // Required headers for SharedArrayBuffer support (used by TFHE WASM thread pool)
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    }
  },
  optimizeDeps: {
    exclude: ['@zama-fhe/relayer-sdk']
  }
})








