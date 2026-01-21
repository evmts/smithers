import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { ReactiveDatabase } from '../reactive-sqlite/database.js'
import { createSuperSmithersDBHelpers, type SuperSmithersDBHelpers } from './db.js'
import type { AnalysisResult, SuperSmithersMetrics, SuperSmithersErrorEvent } from './types.js'

describe('SuperSmithers DB Helpers', () => {
  let rdb: ReactiveDatabase
  let helpers: SuperSmithersDBHelpers

  beforeEach(() => {
    rdb = new ReactiveDatabase(':memory:')
    
    rdb.exec(`
      CREATE TABLE supersmithers_active_overrides (
        module_hash TEXT PRIMARY KEY,
        active_version_id TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );
      
      CREATE TABLE supersmithers_versions (
        version_id TEXT PRIMARY KEY,
        module_hash TEXT NOT NULL,
        parent_version_id TEXT,
        code_tsx TEXT NOT NULL,
        code_sha256 TEXT NOT NULL,
        overlay_rel_path TEXT NOT NULL,
        trigger TEXT NOT NULL,
        analysis_json TEXT,
        metrics_json TEXT,
        vcs_kind TEXT NOT NULL,
        vcs_commit_id TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
      
      CREATE TABLE supersmithers_analyses (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        module_hash TEXT NOT NULL,
        iteration INTEGER NOT NULL,
        trigger TEXT NOT NULL,
        tree_xml TEXT,
        metrics_json TEXT,
        errors_json TEXT,
        analysis_result_json TEXT,
        rewrite_recommended INTEGER,
        recommendation TEXT,
        model TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `)
    
    helpers = createSuperSmithersDBHelpers(rdb)
  })

  afterEach(() => {
    rdb.close()
  })

  describe('getActiveVersion', () => {
    test('returns null when no active version', () => {
      const result = helpers.getActiveVersion('nonexistent-hash')
      expect(result).toBeNull()
    })

    test('returns version id when active version exists', () => {
      rdb.run(
        'INSERT INTO supersmithers_active_overrides (module_hash, active_version_id) VALUES (?, ?)',
        ['hash123', 'version-abc']
      )
      const result = helpers.getActiveVersion('hash123')
      expect(result).toBe('version-abc')
    })
  })

  describe('setActiveVersion', () => {
    test('inserts new active version', () => {
      helpers.setActiveVersion('hash123', 'version-xyz')
      const result = helpers.getActiveVersion('hash123')
      expect(result).toBe('version-xyz')
    })

    test('updates existing active version', () => {
      helpers.setActiveVersion('hash123', 'version-1')
      helpers.setActiveVersion('hash123', 'version-2')
      const result = helpers.getActiveVersion('hash123')
      expect(result).toBe('version-2')
    })
  })

  describe('clearActiveVersion', () => {
    test('removes active version', () => {
      helpers.setActiveVersion('hash123', 'version-xyz')
      helpers.clearActiveVersion('hash123')
      const result = helpers.getActiveVersion('hash123')
      expect(result).toBeNull()
    })

    test('handles non-existent module hash gracefully', () => {
      expect(() => helpers.clearActiveVersion('nonexistent')).not.toThrow()
    })
  })

  describe('getVersionCode', () => {
    test('returns null for non-existent version', () => {
      const result = helpers.getVersionCode('nonexistent-version')
      expect(result).toBeNull()
    })

    test('returns code for existing version', () => {
      const code = 'export default function MyComponent() { return null }'
      const versionId = helpers.storeVersion({
        moduleHash: 'hash123',
        parentVersionId: null,
        code,
        overlayRelPath: 'plans/overlay.tsx',
        trigger: 'manual',
        analysis: createMockAnalysis(),
        metrics: createMockMetrics(),
        vcsKind: 'git',
        vcsCommitId: 'abc123',
      })
      
      const result = helpers.getVersionCode(versionId)
      expect(result).toBe(code)
    })
  })

  describe('getRewriteCount', () => {
    test('returns 0 for module with no rewrites', () => {
      const result = helpers.getRewriteCount('nonexistent-hash')
      expect(result).toBe(0)
    })

    test('counts versions for module', () => {
      helpers.storeVersion({
        moduleHash: 'hash123',
        parentVersionId: null,
        code: 'code1',
        overlayRelPath: 'overlay.tsx',
        trigger: 'manual',
        analysis: createMockAnalysis(),
        metrics: createMockMetrics(),
        vcsKind: 'git',
        vcsCommitId: 'commit1',
      })
      helpers.storeVersion({
        moduleHash: 'hash123',
        parentVersionId: null,
        code: 'code2',
        overlayRelPath: 'overlay.tsx',
        trigger: 'manual',
        analysis: createMockAnalysis(),
        metrics: createMockMetrics(),
        vcsKind: 'git',
        vcsCommitId: 'commit2',
      })
      
      const result = helpers.getRewriteCount('hash123')
      expect(result).toBe(2)
    })

    test('counts only versions for specific module', () => {
      helpers.storeVersion({
        moduleHash: 'hash-a',
        parentVersionId: null,
        code: 'code1',
        overlayRelPath: 'overlay.tsx',
        trigger: 'manual',
        analysis: createMockAnalysis(),
        metrics: createMockMetrics(),
        vcsKind: 'git',
        vcsCommitId: 'commit1',
      })
      helpers.storeVersion({
        moduleHash: 'hash-b',
        parentVersionId: null,
        code: 'code2',
        overlayRelPath: 'overlay.tsx',
        trigger: 'manual',
        analysis: createMockAnalysis(),
        metrics: createMockMetrics(),
        vcsKind: 'git',
        vcsCommitId: 'commit2',
      })
      
      expect(helpers.getRewriteCount('hash-a')).toBe(1)
      expect(helpers.getRewriteCount('hash-b')).toBe(1)
    })
  })

  describe('storeAnalysis', () => {
    test('stores analysis record', () => {
      const analysis = createMockAnalysis()
      const metrics = createMockMetrics()
      const errors: SuperSmithersErrorEvent[] = []
      
      helpers.storeAnalysis({
        executionId: 'exec-123',
        moduleHash: 'hash123',
        iteration: 1,
        trigger: 'stall',
        treeXml: '<tree></tree>',
        metrics,
        errors,
        analysis,
        model: 'claude-sonnet',
      })
      
      const row = rdb.queryOne<{ execution_id: string; module_hash: string; iteration: number }>(
        'SELECT execution_id, module_hash, iteration FROM supersmithers_analyses',
        []
      )
      
      expect(row?.execution_id).toBe('exec-123')
      expect(row?.module_hash).toBe('hash123')
      expect(row?.iteration).toBe(1)
    })

    test('stores rewrite recommendation', () => {
      const analysis = createMockAnalysis(true)
      
      helpers.storeAnalysis({
        executionId: 'exec-123',
        moduleHash: 'hash123',
        iteration: 1,
        trigger: 'error',
        treeXml: '<tree></tree>',
        metrics: createMockMetrics(),
        errors: [],
        analysis,
        model: 'claude-sonnet',
      })
      
      const row = rdb.queryOne<{ rewrite_recommended: number; recommendation: string }>(
        'SELECT rewrite_recommended, recommendation FROM supersmithers_analyses',
        []
      )
      
      expect(row?.rewrite_recommended).toBe(1)
      expect(row?.recommendation).toBe('fix error; improve performance')
    })
  })

  describe('storeVersion', () => {
    test('returns unique version id', () => {
      const versionId = helpers.storeVersion({
        moduleHash: 'hash123',
        parentVersionId: null,
        code: 'code',
        overlayRelPath: 'overlay.tsx',
        trigger: 'manual',
        analysis: createMockAnalysis(),
        metrics: createMockMetrics(),
        vcsKind: 'git',
        vcsCommitId: 'commit123',
      })
      
      expect(versionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    })

    test('stores version with parent', () => {
      const parentId = helpers.storeVersion({
        moduleHash: 'hash123',
        parentVersionId: null,
        code: 'parent code',
        overlayRelPath: 'overlay.tsx',
        trigger: 'manual',
        analysis: createMockAnalysis(),
        metrics: createMockMetrics(),
        vcsKind: 'git',
        vcsCommitId: 'commit1',
      })
      
      const childId = helpers.storeVersion({
        moduleHash: 'hash123',
        parentVersionId: parentId,
        code: 'child code',
        overlayRelPath: 'overlay.tsx',
        trigger: 'manual',
        analysis: createMockAnalysis(),
        metrics: createMockMetrics(),
        vcsKind: 'git',
        vcsCommitId: 'commit2',
      })
      
      const row = rdb.queryOne<{ parent_version_id: string | null }>(
        'SELECT parent_version_id FROM supersmithers_versions WHERE version_id = ?',
        [childId]
      )
      
      expect(row?.parent_version_id).toBe(parentId)
    })

    test('computes sha256 of code', () => {
      const code = 'export default function() { return null }'
      const versionId = helpers.storeVersion({
        moduleHash: 'hash123',
        parentVersionId: null,
        code,
        overlayRelPath: 'overlay.tsx',
        trigger: 'manual',
        analysis: createMockAnalysis(),
        metrics: createMockMetrics(),
        vcsKind: 'git',
        vcsCommitId: 'commit123',
      })
      
      const row = rdb.queryOne<{ code_sha256: string }>(
        'SELECT code_sha256 FROM supersmithers_versions WHERE version_id = ?',
        [versionId]
      )
      
      expect(row?.code_sha256).toHaveLength(64)
    })
  })
})

function createMockAnalysis(rewriteRecommended = false): AnalysisResult {
  return {
    summary: 'Test analysis summary',
    rewrite: {
      recommended: rewriteRecommended,
      goals: rewriteRecommended ? ['fix error', 'improve performance'] : [],
    },
  }
}

function createMockMetrics(): SuperSmithersMetrics {
  return {
    tokensInput: 1000,
    tokensOutput: 500,
    agentCount: 3,
    errorCount: 0,
    stallCount: 0,
    isStalled: false,
    avgIterationTimeMs: 2000,
  }
}
