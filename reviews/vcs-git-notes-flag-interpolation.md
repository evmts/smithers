# Git Notes Flag Interpolation Bug

## File
`src/utils/vcs/git.ts` L89-96

## Issue
Empty string `forceFlag` causes shell command issues. When `append=true`, `forceFlag` is empty string `''`, but the template literal still interpolates it, potentially causing parsing issues with Bun.$.

```typescript
const forceFlag = append ? '' : '-f'
await Bun.$`git notes --ref ${SMITHERS_NOTES_REF} ${flag} ${forceFlag} -m ${content} ${ref}`.quiet()
```

## Suggested Fix
Build args array conditionally:

```typescript
export async function addGitNotes(
  content: string,
  ref: string = 'HEAD',
  append: boolean = false
): Promise<void> {
  const args = ['notes', '--ref', SMITHERS_NOTES_REF]
  
  if (append) {
    args.push('append')
  } else {
    args.push('add', '-f')
  }
  
  args.push('-m', content, ref)
  
  try {
    await Bun.$`git ${args}`.quiet()
  } catch (error: any) {
    throw new Error(`Failed to ${append ? 'append' : 'add'} git notes: ${error.message}`)
  }
}
```
