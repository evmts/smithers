# Documentation Gap: schemaRetries Not Documented

## Files
- `docs/introduction.mdx` (line 76)
- `docs/components/claude.mdx`

## Issue
Introduction uses `schemaRetries` prop:
```tsx
<Claude schema={UserSchema} schemaRetries={2}>
```

But `docs/components/claude.mdx` doesn't document `schemaRetries` as a prop. Code shows both exist:
- `maxRetries` - for the outer error retry loop (documented)
- `schemaRetries` - passed to structured output validation (NOT documented)

## Suggested Fix
Add `schemaRetries` prop documentation to `docs/components/claude.mdx` in the Structured Output section.
