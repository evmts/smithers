/**
 * Unit tests for Ralph.tsx - Ralph is an alias for While.
 */
import { describe, test, expect } from 'bun:test'
import { Ralph, useRalphIteration } from './Ralph.js'
import { useWhileIteration } from './While.js'

describe('Ralph', () => {
  test('Ralph is exported', () => {
    expect(Ralph).toBeDefined()
    expect(typeof Ralph).toBe('function')
  })

  test('useRalphIteration is exported', () => {
    expect(useRalphIteration).toBeDefined()
    expect(typeof useRalphIteration).toBe('function')
  })

  test('useRalphIteration is alias for useWhileIteration', () => {
    expect(useRalphIteration).toBe(useWhileIteration)
  })
})
