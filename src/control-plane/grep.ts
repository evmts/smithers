import * as nodePath from 'path'
import { isSensitiveFile } from './security.js'

export interface GrepOptions {
  pattern: string
  path?: string
  glob?: string
  caseSensitive?: boolean
  cwd?: string
  limit?: number
}

export interface GrepMatch {
  file: string
  line: number
  content: string
}

/**
 * Search for pattern matches in files
 * @throws {Error} If search path is outside workspace
 */
export async function grep(opts: GrepOptions): Promise<GrepMatch[]> {
  const cwd = opts.cwd ?? process.cwd()
  const limit = opts.limit ?? 100
  const results: GrepMatch[] = []
  
  const flags = opts.caseSensitive ? '' : 'i'
  const regex = new RegExp(opts.pattern, flags)
  
  const searchPath = opts.path ? nodePath.join(cwd, opts.path) : cwd
  
  // Validate searchPath stays within cwd
  const resolvedSearch = nodePath.resolve(searchPath)
  const resolvedCwd = nodePath.resolve(cwd)
  if (!resolvedSearch.startsWith(resolvedCwd + nodePath.sep) && resolvedSearch !== resolvedCwd) {
    throw new Error('Search path must be within workspace')
  }
  
  const globPattern = opts.glob ?? '**/*'
  
  const globInstance = new Bun.Glob(globPattern)
  
  for await (const filePath of globInstance.scan({ cwd: searchPath, absolute: true })) {
    if (filePath.includes('node_modules')) continue
    if (filePath.includes('.git/')) continue
    if (isSensitiveFile(filePath)) continue
    
    try {
      const file = Bun.file(filePath)
      const stat = await file.stat()
      
      if (stat.isDirectory()) continue
      if (stat.size > 1024 * 1024) continue
      
      const content = await file.text()
      const lines = content.split('\n')
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line && regex.test(line)) {
          const relativePath = filePath.startsWith(cwd) 
            ? filePath.slice(cwd.length + 1) 
            : filePath
          results.push({
            file: relativePath,
            line: i + 1,
            content: line.slice(0, 200)
          })
          
          if (results.length >= limit) {
            return results
          }
        }
      }
    } catch {
      continue
    }
  }
  
  return results
}
