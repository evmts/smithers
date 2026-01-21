import * as path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { uuid } from '../db/utils.js'

export interface SuperSmithersVCS {
  kind: 'jj' | 'git'
  repoPath: string
}

const OVERLAY_DIR = '.smithers/supersmithers/vcs'
const LOCK_FILE = '.smithers/supersmithers/vcs/.lock'

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

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const lockPath = `${process.cwd()}/${LOCK_FILE}`
  const lockDir = path.dirname(lockPath)

  await ensureDir(lockDir)

  const maxWait = 30000 // 30 seconds
  const start = Date.now()

  while (Date.now() - start < maxWait) {
    try {
      const file = Bun.file(lockPath)
      if (!(await file.exists())) {
        await Bun.write(lockPath, String(process.pid))
        try {
          return await fn()
        } finally {
          await Bun.$`rm -f ${lockPath}`.quiet()
        }
      }
      await Bun.sleep(100)
    } catch {
      await Bun.sleep(100)
    }
  }

  throw new Error('Timeout waiting for VCS lock')
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
  return withLock(async () => {
    const filePath = path.join(vcs.repoPath, relPath)
    const fileDir = path.dirname(filePath)
    await ensureDir(fileDir)
    await Bun.write(filePath, content)

    if (vcs.kind === 'jj') {
      try {
        await Bun.$`jj describe -m ${message}`.cwd(vcs.repoPath).quiet()
        await Bun.$`jj new`.cwd(vcs.repoPath).quiet()
      } catch {
        // May fail if no changes - that's OK
      }

      const commitId = await Bun.$`jj log -r @- --no-graph -T 'commit_id'`.cwd(vcs.repoPath).text()
      return commitId.trim() || uuid()
    }

    await Bun.$`git add ${relPath}`.cwd(vcs.repoPath).quiet()

    const status = await Bun.$`git status --porcelain`.cwd(vcs.repoPath).text()
    if (!status.trim()) {
      return uuid()
    }

    await Bun.$`git commit -m ${message}`.cwd(vcs.repoPath).quiet()
    const commitId = await Bun.$`git rev-parse HEAD`.cwd(vcs.repoPath).text()
    return commitId.trim()
  })
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
