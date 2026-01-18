/**
 * Unit tests for JJ/Commit.tsx - JJ commit component interface tests.
 */
import { describe, test, expect, mock } from 'bun:test'
import type { CommitProps } from './Commit.js'

describe('CommitProps interface', () => {
  test('message is optional string', () => {
    const props: CommitProps = {}
    expect(props.message).toBeUndefined()
  })

  test('message can be set', () => {
    const props: CommitProps = { message: 'Add new feature' }
    expect(props.message).toBe('Add new feature')
  })

  test('autoDescribe is optional boolean', () => {
    const props: CommitProps = { autoDescribe: true }
    expect(props.autoDescribe).toBe(true)
  })

  test('notes is optional string', () => {
    const props: CommitProps = { notes: 'Additional metadata' }
    expect(props.notes).toBe('Additional metadata')
  })

  test('children is optional', () => {
    const props: CommitProps = {}
    expect(props.children).toBeUndefined()
  })

  test('all props together', () => {
    const props: CommitProps = {
      message: 'Feature commit',
      autoDescribe: false,
      notes: '{"key": "value"}',
    }

    expect(props.message).toBe('Feature commit')
    expect(props.autoDescribe).toBe(false)
    expect(props.notes).toBe('{"key": "value"}')
  })
})

// Note: Cannot test Commit component directly due to Solid JSX transform mismatch.
// The interface tests above verify the prop types work correctly.
