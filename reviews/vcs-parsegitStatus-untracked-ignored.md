# parseGitStatus Ignores Untracked and Renamed Files

## File
`src/utils/vcs/parsers.ts` L8-25

## Issue
Parser only handles M/A/D statuses. Ignores:
- `??` - untracked files
- `R` - renamed files  
- `C` - copied files
- `U` - unmerged (conflicts)

```typescript
if (status.includes('M')) modified.push(file)
else if (status.includes('A')) added.push(file)
else if (status.includes('D')) deleted.push(file)
// ?? R C U all silently dropped
```

## Suggested Fix
Either expand `VCSStatus` type or at minimum handle untracked:

```typescript
export interface VCSStatus {
  modified: string[]
  added: string[]
  deleted: string[]
  untracked?: string[]
  renamed?: Array<{ from: string; to: string }>
}

export function parseGitStatus(output: string): VCSStatus {
  const modified: string[] = []
  const added: string[] = []
  const deleted: string[] = []
  const untracked: string[] = []

  for (const line of output.split('\n')) {
    if (!line.trim()) continue

    const status = line.substring(0, 2)
    const file = line.substring(3)

    if (status === '??') untracked.push(file)
    else if (status.includes('M')) modified.push(file)
    else if (status.includes('A')) added.push(file)
    else if (status.includes('D')) deleted.push(file)
    else if (status.includes('R')) modified.push(file) // treat rename as modify
  }

  return { modified, added, deleted, untracked }
}
```
