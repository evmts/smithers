import { describe, expect, test } from 'bun:test'
import { encodeScopeSegment, makeScopeId, makeStateKey } from './scope'

describe('encodeScopeSegment', () => {
  test('encodes special characters', () => {
    expect(encodeScopeSegment('foo bar')).toBe('foo%20bar')
    expect(encodeScopeSegment('a/b')).toBe('a%2Fb')
    expect(encodeScopeSegment('key=value')).toBe('key%3Dvalue')
  })

  test('leaves alphanumeric unchanged', () => {
    expect(encodeScopeSegment('abc123')).toBe('abc123')
  })

  test('handles empty string', () => {
    expect(encodeScopeSegment('')).toBe('')
  })
})

describe('makeScopeId', () => {
  test('joins parent, type, id with dots', () => {
    expect(makeScopeId('root', 'agent', 'a1')).toBe('root.agent.a1')
  })

  test('includes suffix when provided', () => {
    expect(makeScopeId('root', 'task', 't1', 'v2')).toBe('root.task.t1.v2')
  })

  test('excludes empty suffix', () => {
    expect(makeScopeId('root', 'task', 't1', '')).toBe('root.task.t1')
  })

  test('excludes undefined suffix', () => {
    expect(makeScopeId('root', 'task', 't1', undefined)).toBe('root.task.t1')
  })

  test('encodes special characters in segments', () => {
    expect(makeScopeId('a b', 'c/d', 'e=f')).toBe('a%20b.c%2Fd.e%3Df')
  })
})

describe('makeStateKey', () => {
  test('joins domain and scopeId with underscore', () => {
    expect(makeStateKey('scope1', 'status')).toBe('status_scope1')
  })

  test('includes localId when provided', () => {
    expect(makeStateKey('scope1', 'data', 'local1')).toBe('data_scope1_local1')
  })

  test('includes suffix when provided', () => {
    expect(makeStateKey('scope1', 'data', 'local1', 'v1')).toBe('data_scope1_local1_v1')
  })

  test('excludes empty localId', () => {
    expect(makeStateKey('scope1', 'data', '')).toBe('data_scope1')
  })

  test('excludes empty suffix', () => {
    expect(makeStateKey('scope1', 'data', 'local1', '')).toBe('data_scope1_local1')
  })

  test('encodes special characters in localId and suffix', () => {
    expect(makeStateKey('s', 'd', 'a/b', 'c=d')).toBe('d_s_a%2Fb_c%3Dd')
  })
})
