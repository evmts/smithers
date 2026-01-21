export interface GlobOptions {
  pattern: string
  limit?: number
  cwd?: string
}

export async function glob(opts: GlobOptions): Promise<string[]> {
  const cwd = opts.cwd ?? process.cwd()
  
  // Prevent absolute paths in pattern
  if (opts.pattern.startsWith('/') || opts.pattern.includes('..')) {
    throw new Error('Pattern cannot contain absolute paths or parent traversal')
  }
  
  const limit = opts.limit ?? 100
  const results: string[] = []
  
  const globInstance = new Bun.Glob(opts.pattern)
  
  for await (const file of globInstance.scan({ cwd, absolute: false })) {
    if (file.includes('node_modules')) continue
    if (file.includes('.git/')) continue
    
    results.push(file)
    
    if (results.length >= limit) break
  }
  
  return results.sort()
}
