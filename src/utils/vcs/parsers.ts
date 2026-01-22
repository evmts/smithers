import type { VCSStatus, DiffStats } from './types.js'

export function parseGitStatus(output: string): VCSStatus {
  const modified: string[] = []
  const added: string[] = []
  const deleted: string[] = []
  const untracked: string[] = []

  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue

    const status = line.substring(0, 2)
    const file = line.substring(3).trim()

    if (status === '??') untracked.push(file)
    else if (status.includes('M')) modified.push(file)
    else if (status.includes('A')) added.push(file)
    else if (status.includes('D')) deleted.push(file)
    else if (status.includes('R')) modified.push(file)
  }

  return { modified, added, deleted, untracked }
}

export function parseJJStatus(output: string): VCSStatus {
  const modified: string[] = []
  const added: string[] = []
  const deleted: string[] = []

  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue

    if (line.startsWith('M ')) modified.push(line.substring(2).trim())
    else if (line.startsWith('A ')) added.push(line.substring(2).trim())
    else if (line.startsWith('D ')) deleted.push(line.substring(2).trim())
  }

  return { modified, added, deleted }
}

export function parseDiffStats(output: string): DiffStats {
  const files: string[] = []
  let insertions = 0
  let deletions = 0

  const lines = output.split(/\r?\n/)

  for (const line of lines) {
    if (!line.trim()) continue

    const match = line.match(/^\s*(.+?)\s*\|\s*(\d+)\s+([+-]+)/)
    if (match && match[1] && match[3]) {
      const [, file, _changes, symbols] = match
      files.push(file.trim())

      for (const symbol of symbols) {
        if (symbol === '+') insertions++
        else if (symbol === '-') deletions++
      }
    }
  }

  return { files, insertions, deletions }
}
