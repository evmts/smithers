#!/usr/bin/env bun
/**
 * Build script for smithers-orchestrator library
 * 
 * Uses TypeScript compiler (tsc) to preserve module boundaries.
 * This ensures that sub-modules (JJ, Git, Hooks) share the same 
 * SmithersContext instance with the main components.
 */

import { $ } from 'bun'

console.log('Building with TypeScript...')

// Use tsc with the build config
const result = await $`bunx tsc -p tsconfig.build.json`.quiet()

if (result.exitCode !== 0) {
  console.error('Build failed:')
  console.error(result.stderr.toString())
  process.exit(1)
}

console.log('Build complete!')
console.log('Output: dist/')
