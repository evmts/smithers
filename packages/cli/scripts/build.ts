#!/usr/bin/env bun
/**
 * Build script for @evmts/smithers-cli
 */

import { $ } from 'bun'
import { rmSync, mkdirSync, chmodSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dir, '..')
const DIST = join(ROOT, 'dist')

console.log('Building @evmts/smithers-cli...\n')

// Clean dist directory
console.log('Cleaning dist directory...')
rmSync(DIST, { recursive: true, force: true })
mkdirSync(DIST, { recursive: true })

// Build CLI - main entry point
console.log('Building CLI...')
await $`bun build ./src/index.ts --outdir ./dist --target node --sourcemap=external`

// Build individual modules for subpath exports
console.log('Building submodules...')
const submodules = ['display', 'loader', 'config', 'props', 'interactive']
for (const mod of submodules) {
  await $`bun build ./src/${mod}.ts --outfile ./dist/${mod}.js --target node`
}

// Set executable bit
const cliPath = join(DIST, 'index.js')
chmodSync(cliPath, 0o755)

// Generate TypeScript declarations
console.log('Generating type declarations...')
try {
  await $`tsc --emitDeclarationOnly --declaration --declarationMap`
  console.log('Type declarations generated')
} catch (error) {
  console.warn('Warning: Type declaration generation failed')
}

console.log('\nBuild complete!')
