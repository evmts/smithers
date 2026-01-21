import { createHash } from 'node:crypto'
import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import type { AnalysisResult, SuperSmithersMetrics, SuperSmithersErrorEvent, SupersmithersModuleMeta } from './types.js'
import { uuid, now } from '../db/utils.js'

export interface SuperSmithersDBHelpers {
  getActiveVersion(moduleHash: string): string | null
  setActiveVersion(moduleHash: string, versionId: string): void
  clearActiveVersion(moduleHash: string): void
  getVersionCode(versionId: string): string | null
  getRewriteCount(moduleHash: string): number
  storeAnalysis(params: StoreAnalysisParams): void
  storeVersion(params: StoreVersionParams): void
  ensureModule(meta: SupersmithersModuleMeta): void
}

interface StoreAnalysisParams {
  executionId: string
  moduleHash: string
  iteration: number
  trigger: string
  treeXml: string
  metrics: SuperSmithersMetrics
  errors: SuperSmithersErrorEvent[]
  analysis: AnalysisResult
  model: string
}

interface StoreVersionParams {
  versionId: string
  moduleHash: string
  parentVersionId: string | null
  code: string
  overlayRelPath: string
  trigger: string
  analysis: AnalysisResult
  metrics: SuperSmithersMetrics
  vcsKind: 'jj' | 'git'
  vcsCommitId: string
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

export function cancelOldScopeTasks(rdb: ReactiveDatabase, executionId: string, oldScopeRev: string): void {
  if (rdb.isClosed) return
  rdb.run(
    `UPDATE tasks SET status = 'cancelled' WHERE execution_id = ? AND scope_rev = ? AND status = 'running'`,
    [executionId, oldScopeRev]
  )
  rdb.run(
    `UPDATE agents SET status = 'cancelled' WHERE execution_id = ? AND scope_rev = ? AND status = 'running'`,
    [executionId, oldScopeRev]
  )
}

export function createSuperSmithersDBHelpers(rdb: ReactiveDatabase): SuperSmithersDBHelpers {
  return {
    getActiveVersion(moduleHash: string): string | null {
      if (rdb.isClosed) return null
      const row = rdb.queryOne<{ active_version_id: string | null }>(
        'SELECT active_version_id FROM supersmithers_active_overrides WHERE module_hash = ?',
        [moduleHash]
      )
      return row?.active_version_id ?? null
    },

    setActiveVersion(moduleHash: string, versionId: string): void {
      if (rdb.isClosed) return
      rdb.run(
        `INSERT INTO supersmithers_active_overrides (module_hash, active_version_id, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(module_hash) DO UPDATE SET active_version_id = ?, updated_at = ?`,
        [moduleHash, versionId, now(), versionId, now()]
      )
    },

    clearActiveVersion(moduleHash: string): void {
      if (rdb.isClosed) return
      rdb.run('DELETE FROM supersmithers_active_overrides WHERE module_hash = ?', [moduleHash])
    },

    getVersionCode(versionId: string): string | null {
      if (rdb.isClosed) return null
      const row = rdb.queryOne<{ code_tsx: string }>(
        'SELECT code_tsx FROM supersmithers_versions WHERE version_id = ?',
        [versionId]
      )
      return row?.code_tsx ?? null
    },

    getRewriteCount(moduleHash: string): number {
      if (rdb.isClosed) return 0
      const row = rdb.queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM supersmithers_versions WHERE module_hash = ?',
        [moduleHash]
      )
      return row?.count ?? 0
    },

    storeAnalysis(params: StoreAnalysisParams): void {
      if (rdb.isClosed) return
      const id = uuid()
      rdb.run(
        `INSERT INTO supersmithers_analyses (
          id, execution_id, module_hash, iteration, trigger,
          tree_xml, metrics_json, errors_json, analysis_result_json,
          rewrite_recommended, recommendation, model, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          params.executionId,
          params.moduleHash,
          params.iteration,
          params.trigger,
          params.treeXml,
          JSON.stringify(params.metrics),
          JSON.stringify(params.errors),
          JSON.stringify(params.analysis),
          params.analysis.rewrite.recommended ? 1 : 0,
          params.analysis.rewrite.goals.join('; '),
          params.model,
          now(),
        ]
      )
    },

    storeVersion(params: StoreVersionParams): void {
      if (rdb.isClosed) return
      const codeSha256 = sha256(params.code)
      rdb.run(
        `INSERT INTO supersmithers_versions (
          version_id, module_hash, parent_version_id, code_tsx, code_sha256,
          overlay_rel_path, trigger, analysis_json, metrics_json, vcs_kind, vcs_commit_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          params.versionId,
          params.moduleHash,
          params.parentVersionId,
          params.code,
          codeSha256,
          params.overlayRelPath,
          params.trigger,
          JSON.stringify(params.analysis),
          JSON.stringify(params.metrics),
          params.vcsKind,
          params.vcsCommitId,
          now(),
        ]
      )
    },

    ensureModule(meta: SupersmithersModuleMeta): void {
      if (rdb.isClosed) return
      rdb.run(
        `INSERT OR IGNORE INTO supersmithers_modules
          (module_hash, scope, module_abs_path, export_name)
         VALUES (?, ?, ?, ?)`,
        [meta.moduleHash, meta.scope, meta.moduleAbsPath, meta.exportName]
      )
    },
  }
}
