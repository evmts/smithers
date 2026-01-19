# Swallowed Error in Capture Utility

## File

- [src/utils/capture.ts](file:///Users/williamcory/smithers/src/utils/capture.ts#L387-L389)

## Issue Description

The `writeCapture` function swallows file read errors silently:

```typescript
const existing = await Bun.file(generated.filePath)
  .text()
  .catch(() => '')
```

This pattern hides potential issues:
- Permission errors
- Disk full conditions
- Corrupted files
- Path issues

If the file exists but can't be read (e.g., permissions), it will be silently overwritten instead of appended to.

## Suggested Fix

Differentiate between "file not found" (expected) and other errors (unexpected):

```typescript
const existing = await Bun.file(generated.filePath)
  .text()
  .catch((err) => {
    if (err.code === 'ENOENT') {
      return ''
    }
    console.warn(`[capture] Could not read existing file ${generated.filePath}:`, err.message)
    return ''
  })
```

Or throw on unexpected errors:

```typescript
let existing = ''
try {
  existing = await Bun.file(generated.filePath).text()
} catch (err: any) {
  if (err.code !== 'ENOENT') {
    throw err
  }
}
```
