import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
  server: {
    port: 3000,
    strictPort: true,
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
  },
  // Prevent Vite from obscuring Rust errors
  clearScreen: false,
})
