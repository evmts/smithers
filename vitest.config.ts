import { defineConfig } from 'vitest/config'
import solid from 'vite-plugin-solid'
import path from 'path'

export default defineConfig({
  plugins: [
    solid({
      solid: {
        generate: 'universal',
        moduleName: 'smithers-renderer',
        rendererName: 'render',
        effectName: 'effect',
        memoName: 'memo',
      },
    }),
  ],
  resolve: {
    alias: {
      'smithers-renderer': path.resolve(__dirname, './src/solid/renderer.js'),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['**/*.{test,spec}.ts'],  // Temporarily exclude .tsx until JSX config is fixed
    globals: true,
    env: {
      NODE_ENV: 'test',
    },
  },
})
