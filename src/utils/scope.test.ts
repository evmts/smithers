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
  })

  test('encodes special characters', () => {
    expect(encodeScopeSegment('a.b.c')).toBe('a.b.c')
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
  test('creates id from parent, type, and id', () => {
    const result = makeScopeId('parent', 'agent', '123')
    expect(result).toBe('parent.agent.123')
  })

  test('includes suffix when provided', () => {
    const result = makeScopeId('parent', 'agent', '123', 'run-1')
    expect(result).toBe('parent.agent.123.run-1')
  })

  test('excludes suffix when not provided', () => {
    const result = makeScopeId('parent', 'agent', '123')
    expect(result).toBe('parent.agent.123')
  })

  test('excludes suffix when empty string', () => {
    const result = makeScopeId('parent', 'agent', '123', '')
    expect(result).toBe('parent.agent.123')
  })

  test('encodes all segments', () => {
    const result = makeScopeId('parent scope', 'my/type', 'id:1', 'suffix&2')
    expect(result).toBe('parent%20scope.my%2Ftype.id%3A1.suffix%262')
  })

  test('handles empty parent', () => {
    const result = makeScopeId('', 'agent', '123')
    expect(result).toBe('.agent.123')
  })

  test('handles numeric-like strings', () => {
    const result = makeScopeId('root', 'task', '42', '0')
    expect(result).toBe('root.task.42.0')
  })

  test('handles complex nested scope paths', () => {
    const result = makeScopeId('root.child.grandchild', 'component', 'button')
    expect(result).toBe('root.child.grandchild.component.button')
  })
})

describe('makeStateKey', () => {
  test('creates key from scopeId and domain', () => {
    const result = makeStateKey('scope-123', 'status')
    expect(result).toBe('status_scope-123')
  })

  test('includes localId when provided', () => {
    const result = makeStateKey('scope-123', 'status', 'local-1')
    expect(result).toBe('status_scope-123_local-1')
  })

  test('includes suffix when provided', () => {
    const result = makeStateKey('scope-123', 'status', 'local-1', 'v2')
    expect(result).toBe('status_scope-123_local-1_v2')
  })

  test('excludes localId when not provided', () => {
    const result = makeStateKey('scope-123', 'status', undefined, 'suffix')
    expect(result).toBe('status_scope-123_suffix')
  })

  test('excludes localId when empty string', () => {
    const result = makeStateKey('scope-123', 'status', '')
    expect(result).toBe('status_scope-123')
  })

  test('excludes suffix when empty string', () => {
    const result = makeStateKey('scope-123', 'status', 'local', '')
    expect(result).toBe('status_scope-123_local')
  })

  test('encodes localId and suffix', () => {
    const result = makeStateKey('scope', 'domain', 'id/1', 'suff:2')
    expect(result).toBe('domain_scope_id%2F1_suff%3A2')
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
    const level2 = makeScopeId(level1, 'phase', 'review')
    const level3 = makeScopeId(level2, 'agent', 'smithers')
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
