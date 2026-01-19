# Broken Link: /concepts/state-management Does Not Exist

## File
`docs/quickstart.mdx`

## Issue
Line 209 references a non-existent page:

```tsx
<Card title="State Management" icon="database" href="/concepts/state-management">
  Master database persistence
</Card>
```

File `docs/concepts/state-management.mdx` does not exist.

## Suggested Fix
Change href to `/concepts/database-persistence` which covers state management:

```tsx
<Card title="Database Persistence" icon="database" href="/concepts/database-persistence">
  Master database persistence
</Card>
```
