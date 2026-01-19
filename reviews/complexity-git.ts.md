# Complexity Review: src/utils/vcs/git.ts

## File Path
[src/utils/vcs/git.ts#L150-L166](file:///Users/williamcory/smithers/src/utils/vcs/git.ts#L150-L166)

## Current Code

```typescript
for (const line of output.split('\n')) {
  if (line.startsWith('worktree ')) {
    if (current.path) {
      worktrees.push(current as WorktreeInfo)
    }
    current = { path: line.slice(9) }
  } else if (line.startsWith('HEAD ')) {
    current.head = line.slice(5)
  } else if (line.startsWith('branch ')) {
    current.branch = line.slice(7).replace('refs/heads/', '')
  } else if (line === 'detached') {
    current.branch = null
  } else if (line === 'locked') {
    current.locked = true
  } else if (line === 'prunable') {
    current.prunable = true
  }
}
```

## Suggested Simplification

Use a **parser map** with handlers:

```typescript
type LineHandler = (current: Partial<WorktreeInfo>, line: string) => void

const LINE_PARSERS: Array<{ match: (line: string) => boolean; handle: LineHandler }> = [
  {
    match: (line) => line.startsWith('worktree '),
    handle: (current, line) => { current.path = line.slice(9) },
  },
  {
    match: (line) => line.startsWith('HEAD '),
    handle: (current, line) => { current.head = line.slice(5) },
  },
  {
    match: (line) => line.startsWith('branch '),
    handle: (current, line) => { current.branch = line.slice(7).replace('refs/heads/', '') },
  },
  { match: (line) => line === 'detached', handle: (current) => { current.branch = null } },
  { match: (line) => line === 'locked', handle: (current) => { current.locked = true } },
  { match: (line) => line === 'prunable', handle: (current) => { current.prunable = true } },
]

for (const line of output.split('\n')) {
  // Handle worktree boundary (special case - creates new entry)
  if (line.startsWith('worktree ')) {
    if (current.path) worktrees.push(current as WorktreeInfo)
    current = { path: line.slice(9) }
    continue
  }
  
  // Apply first matching parser
  const parser = LINE_PARSERS.find(p => p.match(line))
  parser?.handle(current, line)
}
```

## Benefits
- Declarative parsing rules
- Easy to extend for new git porcelain fields
- Self-documenting structure
