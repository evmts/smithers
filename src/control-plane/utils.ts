import * as path from 'path'

export function deriveDbPath(scriptPath: string, cwd: string): string {
  const relativePath = path.relative(cwd, scriptPath)
  const baseName = relativePath.replace(/\.tsx$/, '.db').replace(/[/\\]/g, '-')
  return path.join(cwd, '.smithers', 'data', baseName)
}
