import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

export function findGitRoot(cwd: string = process.cwd()): string | null {
  let current = path.resolve(cwd)
  const root = path.parse(current).root

  while (current !== root) {
    const gitDir = path.join(current, '.git')
    if (fs.existsSync(gitDir)) {
      return current
    }
    current = path.dirname(current)
  }

  return null
}

export function isGitRepo(dir: string): boolean {
  return findGitRoot(dir) !== null
}

export function escapeShellArg(arg: string): string {
  return arg.replace(/"/g, '\\"')
}

export function getCommitHash(commit: string = 'HEAD'): string {
  return execSync(`git rev-parse ${commit}`, { encoding: 'utf-8' }).trim()
}

export function getCommitShortHash(commit: string = 'HEAD'): string {
  return execSync(`git rev-parse --short ${commit}`, { encoding: 'utf-8' }).trim()
}

export function getCommitMessage(commit: string = 'HEAD'): string {
  return execSync(`git log -1 --format=%B ${commit}`, { encoding: 'utf-8' })
}

export function getCommitDiff(commit: string = 'HEAD'): string {
  return execSync(`git show ${commit}`, { encoding: 'utf-8' })
}
