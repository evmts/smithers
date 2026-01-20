/**
 * Tests for scope.ts - Scope ID and state key generation utilities
 */

import { describe, test, expect } from 'bun:test'
import { encodeScopeSegment, makeScopeId, makeStateKey } from './scope.js'

describe('encodeScopeSegment', () => {
  test('leaves alphanumeric unchanged', () => {
    expect(encodeScopeSegment('abc123')).toBe('abc123')
  })

  test('encodes spaces', () => {
    expect(encodeScopeSegment('hello world')).toBe('hello%20world')
    expect(encodeScopeSegment('foo bar')).toBe('foo%20bar')
  })

  test('encodes special characters', () => {
    expect(encodeScopeSegment('a/b')).toBe('a%2Fb')
    expect(encodeScopeSegment('key=value')).toBe('key%3Dvalue')
    expect(encodeScopeSegment('a/b/c')).toBe('a%2Fb%2Fc')
    expect(encodeScopeSegment('a:b:c')).toBe('a%3Ab%3Ac')
  })

  test('handles empty string', () => {
    expect(encodeScopeSegment('')).toBe('')
  })

  test('encodes unicode characters', () => {
    expect(encodeScopeSegment('日本語')).toBe('%E6%97%A5%E6%9C%AC%E8%AA%9E')
  })

  test('encodes emoji', () => {
    expect(encodeScopeSegment('test🎉')).toBe('test%F0%9F%8E%89')
  })

  test('encodes ampersand and equals', () => {
    expect(encodeScopeSegment('a=b&c=d')).toBe('a%3Db%26c%3Dd')
  })

  test('preserves hyphens and underscores', () => {
    expect(encodeScopeSegment('my-scope_id')).toBe('my-scope_id')
  })
})

describe('makeScopeId', () => {
  test('joins parent, type, id with dots', () => {
    expect(makeScopeId('root', 'agent', 'a1')).toBe('root.agent.a1')
  })

  test('creates id from parent, type, and id', () => {
    const result = makeScopeId('parent', 'agent', '123')
    expect(result).toBe('parent.agent.123')
  })

  test('includes suffix when provided', () => {
    expect(makeScopeId('root', 'task', 't1', 'v2')).toBe('root.task.t1.v2')
    const result = makeScopeId('parent', 'agent', '123', 'run-1')
    expect(result).toBe('parent.agent.123.run-1')
  })

  test('excludes empty suffix', () => {
    expect(makeScopeId('root', 'task', 't1', '')).toBe('root.task.t1')
    const result = makeScopeId('parent', 'agent', '123', '')
    expect(result).toBe('parent.agent.123')
  })

  test('excludes undefined suffix', () => {
    expect(makeScopeId('root', 'task', 't1', undefined)).toBe('root.task.t1')
  })

  test('encodes special characters in child segments only', () => {
    // Parent is assumed to be already encoded (from previous makeScopeId call)
    // Only type, id, and suffix are encoded
    expect(makeScopeId('a%20b', 'c/d', 'e=f')).toBe('a%20b.c%2Fd.e%3Df')
  })

  test('encodes type, id, and suffix but not parent', () => {
    // Parent should already be encoded - we don't re-encode it
    const result = makeScopeId('parent%20scope', 'my/type', 'id:1', 'suffix&2')
    expect(result).toBe('parent%20scope.my%2Ftype.id%3A1.suffix%262')
  })

  test('handles empty parent', () => {
    // Empty parent means no prefix - just the child segments
    const result = makeScopeId('', 'agent', '123')
    expect(result).toBe('agent.123')
  })

  test('handles numeric-like strings', () => {
    const result = makeScopeId('root', 'task', '42', '0')
    expect(result).toBe('root.task.42.0')
  })

  test('handles complex nested scope paths', () => {
    // Parent is already a scope ID (with dots) - we don't re-encode it
    const result = makeScopeId('root.child.grandchild', 'component', 'button')
    expect(result).toBe('root.child.grandchild.component.button')
  })
})

describe('makeStateKey', () => {
  test('joins domain and scopeId with underscore', () => {
    expect(makeStateKey('scope1', 'status')).toBe('status_scope1')
  })

  test('creates key from scopeId and domain', () => {
    const result = makeStateKey('scope-123', 'status')
    expect(result).toBe('status_scope-123')
  })

  test('includes localId when provided', () => {
    expect(makeStateKey('scope1', 'data', 'local1')).toBe('data_scope1_local1')
    const result = makeStateKey('scope-123', 'status', 'local-1')
    expect(result).toBe('status_scope-123_local-1')
  })

  test('includes suffix when provided', () => {
    expect(makeStateKey('scope1', 'data', 'local1', 'v1')).toBe('data_scope1_local1_v1')
    const result = makeStateKey('scope-123', 'status', 'local-1', 'v2')
    expect(result).toBe('status_scope-123_local-1_v2')
  })

  test('excludes empty localId', () => {
    expect(makeStateKey('scope1', 'data', '')).toBe('data_scope1')
  })

  test('excludes localId when empty string', () => {
    const result = makeStateKey('scope-123', 'status', '')
    expect(result).toBe('status_scope-123')
  })

  test('excludes empty suffix', () => {
    expect(makeStateKey('scope1', 'data', 'local1', '')).toBe('data_scope1_local1')
  })

  test('excludes suffix when empty string', () => {
    const result = makeStateKey('scope-123', 'status', 'local', '')
    expect(result).toBe('status_scope-123_local')
  })

  test('encodes special characters in localId and suffix', () => {
    expect(makeStateKey('s', 'd', 'a/b', 'c=d')).toBe('d_s_a%2Fb_c%3Dd')
  })

  test('encodes localId and suffix', () => {
    const result = makeStateKey('scope', 'domain', 'id/1', 'suff:2')
    expect(result).toBe('domain_scope_id%2F1_suff%3A2')
  })

  test('excludes localId when not provided', () => {
    const result = makeStateKey('scope-123', 'status', undefined, 'suffix')
    expect(result).toBe('status_scope-123_suffix')
  })

  test('handles empty scopeId', () => {
    const result = makeStateKey('', 'domain', 'local')
    expect(result).toBe('domain__local')
  })

  test('handles complex domain names', () => {
    const result = makeStateKey('scope', 'agent-execution-status', 'task-1')
    expect(result).toBe('agent-execution-status_scope_task-1')
  })
})

describe('integration: scope key generation', () => {
  test('makeScopeId output can be used with makeStateKey', () => {
    const scopeId = makeScopeId('root', 'agent', 'claude-1')
    const stateKey = makeStateKey(scopeId, 'status', 'output')
    expect(stateKey).toBe('status_root.agent.claude-1_output')
  })

  test('handles deeply nested scopes with state keys', () => {
    const level1 = makeScopeId('app', 'orchestrator', 'main')
    // level1 = 'app.orchestrator.main'
    const level2 = makeScopeId(level1, 'phase', 'review')
    // level2 = 'app.orchestrator.main.phase.review'
    const level3 = makeScopeId(level2, 'agent', 'smithers')
    // level3 = 'app.orchestrator.main.phase.review.agent.smithers'
    const key = makeStateKey(level3, 'result')
    expect(key).toBe('result_app.orchestrator.main.phase.review.agent.smithers')
  })

  test('special characters remain encoded through the chain', () => {
    const scopeId = makeScopeId('root', 'my agent', 'id/123')
    const key = makeStateKey(scopeId, 'cache', 'key:1')
    expect(key).toContain('%20')
    expect(key).toContain('%2F')
    expect(key).toContain('%3A')
  })
})
