// Artifact tracking module for Smithers DB

import type { ReactiveDatabase } from '../reactive-sqlite'
import type { Artifact } from './types.js'
import { uuid, now, parseJson } from './utils.js'

export interface ArtifactsModule {
  add: (name: string, type: Artifact['type'], filePath: string, agentId?: string, metadata?: Record<string, any>) => string
  list: (executionId: string) => Artifact[]
}

export interface ArtifactsModuleContext {
  rdb: ReactiveDatabase
  getCurrentExecutionId: () => string | null
}

// Helper to map row to typed object with JSON parsing
const mapArtifact = (row: any): Artifact | null => {
  if (!row) return null
  return {
    ...row,
    metadata: parseJson(row.metadata, {}),
  }
}

export function createArtifactsModule(ctx: ArtifactsModuleContext): ArtifactsModule {
  const { rdb, getCurrentExecutionId } = ctx

  const artifacts: ArtifactsModule = {
    add: (name: string, type: Artifact['type'], filePath: string, agentId?: string, metadata?: Record<string, any>): string => {
      const currentExecutionId = getCurrentExecutionId()
      if (!currentExecutionId) throw new Error('No active execution')
      const id = uuid()
      rdb.run(
        `INSERT INTO artifacts (id, execution_id, agent_id, name, type, file_path, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, currentExecutionId, agentId ?? null, name, type, filePath, JSON.stringify(metadata ?? {}), now()]
      )
      return id
    },

    list: (executionId: string): Artifact[] => {
      return rdb.query<any>('SELECT * FROM artifacts WHERE execution_id = ? ORDER BY created_at', [executionId])
        .map(mapArtifact)
        .filter((a): a is Artifact => a !== null)
    },
  }

  return artifacts
}
