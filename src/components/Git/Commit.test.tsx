/**
 * Unit tests for Git/Commit.tsx - Git commit component interface tests.
 */
import { describe, test, expect, mock } from 'bun:test'
import type { CommitProps, CommitResult } from './Commit.js'

describe('CommitProps interface', () => {
  test('message is optional', () => {
    const props: CommitProps = {}
    expect(props.message).toBeUndefined()
  })

  test('message can be set', () => {
    const props: CommitProps = { message: 'Add new feature' }
    expect(props.message).toBe('Add new feature')
  })

  test('autoGenerate is optional boolean', () => {
    const props: CommitProps = { autoGenerate: true }
    expect(props.autoGenerate).toBe(true)
  })

  test('notes is optional object', () => {
    const props: CommitProps = { notes: { key: 'value', number: 42 } }
    expect(props.notes?.key).toBe('value')
  })

  test('files is optional string array', () => {
    const props: CommitProps = { files: ['file1.ts', 'file2.ts'] }
    expect(props.files).toHaveLength(2)
  })

  test('all is optional boolean for -a flag', () => {
    const props: CommitProps = { all: true }
    expect(props.all).toBe(true)
  })

  test('children can be used as message', () => {
    const props: CommitProps = { children: 'Commit message via children' }
    expect(props.children).toBe('Commit message via children')
  })

  test('onFinished callback receives CommitResult', () => {
    const callback = mock(() => {})
    const props: CommitProps = { onFinished: callback }

    const result: CommitResult = {
      commitHash: 'abc123',
      message: 'Test commit',
      filesChanged: ['file.ts'],
      insertions: 10,
      deletions: 5,
    }

    props.onFinished?.(result)
    expect(callback).toHaveBeenCalledWith(result)
  })

  test('onError callback receives Error', () => {
    const callback = mock(() => {})
    const props: CommitProps = { onError: callback }

    const error = new Error('Commit failed')
    props.onError?.(error)
    expect(callback).toHaveBeenCalledWith(error)
  })
})

describe('CommitResult interface', () => {
  test('has all required fields', () => {
    const result: CommitResult = {
      commitHash: 'abc123def456',
      message: 'Feature: add new capability',
      filesChanged: ['src/index.ts', 'src/utils.ts'],
      insertions: 100,
      deletions: 50,
    }

    expect(result.commitHash).toBe('abc123def456')
    expect(result.message).toBe('Feature: add new capability')
    expect(result.filesChanged).toHaveLength(2)
    expect(result.insertions).toBe(100)
    expect(result.deletions).toBe(50)
  })

  test('filesChanged can be empty', () => {
    const result: CommitResult = {
      commitHash: 'abc123',
      message: 'Empty commit',
      filesChanged: [],
      insertions: 0,
      deletions: 0,
    }

    expect(result.filesChanged).toHaveLength(0)
  })
})

// Note: Component rendering tests require React reconciler test environment setup.
// The interface tests above verify the prop types work correctly.
