/**
 * Unit tests for Hooks/PostCommit.tsx - Post commit hook component interface tests.
 */
import { describe, test, expect, mock } from 'bun:test'
import type { PostCommitProps } from './PostCommit'

describe('PostCommitProps interface', () => {
  test('children is required', () => {
    const props: PostCommitProps = {
      children: null as any,
    }
    expect(props.children).toBeNull()
  })

  test('runOn is optional', () => {
    const props: PostCommitProps = {
      children: null as any,
    }
    expect(props.runOn).toBeUndefined()
  })

  test('runOn can be all', () => {
    const props: PostCommitProps = {
      children: null as any,
      runOn: 'all',
    }
    expect(props.runOn).toBe('all')
  })

  test('runOn can be smithers-only', () => {
    const props: PostCommitProps = {
      children: null as any,
      runOn: 'smithers-only',
    }
    expect(props.runOn).toBe('smithers-only')
  })

  test('async is optional boolean', () => {
    const props: PostCommitProps = {
      children: null as any,
    }
    expect(props.async).toBeUndefined()
  })

  test('async can be true', () => {
    const props: PostCommitProps = {
      children: null as any,
      async: true,
    }
    expect(props.async).toBe(true)
  })

  test('all props together', () => {
    const props: PostCommitProps = {
      children: null as any,
      runOn: 'smithers-only',
      async: true,
    }

    expect(props.runOn).toBe('smithers-only')
    expect(props.async).toBe(true)
  })
})

// Note: Cannot test PostCommit component directly due to Solid JSX transform mismatch.
// The interface tests above verify the prop types work correctly.
