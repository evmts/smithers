import * as path from 'path'
import { Database } from 'bun:sqlite'
import type { ScriptInfo } from './types.js'

export interface DiscoverOptions {
  cwd?: string
}

function deriveDbPath(scriptPath: string, cwd: string): string {
  const relativePath = path.relative(cwd, scriptPath)
  const baseName = relativePath.replace(/\.tsx$/, '.db').replace(/[/\\]/g, '-')
  return path.join(cwd, '.smithers', 'data', baseName)
}

function checkHasIncomplete(dbPath: string): boolean {
  try {
    const file = Bun.file(dbPath)
    if (!file.size) return false
    
    const db = new Database(dbPath, { readonly: true })
    try {
      const result = db.query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM executions WHERE status IN ('pending', 'running')"
      ).get()
      return (result?.count ?? 0) > 0
    } finally {
      db.close()
    }
  } catch {
    return false
  }
}

export async function discoverScripts(opts: DiscoverOptions = {}): Promise<ScriptInfo[]> {
  const cwd = opts.cwd ?? process.cwd()
  const scripts: ScriptInfo[] = []
  
  const glob = new Bun.Glob('**/*.tsx')
  const searchPaths = [
    path.join(cwd, '.smithers'),
    cwd
  ]
  
  const seenPaths = new Set<string>()
  
  for (const searchPath of searchPaths) {
    try {
      for await (const file of glob.scan({ cwd: searchPath, absolute: true })) {
        if (seenPaths.has(file)) continue
        seenPaths.add(file)
        
        if (file.includes('node_modules')) continue
        
        try {
          const content = await Bun.file(file).text()
          if (!content.includes('SmithersProvider')) continue
          
          const dbPath = deriveDbPath(file, cwd)
          const hasIncomplete = checkHasIncomplete(dbPath)
          
          scripts.push({
            path: file,
            name: path.basename(file, '.tsx'),
            dbPath,
            hasIncomplete
          })
        } catch {
          continue
        }
      }
    } catch {
      continue
    }
  }
  
  return scripts
}
