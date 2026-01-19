# Complexity Review: src/utils/vcs/parsers.ts

## File Path
[src/utils/vcs/parsers.ts#L15-L44](file:///Users/williamcory/smithers/src/utils/vcs/parsers.ts#L15-L44)

## Current Code

```typescript
// parseGitStatus
const status = line.substring(0, 2)
const file = line.substring(3)

if (status.includes('M')) modified.push(file)
else if (status.includes('A')) added.push(file)
else if (status.includes('D')) deleted.push(file)

// parseJJStatus
if (line.startsWith('M ')) modified.push(line.substring(2).trim())
else if (line.startsWith('A ')) added.push(line.substring(2).trim())
else if (line.startsWith('D ')) deleted.push(line.substring(2).trim())
```

## Suggested Simplification

Use a **status-to-bucket mapping**:

```typescript
type StatusBuckets = { modified: string[]; added: string[]; deleted: string[] }

const STATUS_BUCKET_MAP: Record<string, keyof StatusBuckets> = {
  M: 'modified',
  A: 'added',
  D: 'deleted',
}

// parseGitStatus - simplified
export function parseGitStatus(output: string): VCSStatus {
  const buckets: StatusBuckets = { modified: [], added: [], deleted: [] }
  
  for (const line of output.split('\n')) {
    if (!line.trim()) continue
    
    const status = line.substring(0, 2)
    const file = line.substring(3)
    
    for (const [char, bucket] of Object.entries(STATUS_BUCKET_MAP)) {
      if (status.includes(char)) {
        buckets[bucket].push(file)
        break
      }
    }
  }
  
  return buckets
}

// parseJJStatus - simplified  
export function parseJJStatus(output: string): VCSStatus {
  const buckets: StatusBuckets = { modified: [], added: [], deleted: [] }
  
  for (const line of output.split('\n')) {
    if (!line.trim()) continue
    
    const prefix = line[0]
    const bucket = STATUS_BUCKET_MAP[prefix ?? '']
    if (bucket) {
      buckets[bucket].push(line.substring(2).trim())
    }
  }
  
  return buckets
}
```

## Benefits
- Single source of truth for status→bucket mapping
- Eliminates duplicate if/else chains
- Easy to add new status codes (e.g., 'R' for renamed)
- DRY between git and jj parsers
