# TODO: Missing JSDoc

## File
[src/components/Claude.tsx](file:///Users/williamcory/smithers/src/components/Claude.tsx#L28)

## Issue
Line 28: `// TODO: add jsdoc`

The `Claude` component exported as the main agent interface lacks JSDoc documentation explaining:
- Purpose and usage
- Example code
- Props explanation

## Suggested Fix
Add JSDoc similar to Smithers.tsx:
```typescript
/**
 * Claude Agent Component
 *
 * Executes Claude CLI as a React component with database tracking,
 * progress reporting, and retry logic.
 *
 * @example
 * ```tsx
 * <Claude model="sonnet" onFinished={(result) => console.log(result.output)}>
 *   Fix the bug in src/utils.ts
 * </Claude>
 * ```
 */
export function Claude(props: ClaudeProps): ReactNode {
```
