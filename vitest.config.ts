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
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    globals: true,
    setupFiles: ['./test/setup.ts'],
    env: {
      NODE_ENV: 'test',
      SMITHERS_MOCK_MODE: 'true',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/**/index.ts'],
    },
  },
})
