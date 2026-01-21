import * as path from 'path'
import { unlink, mkdir } from 'fs/promises'
import { Database } from 'bun:sqlite'
import type { RunResult, CreateWorkflowResult } from './types.js'

const runningProcesses = new Map<string, { proc: ReturnType<typeof Bun.spawn>; pid: number }>()

export interface RunOptions {
  script: string
  name?: string
  executionId?: string
  cwd?: string
}

export interface ResumeOptions {
  executionId?: string
  cwd?: string
}

export interface CancelOptions {
  executionId: string
  cwd?: string
}

export interface CreateWorkflowOptions {
  name: string
  content: string
  overwrite?: boolean
  cwd?: string
}

function generateExecutionId(): string {
  return `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function deriveDbPath(scriptPath: string, cwd: string): string {
  const relativePath = path.relative(cwd, scriptPath)
  const baseName = relativePath.replace(/\.tsx$/, '.db').replace(/[/\\]/g, '-')
  return path.join(cwd, '.smithers', 'data', baseName)
}

export async function run(opts: RunOptions): Promise<RunResult> {
  const cwd = opts.cwd ?? process.cwd()
  const scriptPath = path.isAbsolute(opts.script) ? opts.script : path.join(cwd, opts.script)
  const dbPath = deriveDbPath(scriptPath, cwd)
  const executionId = opts.executionId ?? generateExecutionId()
  
  await mkdir(path.dirname(dbPath), { recursive: true })
  await Bun.write(path.join(path.dirname(dbPath), '.gitkeep'), '')
  
  const preloadPath = path.join(import.meta.dirname, '..', '..', 'preload.ts')
  
  const proc = Bun.spawn(['bun', '--preload', preloadPath, scriptPath], {
    cwd,
    env: {
      ...process.env,
      SMITHERS_EXECUTION_ID: executionId,
      SMITHERS_DB_PATH: dbPath,
    },
    stdout: 'inherit',
    stderr: 'inherit',
  })
  
  runningProcesses.set(executionId, { proc, pid: proc.pid })
  proc.exited.then(() => runningProcesses.delete(executionId))
  
  return {
    executionId,
    dbPath,
    pid: proc.pid
  }
}

export async function resume(opts: ResumeOptions = {}): Promise<RunResult> {
  const cwd = opts.cwd ?? process.cwd()
  
  if (opts.executionId) {
    const dataDir = path.join(cwd, '.smithers', 'data')
    const glob = new Bun.Glob('*.db')
    
    for await (const dbFile of glob.scan({ cwd: dataDir, absolute: true })) {
      try {
        const db = new Database(dbFile, { readonly: true })
        try {
          const exec = db.query<{ file_path: string }, [string]>(
            "SELECT file_path FROM executions WHERE id = ?"
          ).get(opts.executionId)
          
          if (exec) {
            return run({ script: exec.file_path, executionId: opts.executionId, cwd })
          }
        } finally {
          db.close()
        }
      } catch {
        continue
      }
    }
    throw new Error(`Execution ${opts.executionId} not found`)
  }
  
  const dataDir = path.join(cwd, '.smithers', 'data')
  const glob = new Bun.Glob('*.db')
  let latestExec: { id: string; filePath: string; createdAt: string } | null = null
  
  for await (const dbFile of glob.scan({ cwd: dataDir, absolute: true })) {
    try {
      const db = new Database(dbFile, { readonly: true })
      try {
        const exec = db.query<{ id: string; file_path: string; created_at: string }, []>(
          "SELECT id, file_path, created_at FROM executions WHERE status IN ('pending', 'running') ORDER BY created_at DESC LIMIT 1"
        ).get()
        
        if (exec && (!latestExec || exec.created_at > latestExec.createdAt)) {
          latestExec = { id: exec.id, filePath: exec.file_path, createdAt: exec.created_at }
        }
      } finally {
        db.close()
      }
    } catch {
      continue
    }
  }
  
  if (!latestExec) {
    throw new Error('No incomplete executions found')
  }
  
  return run({ script: latestExec.filePath, executionId: latestExec.id, cwd })
}

export async function cancel(opts: CancelOptions): Promise<void> {
  const cwd = opts.cwd ?? process.cwd()
  const dataDir = path.join(cwd, '.smithers', 'data')
  const glob = new Bun.Glob('*.db')
  
  for await (const dbFile of glob.scan({ cwd: dataDir, absolute: true })) {
    try {
      const db = new Database(dbFile)
      try {
        const exec = db.query<{ id: string }, [string]>(
          "SELECT id FROM executions WHERE id = ?"
        ).get(opts.executionId)
        
        if (exec) {
          const running = runningProcesses.get(opts.executionId)
          if (running) {
            running.proc.kill()
            runningProcesses.delete(opts.executionId)
          }
          db.run(
            "UPDATE executions SET status = 'cancelled', completed_at = datetime('now') WHERE id = ?",
            [opts.executionId]
          )
          return
        }
      } finally {
        db.close()
      }
    } catch {
      continue
    }
  }
  
  throw new Error(`Execution ${opts.executionId} not found`)
}

export async function createWorkflow(opts: CreateWorkflowOptions): Promise<CreateWorkflowResult> {
  const cwd = opts.cwd ?? process.cwd()
  
  // Sanitize name to prevent path traversal
  const safeName = opts.name.replace(/[^a-zA-Z0-9_-]/g, '_')
  if (safeName !== opts.name) {
    return {
      path: '',
      created: false,
      errors: ['Workflow name can only contain alphanumeric characters, underscores, and hyphens']
    }
  }
  
  const targetPath = path.join(cwd, '.smithers', `${opts.name}.tsx`)
  
  const file = Bun.file(targetPath)
  if (await file.exists() && !opts.overwrite) {
    return {
      path: targetPath,
      created: false,
      errors: [`File already exists: ${targetPath}`]
    }
  }
  
  const tempPath = path.join(cwd, '.smithers', `.${opts.name}.tsx.tmp`)
  await Bun.write(tempPath, opts.content)
  
  try {
    const proc = Bun.spawn(['bun', 'build', '--no-bundle', tempPath], {
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text()
    ])
    
    await proc.exited
    
    if (proc.exitCode !== 0) {
      await unlink(tempPath).catch(() => {})
      const errorOutput = stderr || stdout
      const errors = errorOutput.split('\n').filter(Boolean)
      return {
        path: targetPath,
        created: false,
        errors: errors.length > 0 ? errors : ['Validation failed']
      }
    }
    
    await Bun.write(targetPath, opts.content)
    await unlink(tempPath).catch(() => {})
    
    return {
      path: targetPath,
      created: true
    }
  } catch (err) {
    await unlink(tempPath).catch(() => {})
    return {
      path: targetPath,
      created: false,
      errors: [err instanceof Error ? err.message : 'Unknown error']
    }
  }
}
