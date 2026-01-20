import * as path from 'path'
import { Database } from 'bun:sqlite'
import type { ExecutionStatus, PhaseTree, StepNode, Frame } from './types.js'

export interface StatusOptions {
  cwd?: string
}

export interface FramesOptions {
  since?: number
  limit?: number
  cwd?: string
}

interface DbExecution {
  id: string
  file_path: string
  status: string
  total_iterations: number
  error: string | null
}

interface DbPhase {
  id: string
  name: string
  status: string
}

interface DbStep {
  id: string
  phase_id: string
  name: string
  status: string
}

interface DbRenderFrame {
  id: string
  sequence_number: number
  tree_xml: string
  created_at: string
}

function findDbForExecution(executionId: string, cwd: string): Database | null {
  const dataDir = path.join(cwd, '.smithers', 'data')
  const glob = new Bun.Glob('*.db')
  
  for (const dbFile of glob.scanSync({ cwd: dataDir, absolute: true })) {
    try {
      const db = new Database(dbFile, { readonly: true })
      const exec = db.query<{ id: string }, [string]>(
        "SELECT id FROM executions WHERE id = ?"
      ).get(executionId)
      
      if (exec) {
        return db
      }
      db.close()
    } catch {
      continue
    }
  }
  return null
}

function mapStatus(dbStatus: string): 'pending' | 'running' | 'complete' | 'failed' {
  switch (dbStatus) {
    case 'pending': return 'pending'
    case 'running': return 'running'
    case 'completed': return 'complete'
    case 'failed': return 'failed'
    case 'cancelled': return 'failed'
    default: return 'pending'
  }
}

export function status(executionId: string, opts: StatusOptions = {}): ExecutionStatus {
  const cwd = opts.cwd ?? process.cwd()
  const db = findDbForExecution(executionId, cwd)
  
  if (!db) {
    throw new Error(`Execution ${executionId} not found`)
  }
  
  try {
    const exec = db.query<DbExecution, [string]>(
      "SELECT id, file_path, status, total_iterations, error FROM executions WHERE id = ?"
    ).get(executionId)
    
    if (!exec) {
      throw new Error(`Execution ${executionId} not found`)
    }
    
    const phases = db.query<DbPhase, [string]>(
      "SELECT id, name, status FROM phases WHERE execution_id = ? ORDER BY created_at ASC"
    ).all(executionId)
    
    const phaseIds = phases.map(p => p.id)
    let steps: DbStep[] = []
    if (phaseIds.length > 0) {
      const placeholders = phaseIds.map(() => '?').join(',')
      const stmt = db.query<DbStep, string[]>(
        `SELECT id, phase_id, name, status FROM steps WHERE phase_id IN (${placeholders}) ORDER BY created_at ASC`
      )
      steps = stmt.all(...phaseIds as [string, ...string[]])
    }
    
    const stepsByPhase = new Map<string, StepNode[]>()
    for (const step of steps) {
      const phaseSteps = stepsByPhase.get(step.phase_id) ?? []
      phaseSteps.push({
        id: step.id,
        name: step.name ?? 'Unnamed Step',
        status: mapStatus(step.status)
      })
      stepsByPhase.set(step.phase_id, phaseSteps)
    }
    
    const phaseTree: PhaseTree = {
      phases: phases.map(p => ({
        id: p.id,
        name: p.name,
        status: mapStatus(p.status),
        children: stepsByPhase.get(p.id) ?? []
      }))
    }
    
    const latestFrame = db.query<{ tree_xml: string }, [string]>(
      "SELECT tree_xml FROM render_frames WHERE execution_id = ? ORDER BY sequence_number DESC LIMIT 1"
    ).get(executionId)
    
    return {
      executionId: exec.id,
      script: exec.file_path,
      state: mapStatus(exec.status),
      iteration: exec.total_iterations,
      tree: phaseTree,
      lastOutput: latestFrame?.tree_xml,
      error: exec.error ?? undefined
    }
  } finally {
    db.close()
  }
}

export function frames(
  executionId: string,
  opts: FramesOptions = {}
): { frames: Frame[]; cursor: number } {
  const cwd = opts.cwd ?? process.cwd()
  const since = opts.since ?? 0
  const limit = opts.limit ?? 100
  
  const db = findDbForExecution(executionId, cwd)
  
  if (!db) {
    throw new Error(`Execution ${executionId} not found`)
  }
  
  try {
    const dbFrames = db.query<DbRenderFrame, [string, number, number]>(
      `SELECT id, sequence_number, tree_xml, created_at 
       FROM render_frames 
       WHERE execution_id = ? AND sequence_number > ? 
       ORDER BY sequence_number ASC 
       LIMIT ?`
    ).all(executionId, since, limit)
    
    const resultFrames: Frame[] = dbFrames.map(f => ({
      id: f.id,
      timestamp: new Date(f.created_at).getTime(),
      type: 'render',
      data: f.tree_xml
    }))
    
    const lastFrame = dbFrames[dbFrames.length - 1]
    const maxSeq = lastFrame ? lastFrame.sequence_number : since
    
    return {
      frames: resultFrames,
      cursor: maxSeq
    }
  } finally {
    db.close()
  }
}
