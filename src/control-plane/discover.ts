import * as path from 'path'
import { Database } from 'bun:sqlite'
import type { ScriptInfo } from './types.js'
import { deriveDbPath } from './utils.js'

export interface DiscoverOptions {
  cwd?: string
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
  } catch (err) {
    console.debug('Check failed:', err)
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
        } catch (err) {
          console.debug('Check failed:', err)
          continue
        }
      }
    } catch (err) {
      console.debug('Check failed:', err)
      continue
    }
  }
  
  return scripts
}
