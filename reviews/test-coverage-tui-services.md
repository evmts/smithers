# Test Coverage Gap: TUI Services

## Source Files Missing Tests

| File | Lines | Complexity |
|------|-------|------------|
| `src/tui/services/claude-assistant.ts` | 94 | Medium |
| `src/tui/services/report-generator.ts` | 192 | High |

## What Should Be Tested

### claude-assistant.ts
- `createClaudeAssistant()` factory function
- `isAvailable()` returns false when no API key
- `getContextSummary()` builds correct context from DB
- Error handling when DB queries fail
- `chat()` message formatting and API call
- Response text extraction from Claude API

### report-generator.ts
- `gatherMetrics()` aggregates data correctly
- Metric counting for phases/agents/tool_calls
- Token sum calculations
- Average duration calculations
- Error collection and limiting to 5 most recent
- `formatMetricsReport()` markdown generation
- `generateReport()` stores report in DB
- Severity determination (warning vs info)
- Graceful handling when no execution exists

## Priority

**MEDIUM** - Core observability features. Report accuracy is important for monitoring.

## Test Approach

```typescript
// Mock Anthropic client
const mockClient = {
  messages: {
    create: mock(() => Promise.resolve({
      content: [{ type: 'text', text: 'Analysis result' }]
    }))
  }
}

// Test gatherMetrics with mock DB
const db = createTestDb()
db.query = mock(() => [/* test data */])
const metrics = gatherMetrics(db)
expect(metrics.totalAgents).toBe(5)
```

## Edge Cases Not Covered

- Empty execution (no phases/agents)
- Very large token counts (overflow)
- Concurrent report generation
- DB connection failures mid-generation
