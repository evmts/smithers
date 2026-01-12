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

// Build each entrypoint separately to avoid Bun's code-splitting duplicate export bug
// While this means shared modules may be duplicated, the CLI subpath exports are
// relatively independent and don't share much code between them
console.log('Building CLI entrypoints...')

const entrypoints = [
  'index.ts',
  'display.ts',
  'loader.ts',
  'config.ts',
  'props.ts',
  'interactive.ts',
  'testing.ts',
]

for (const entry of entrypoints) {
  await $`bun build ./src/${entry} \
    --outdir ./dist \
    --target node \
    --sourcemap=external`
}

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
