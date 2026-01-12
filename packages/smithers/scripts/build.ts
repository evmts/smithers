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

// Build main library
console.log('Building library...')
await $`bun build ./src/index.ts --outdir ./dist --target node --sourcemap=external`

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
