import * as path from 'path'
import { Database } from 'bun:sqlite'

export function deriveDbPath(scriptPath: string, cwd: string): string {
  const relativePath = path.relative(cwd, scriptPath)
  const baseName = relativePath.replace(/\.tsx$/, '.db').replace(/[/\\]/g, '-')
  return path.join(cwd, '.smithers', 'data', baseName)
}

export function findDbForExecution(executionId: string, smithersDir: string): string | null {
  const dataDir = path.join(smithersDir, 'data')
  const glob = new Bun.Glob('*.db')
  
  for (const dbFile of glob.scanSync({ cwd: dataDir, absolute: true })) {
    try {
      const db = new Database(dbFile, { readonly: true })
      try {
        const exec = db.query<{ id: string }, [string]>(
          "SELECT id FROM executions WHERE id = ?"
        ).get(executionId)
        
        if (exec) {
          return dbFile
        }
      } finally {
        db.close()
      }
    } catch {
      continue
    }
  }
  return null
}
