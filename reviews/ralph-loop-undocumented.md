# Ralph Loop Pattern Undocumented

## Status: LOW PRIORITY

## Summary
The "Ralph Wiggum loop" pattern (changing a key prop to force component remount/re-execution) is clever but non-obvious. It's not documented and could confuse users.

## Impact
- New users may not understand why key props matter
- The pattern is React-specific knowledge
- Debugging iteration issues is confusing without context

## How It Works
```tsx
// Changing the key forces React to unmount and remount
<Phase key={`phase-${iteration}`}>
  <Claude prompt="Do something" />
</Phase>
```

## Location
- `src/components/Ralph.tsx`
- `src/components/SmithersProvider.tsx`

## Suggested Fix
1. Add documentation explaining the Ralph loop pattern
2. Include examples showing correct key usage
3. Add comments in the code explaining the mechanism
4. Consider a more explicit API if the pattern is confusing

## Priority
**P3** - Documentation improvement

## Estimated Effort
1-2 hours
