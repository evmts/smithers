# VCS Operation Queue

## Problem

Concurrent VCS operations (git commits, jj snapshots) can race → corruption, conflicts, lost work.

## Solution

FIFO queue ensures serialized VCS operations:

```
┌─────────────────────────────────────────────────────────────┐
│ Git: Batch commits at render boundary                       │
│  - Components request commits during render                 │
│  - Queue processes at start of next render loop             │
│  - Prevents mid-render state inconsistency                  │
├─────────────────────────────────────────────────────────────┤
│ Jujutsu: Real-time snapshots via queue                      │
│  - Snapshots enqueued immediately on request                │
│  - Worker processes FIFO, never concurrent                  │
│  - Automatic conflict-free operation history                │
└─────────────────────────────────────────────────────────────┘
```

## Design

### Queue Structure (SQLite)

```sql
CREATE TABLE vcs_queue (
  id INTEGER PRIMARY KEY,
  operation TEXT NOT NULL,  -- 'commit' | 'snapshot' | 'tag' | 'branch'
  payload TEXT NOT NULL,    -- JSON args
  status TEXT NOT NULL,     -- 'pending' | 'running' | 'done' | 'failed'
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  error TEXT
);
```

### Git Commit Batching

```typescript
// Request during render
useCommit({ message: "Update state", files: ["..."] })

// useCommit implementation
function useCommit(opts) {
  const db = useSmithersDb()
  useMount(() => {
    db.db.run(
      "INSERT INTO vcs_queue (operation, payload, status, created_at) VALUES (?, ?, 'pending', ?)",
      ['commit', JSON.stringify(opts), Date.now()]
    )
  })
}

// Render loop boundary processor (SmithersProvider)
useEffect(() => {
  processPendingCommits() // Drains queue, groups by tick
}, [])
```

### JJ Snapshot Queue

```typescript
// Enqueue snapshot immediately
function requestSnapshot(opts) {
  db.db.run(
    "INSERT INTO vcs_queue (operation, payload, status, created_at) VALUES (?, ?, 'pending', ?)",
    ['snapshot', JSON.stringify(opts), Date.now()]
  )
  processQueue() // Non-blocking trigger
}

// Background worker
async function processQueue() {
  if (processing) return // Guard
  processing = true

  while (true) {
    const op = db.db.query("SELECT * FROM vcs_queue WHERE status = 'pending' ORDER BY id LIMIT 1").get()
    if (!op) break

    await executeOperation(op)
  }

  processing = false
}
```

## Benefits

- **No races**: Serialized execution
- **Audit trail**: All ops in `vcs_queue` table
- **Retry logic**: Failed ops remain in queue
- **Batching**: Git commits group at render boundaries
- **Real-time**: JJ snapshots process immediately but safely

## Implementation Checklist

- [ ] Add `vcs_queue` table to schema
- [ ] Implement `useCommit` hook for git
- [ ] Add queue processor to `SmithersProvider`
- [ ] Implement JJ snapshot queue worker
- [ ] Add error handling & retry logic
- [ ] Document patterns in `docs/`
- [ ] Tests for concurrent operation scenarios
