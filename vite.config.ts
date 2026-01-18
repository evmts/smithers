import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import { resolve } from 'path'
import { readdirSync, statSync } from 'fs'
import { join } from 'path'

// Get all .ts and .tsx files from a directory recursively
function getEntryPoints(dir: string, base: string = ''): Record<string, string> {
  const entries: Record<string, string> = {}
  const files = readdirSync(dir)

  for (const file of files) {
    const fullPath = join(dir, file)
    const stat = statSync(fullPath)

    if (stat.isDirectory()) {
      // Skip test directories
      if (file === '__tests__' || file === 'test' || file.endsWith('.test')) continue
      Object.assign(entries, getEntryPoints(fullPath, base ? `${base}/${file}` : file))
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      // Skip test files
      if (file.includes('.test.')) continue
      const name = base ? `${base}/${file.replace(/\.tsx?$/, '')}` : file.replace(/\.tsx?$/, '')
      entries[name] = fullPath
    }
  }

  return entries
}

export default defineConfig({
  plugins: [
    solid({
      // Use SSR mode for server-side rendering compatibility
      solid: {
        generate: 'ssr',
        hydratable: false,
      },
    }),
  ],
  build: {
    lib: {
      entry: getEntryPoints(resolve(__dirname, 'src')),
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    outDir: 'dist',
    rollupOptions: {
      external: [
        'solid-js',
        'solid-js/web',
        'solid-js/store',
        'solid-js/universal',
        '@anthropic-ai/claude-agent-sdk',
        '@anthropic-ai/sdk',
        '@electric-sql/pglite',
        'commander',
        'zod',
        'zustand',
        'fs',
        'path',
        'url',
        'child_process',
        'node:fs',
        'node:path',
        'node:url',
        'node:child_process',
        /^bun:/,
      ],
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
      },
    },
    minify: false,
    sourcemap: true,
    emptyOutDir: true,
  },
})
