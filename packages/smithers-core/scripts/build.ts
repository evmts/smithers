#!/usr/bin/env bun
/**
 * Build script for @evmts/smithers core library
 */

import { $ } from 'bun'
import { rmSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dir, '..')
const DIST = join(ROOT, 'dist')

console.log('Building @evmts/smithers...\n')

// Clean dist directory
console.log('Cleaning dist directory...')
rmSync(DIST, { recursive: true, force: true })
mkdirSync(DIST, { recursive: true })

// Build main library and testing exports
// Mark react and react-reconciler as external to prevent bundling multiple React copies
// This fixes "Invalid hook call" errors when consumers have their own React instance
// Also externalize JSX runtime subpaths which are imported by compiled JSX
// Note: We build each entrypoint separately to avoid Bun's code-splitting duplicate export bug
console.log('Building main library...')
await $`bun build ./src/index.ts \
  --outdir ./dist \
  --target node \
  --sourcemap=external \
  --external react \
  --external react-reconciler \
  --external react/jsx-runtime \
  --external react/jsx-dev-runtime`

// TODO: Add testing exports when needed
// console.log('Building testing exports...')
// await $`bun build ./src/testing.ts \
//   --outdir ./dist \
//   --target node \
//   --sourcemap=external \
//   --external react \
//   --external react-reconciler \
//   --external react/jsx-runtime \
//   --external react/jsx-dev-runtime`

// Generate TypeScript declarations
console.log('Generating type declarations...')
try {
  await $`tsc --emitDeclarationOnly --declaration --declarationMap`
  console.log('Type declarations generated')
} catch (error) {
  console.warn('Warning: Type declaration generation failed')
  console.warn('The build will continue without type definitions')
}

console.log('\nBuild complete!')
console.log(`Output: ${DIST}`)
