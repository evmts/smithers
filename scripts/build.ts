#!/usr/bin/env bun
/**
 * Build script for Smithers
 *
 * Builds:
 * 1. Main library (dist/index.js)
 * 2. CLI binary (dist/cli/index.js)
 * 3. TypeScript declarations (dist/**\/*.d.ts)
 */

import { $ } from 'bun'
import { rmSync, mkdirSync, chmodSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dir, '..')
const DIST = join(ROOT, 'dist')

console.log('🏗️  Building Smithers...\n')

// Clean dist directory
console.log('🧹 Cleaning dist directory...')
rmSync(DIST, { recursive: true, force: true })
mkdirSync(DIST, { recursive: true })

// Build main library
console.log('📦 Building main library...')
await $`bun build ./src/index.ts --outdir ./dist --target node --sourcemap=external`

// Build CLI
console.log('🔧 Building CLI...')
mkdirSync(join(DIST, 'cli'), { recursive: true })
await $`bun build ./src/cli/index.ts --outdir ./dist/cli --target node --sourcemap=external`

// Set executable bit on CLI
const cliPath = join(DIST, 'cli', 'index.js')
chmodSync(cliPath, 0o755)

// Generate TypeScript declarations
console.log('📝 Generating type declarations...')
try {
  await $`tsc --emitDeclarationOnly --declaration --declarationMap`
  console.log('✅ Type declarations generated')
} catch (error) {
  console.warn('⚠️  Warning: Type declaration generation failed')
  console.warn('   The build will continue without type definitions')
}

console.log('\n✅ Build complete!')
console.log(`📁 Output: ${DIST}`)
