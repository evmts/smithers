# Inconsistency: Phase Doc Uses useState

## File
`docs/components/phase.mdx`

## Issue
Lines 37-89 show multi-phase workflow using `useState`:

```tsx
import { useState } from "react";
const [phase, setPhase] = useState("research");
```

This violates CLAUDE.md rules: "NEVER use useState. All state must be in SQLite."

## Suggested Fix
Update to SQLite-based state pattern:

```tsx
import { useSmithers, useQueryValue } from "smithers";

function FeatureWorkflow() {
  const { db } = useSmithers();
  
  const phase = useQueryValue<string>(db.db, 
    "SELECT value FROM state WHERE key = 'phase'") ?? "research";
  
  const setPhase = (p: string) => 
    db.state.set('phase', p);

  return (
    <SmithersProvider db={db} executionId={executionId} maxIterations={10}>
      ...
    </SmithersProvider>
  );
}
```
