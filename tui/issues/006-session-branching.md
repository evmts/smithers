# Session Branching & Labels

## Priority: Medium

## Problem
Sessions are linear only. Cannot:
- Branch from a previous point to try different approaches
- Label/bookmark important points in conversation
- Navigate session tree

## Pi Implementation
- `packages/coding-agent/src/core/session-manager.ts`
- Tree structure with `id`/`parentId` on entries
- `LabelEntry` for user bookmarks
- `createBranchedSession()` to fork from any point
- `getBranch(leafId)` to get path from root to leaf

## Data Model

```
SessionEntry {
  id: string (8 char uuid prefix)
  parentId: string | null
  type: "message" | "label" | "compaction" | ...
  timestamp: string
  ...type-specific fields
}

Tree structure:
  root
  ├─ msg1
  │  ├─ msg2
  │  │  └─ msg3 (leaf A)
  │  └─ msg2b (branch)
  │     └─ msg3b (leaf B)
  └─ label on msg1
```

## Implementation Plan

1. Add columns to messages table:
   ```sql
   ALTER TABLE messages ADD COLUMN entry_id TEXT;
   ALTER TABLE messages ADD COLUMN parent_id TEXT;
   ```

2. Add `labels` table:
   ```sql
   CREATE TABLE labels (
     id TEXT PRIMARY KEY,
     target_id TEXT,
     label TEXT,
     created_at INTEGER
   );
   ```

3. Add branching commands:
   - `/branch` - create branch from current point
   - `/goto <label>` - switch to labeled point
   - `/label <name>` - label current point

4. Update message display to show branch indicator

5. Add branch navigation UI (tree view overlay)

## Reference Files
- `reference/pi-mono/packages/coding-agent/src/core/session-manager.ts`
