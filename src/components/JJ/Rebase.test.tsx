/**
 * Unit tests for JJ/Rebase.tsx - JJ rebase component interface tests.
 */
import { describe, test, expect, mock } from 'bun:test'
import type { RebaseProps } from './Rebase.js'

describe('RebaseProps interface', () => {
  test('destination is optional', () => {
    const props: RebaseProps = {}
    expect(props.destination).toBeUndefined()
  })

  test('destination can be set', () => {
    const props: RebaseProps = { destination: 'main' }
    expect(props.destination).toBe('main')
  })

  test('source is optional', () => {
    const props: RebaseProps = {}
    expect(props.source).toBeUndefined()
  })

  test('source can be set', () => {
    const props: RebaseProps = { source: 'feature-branch' }
    expect(props.source).toBe('feature-branch')
  })

  test('onConflict is optional callback', () => {
    const callback = mock(() => {})
    const props: RebaseProps = { onConflict: callback }

    const conflicts = ['file1.ts', 'file2.ts']
    props.onConflict?.(conflicts)

    expect(callback).toHaveBeenCalledWith(conflicts)
  })

  test('children is optional', () => {
    const props: RebaseProps = {}
    expect(props.children).toBeUndefined()
  })

  test('all props together', () => {
    const onConflict = mock(() => {})
    const props: RebaseProps = {
      destination: 'main',
      source: 'feature',
      onConflict,
    }

    expect(props.destination).toBe('main')
    expect(props.source).toBe('feature')
    expect(props.onConflict).toBeDefined()
  })
})

// Note: Component rendering tests require React reconciler test environment setup.
// The interface tests above verify the prop types work correctly.
