#!/usr/bin/env bun
/**
 * Build script for @evmts/smithers-protocol
 */

import { $ } from 'bun'
import { rmSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dir, '..')
const DIST = join(ROOT, 'dist')

console.log('Building @evmts/smithers-protocol...\n')

// Clean dist directory
console.log('Cleaning dist directory...')
rmSync(DIST, { recursive: true, force: true })
mkdirSync(DIST, { recursive: true })

// Build library
console.log('Building library...')
await $`bun build ./src/index.ts --outdir ./dist --target node --sourcemap=external`

// Generate TypeScript declarations
console.log('Generating type declarations...')
try {
  await $`tsc --emitDeclarationOnly --declaration --declarationMap`
  console.log('Type declarations generated')
} catch (error) {
  console.warn('Warning: Type declaration generation failed')
}

console.log('\nBuild complete!')
