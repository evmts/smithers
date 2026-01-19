# Swallowed Errors in TUI Hooks

## Files Affected

- [src/tui/hooks/useSmithersConnection.ts](file:///Users/williamcory/smithers/src/tui/hooks/useSmithersConnection.ts#L71-L73)
- [src/tui/hooks/useHumanRequests.ts](file:///Users/williamcory/smithers/src/tui/hooks/useHumanRequests.ts#L28-L31)
- [src/tui/hooks/useHumanRequests.ts](file:///Users/williamcory/smithers/src/tui/hooks/useHumanRequests.ts#L52-L55)
- [src/tui/hooks/useHumanRequests.ts](file:///Users/williamcory/smithers/src/tui/hooks/useHumanRequests.ts#L63-L66)
- [src/tui/hooks/useReportGenerator.ts](file:///Users/williamcory/smithers/src/tui/hooks/useReportGenerator.ts#L28-L31)
- [src/tui/hooks/useReportGenerator.ts](file:///Users/williamcory/smithers/src/tui/hooks/useReportGenerator.ts#L46-L48)
- [src/tui/hooks/usePollEvents.ts](file:///Users/williamcory/smithers/src/tui/hooks/usePollEvents.ts#L68-L70)
- [src/tui/hooks/usePollTableData.ts](file:///Users/williamcory/smithers/src/tui/hooks/usePollTableData.ts#L20-L24)
- [src/tui/hooks/useRenderFrames.ts](file:///Users/williamcory/smithers/src/tui/hooks/useRenderFrames.ts#L30-L33)
- [src/tui/services/claude-assistant.ts](file:///Users/williamcory/smithers/src/tui/services/claude-assistant.ts#L64-L66)

## Issue Description

Multiple TUI hooks silently swallow errors with empty catch blocks. While polling errors may be intentionally ignored, this pattern makes debugging difficult and can hide real issues:

```typescript
// Example from useSmithersConnection.ts:71-73
} catch {
  // Ignore polling errors
}

// Example from useHumanRequests.ts:28-31
} catch {
  // Ignore errors
}
```

## Suggested Fix

At minimum, log errors at debug level or track error state:

```typescript
// Option 1: Log at debug level
} catch (err) {
  console.debug('[useSmithersConnection] Polling error:', err)
}

// Option 2: Track error state for UI feedback
const [lastError, setLastError] = useState<string | null>(null)
// ...
} catch (err) {
  setLastError(err instanceof Error ? err.message : String(err))
}

// Option 3: Only swallow expected errors
} catch (err) {
  if (!isExpectedPollingError(err)) {
    console.error('Unexpected error:', err)
  }
}
```

Consider adding an error boundary or error state to surface issues to users.
