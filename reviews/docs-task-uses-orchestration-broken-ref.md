# Broken Reference: Orchestration Component in Task Example

## File
`docs/components/task.mdx`

## Issue
Line 38 uses `<Orchestration>` component in example, but:
1. This component doesn't exist in src/components/
2. There's no docs/components/orchestration.mdx
3. The navigation in mint.json references it but it doesn't exist

```tsx
<Orchestration>
  <Phase name="setup">
    <Task done={true}>Initialize project</Task>
    ...
  </Phase>
</Orchestration>
```

## Suggested Fix
Replace with `<SmithersProvider>` which is the actual root orchestration wrapper:

```tsx
<SmithersProvider db={db} executionId={executionId}>
  <Phase name="setup">
    <Task done={true}>Initialize project</Task>
    ...
  </Phase>
</SmithersProvider>
```
