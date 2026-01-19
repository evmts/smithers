# Issue: Internal Links Use .md Extension

## Files
- `docs/components/gemini.mdx` (lines 9, 308, 350)
- `docs/components/codex.mdx` (lines 8, 308)
- `docs/components/fallback-agent.mdx` (lines 8, 247)
- `docs/components/worktree.mdx` (lines 8, 241, 444)

## Issue
Links to issues folder use `.md` extension which may not resolve correctly in Mintlify:

```tsx
href="/issues/github-actions-review-loop.md"
href="/issues/worktree-component.md"
```

These point to files in `/issues/` directory which is outside the docs folder.

## Suggested Fix
Either:
1. If these issues are meant to be public docs, move them to `docs/` and remove `.md` extension in links
2. If internal tracking, change to GitHub issue links: `href="https://github.com/evmts/smithers/issues/XXX"`
3. Remove these links if the issues are no longer relevant (Worktree is now implemented)
