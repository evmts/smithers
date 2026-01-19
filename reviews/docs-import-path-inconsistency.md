# Inconsistency: Mixed Import Paths

## Files
- `docs/installation.mdx`
- `docs/quickstart.mdx`  
- `docs/examples/hello-world.mdx`
- `docs/components/claude.mdx`

## Issue
Import paths are inconsistent across docs:

```tsx
// Some use package name directly
import { createSmithersRoot } from "smithers";

// Some use full subpath
import { createSmithersRoot } from "smithers-orchestrator";
import { Claude } from "smithers-orchestrator/components/Claude";
```

The package.json exports should be checked to determine canonical import style.

## Suggested Fix
1. Verify package.json exports field to determine correct import paths
2. Standardize all docs to use the same import pattern
3. If `smithers` is an alias for `smithers-orchestrator`, document this clearly

Most common pattern in docs:
```tsx
import { createSmithersRoot } from "smithers";
import { createSmithersDB } from "smithers-orchestrator/db";
import { SmithersProvider } from "smithers-orchestrator/components/SmithersProvider";
```
