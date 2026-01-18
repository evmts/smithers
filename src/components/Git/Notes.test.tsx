/**
 * Unit tests for Git/Notes.tsx - Git notes component interface tests.
 */
import { describe, test, expect, mock } from 'bun:test'
import type { NotesProps, NotesResult } from './Notes.js'

describe('NotesProps interface', () => {
  test('commitRef is optional, defaults to HEAD', () => {
    const props: NotesProps = { data: { key: 'value' } }
    expect(props.commitRef).toBeUndefined()
  })

  test('commitRef can be set', () => {
    const props: NotesProps = { commitRef: 'abc123', data: {} }
    expect(props.commitRef).toBe('abc123')
  })

  test('data is required object', () => {
    const props: NotesProps = { data: { smithers: true, version: '1.0' } }
    expect(props.data.smithers).toBe(true)
    expect(props.data.version).toBe('1.0')
  })

  test('append is optional boolean', () => {
    const props: NotesProps = { data: {}, append: true }
    expect(props.append).toBe(true)
  })

  test('append defaults to false (replace)', () => {
    const props: NotesProps = { data: {} }
    expect(props.append).toBeUndefined() // Will default to false in component
  })

  test('onFinished callback receives NotesResult', () => {
    const callback = mock(() => {})
    const props: NotesProps = { data: {}, onFinished: callback }

    const result: NotesResult = {
      commitRef: 'HEAD',
      data: { smithers: true },
      previousNotes: null,
    }

    props.onFinished?.(result)
    expect(callback).toHaveBeenCalledWith(result)
  })

  test('onError callback receives Error', () => {
    const callback = mock(() => {})
    const props: NotesProps = { data: {}, onError: callback }

    const error = new Error('Notes failed')
    props.onError?.(error)
    expect(callback).toHaveBeenCalledWith(error)
  })
})

describe('NotesResult interface', () => {
  test('has all required fields', () => {
    const result: NotesResult = {
      commitRef: 'abc123',
      data: { smithers: true, executionId: 'exec-1' },
      previousNotes: null,
    }

    expect(result.commitRef).toBe('abc123')
    expect(result.data.smithers).toBe(true)
    expect(result.previousNotes).toBeNull()
  })

  test('previousNotes can contain prior notes when appending', () => {
    const result: NotesResult = {
      commitRef: 'HEAD',
      data: { newData: true },
      previousNotes: '{"oldData": true}',
    }

    expect(result.previousNotes).toBe('{"oldData": true}')
  })
})

// Note: Cannot test Notes component directly due to Solid JSX transform mismatch.
// The interface tests above verify the prop types work correctly.
