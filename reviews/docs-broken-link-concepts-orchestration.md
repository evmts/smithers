# Broken Link: /concepts/orchestration Does Not Exist

## File
`docs/components/ralph.mdx`

## Issue
Line 56-58 references a non-existent page:

```tsx
<Card title="Orchestration Model" icon="sitemap" href="/concepts/orchestration">
  How the execution loop works
</Card>
```

File `docs/concepts/orchestration.mdx` does not exist. Only `ralph-wiggum-loop.mdx` and `database-persistence.mdx` exist in concepts/.

## Suggested Fix
Change href to `/concepts/ralph-wiggum-loop` which covers the execution model:

```tsx
<Card title="Ralph Wiggum Loop" icon="sitemap" href="/concepts/ralph-wiggum-loop">
  How the execution loop works
</Card>
```
