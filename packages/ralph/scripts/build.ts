#!/usr/bin/env bun
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const srcDir = path.join(rootDir, 'src')
const distDir = path.join(rootDir, 'dist')

console.log('Building @evmts/ralph...')

// Clean dist directory
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true })
}
fs.mkdirSync(distDir, { recursive: true })

// Build with Bun
const result = await Bun.build({
  entrypoints: [path.join(srcDir, 'index.ts')],
  outdir: distDir,
  target: 'bun',
  format: 'esm',
  splitting: false,
  sourcemap: 'external',
  minify: false,
})

if (!result.success) {
  console.error('Build failed:')
  for (const log of result.logs) {
    console.error(log)
  }
  process.exit(1)
}

// Make CLI executable
const cliPath = path.join(distDir, 'index.js')
if (fs.existsSync(cliPath)) {
  fs.chmodSync(cliPath, 0o755)
}

// Generate TypeScript declarations
console.log('Generating TypeScript declarations...')
const tscResult = Bun.spawnSync(['bun', 'x', 'tsc', '--emitDeclarationOnly'], {
  cwd: rootDir,
  stdout: 'inherit',
  stderr: 'inherit',
})

if (tscResult.exitCode !== 0) {
  console.error('TypeScript declaration generation failed')
  process.exit(1)
}

console.log('Build complete!')
