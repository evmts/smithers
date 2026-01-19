# Swallowed Error in Haiku Summarizer

## File

- [src/monitor/haiku-summarizer.ts](file:///Users/williamcory/smithers/src/monitor/haiku-summarizer.ts#L74-L80)

## Issue Description

The `summarizeWithHaiku` function swallows API errors silently, only returning a truncated fallback:

```typescript
} catch {
  // Fallback on error
  return {
    summary: truncate(content, 500) + '\n[... summarization failed, see full output]',
    fullPath: logPath,
  }
}
```

This hides potentially important errors like:
- API rate limiting
- Invalid API key
- Network failures
- Service outages

## Suggested Fix

Log the error before falling back:

```typescript
} catch (err) {
  console.warn('[haiku-summarizer] API call failed:', err instanceof Error ? err.message : err)
  return {
    summary: truncate(content, 500) + '\n[... summarization failed, see full output]',
    fullPath: logPath,
  }
}
```

Or include the error type in the message for debugging:

```typescript
} catch (err) {
  const errorMsg = err instanceof Error ? err.message : 'Unknown error'
  return {
    summary: truncate(content, 500) + `\n[... summarization failed: ${errorMsg}]`,
    fullPath: logPath,
  }
}
```
