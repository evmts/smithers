import { defineConfig } from 'vitest/config'
import solidPlugin from 'vite-plugin-solid'

import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
  plugins: [
    solidPlugin({
      solid: {
        generate: 'universal',
        moduleName: 'smithers-renderer',
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
  },
  resolve: {
    conditions: ['browser', 'development'],
    alias: {
      'smithers-renderer': resolve(__dirname, './src/renderer.js'),
    },
  },
})
