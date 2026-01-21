import * as path from 'node:path'
import { mkdir } from 'node:fs/promises'

export interface SuperSmithersVCS {
  kind: 'jj' | 'git'
  repoPath: string
}

const OVERLAY_DIR = '.smithers/supersmithers/vcs'

async function jjAvailable(): Promise<boolean> {
  try {
    await Bun.$`jj --version`.quiet()
    return true
  } catch {
    return false
  }
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

export async function initOverlayRepo(workspaceRoot?: string): Promise<SuperSmithersVCS> {
  const root = workspaceRoot ?? process.cwd()
  const repoPath = path.join(root, OVERLAY_DIR)
  await ensureDir(repoPath)

  const hasJJ = await jjAvailable()

  if (hasJJ) {
    try {
      await Bun.$`jj root`.cwd(repoPath).quiet()
      return { kind: 'jj', repoPath }
    } catch {
      await Bun.$`jj git init`.cwd(repoPath).quiet()
      return { kind: 'jj', repoPath }
    }
  }

  try {
    await Bun.$`git rev-parse --git-dir`.cwd(repoPath).quiet()
    return { kind: 'git', repoPath }
  } catch {
    await Bun.$`git init`.cwd(repoPath).quiet()
    return { kind: 'git', repoPath }
  }
}

export async function writeAndCommit(
  vcs: SuperSmithersVCS,
  relPath: string,
  content: string,
  message: string
): Promise<string> {
  const filePath = path.join(vcs.repoPath, relPath)
  const fileDir = path.dirname(filePath)
  await ensureDir(fileDir)
  await Bun.write(filePath, content)

  if (vcs.kind === 'jj') {
    await Bun.$`jj commit -m ${message}`.cwd(vcs.repoPath).quiet()
    const commitId = await Bun.$`jj log -r @- --no-graph -T commit_id`.cwd(vcs.repoPath).text()
    return commitId.trim()
  }

  await Bun.$`git add ${relPath}`.cwd(vcs.repoPath).quiet()
  await Bun.$`git commit -m ${message}`.cwd(vcs.repoPath).quiet()
  const commitId = await Bun.$`git rev-parse HEAD`.cwd(vcs.repoPath).text()
  return commitId.trim()
}

export async function getOverlayContent(
  vcs: SuperSmithersVCS,
  relPath: string
): Promise<string | null> {
  const filePath = path.join(vcs.repoPath, relPath)
  const file = Bun.file(filePath)
  if (!(await file.exists())) return null
  return file.text()
}

export async function rollbackToCommit(
  vcs: SuperSmithersVCS,
  commitId: string
): Promise<void> {
  if (vcs.kind === 'jj') {
    await Bun.$`jj restore --from ${commitId}`.cwd(vcs.repoPath).quiet()
    return
  }

  await Bun.$`git checkout ${commitId} -- .`.cwd(vcs.repoPath).quiet()
}

export async function listCommits(
  vcs: SuperSmithersVCS,
  limit: number = 10
): Promise<Array<{ id: string; message: string }>> {
  if (vcs.kind === 'jj') {
    const output = await Bun.$`jj log --no-graph -T 'commit_id ++ "\t" ++ description ++ "\n"' -r ::@ --limit ${limit}`.cwd(vcs.repoPath).text()
    return output.trim().split('\n').filter(Boolean).map(line => {
      const [id = '', ...rest] = line.split('\t')
      return { id: id.trim(), message: rest.join('\t').trim() }
    })
  }

  const output = await Bun.$`git log --oneline -n ${limit} --format=%H%x09%s`.cwd(vcs.repoPath).text()
  return output.trim().split('\n').filter(Boolean).map(line => {
    const [id = '', ...rest] = line.split('\t')
    return { id: id.trim(), message: rest.join('\t').trim() }
  })
}
