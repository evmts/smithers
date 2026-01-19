# Broken Link: Missing orchestration.mdx

## File
`docs/mint.json`

## Issue
Line 75 references `"components/orchestration"` but `docs/components/orchestration.mdx` does not exist.

```json
"pages": [
  ...
  "components/orchestration",  // <-- File missing
  ...
]
```

## Suggested Fix
Either:
1. Remove `"components/orchestration"` from mint.json navigation
2. Create `docs/components/orchestration.mdx` with appropriate content

If removing, update mint.json line 75.
