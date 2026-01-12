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

// Build all entrypoints in a single build with code splitting
// This ensures shared modules (like LoaderError) maintain class identity across bundles
console.log('Building CLI with code splitting...')
await $`bun build \
  ./src/index.ts \
  ./src/display.ts \
  ./src/loader.ts \
  ./src/config.ts \
  ./src/props.ts \
  ./src/interactive.ts \
  ./src/testing.ts \
  --outdir ./dist \
  --target node \
  --sourcemap=external \
  --splitting`

// Set executable bit on main CLI entry point
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
