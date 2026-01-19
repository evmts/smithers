# Complexity Review: src/monitor/stream-formatter.ts

## File Path
[src/monitor/stream-formatter.ts#L41-L79](file:///Users/williamcory/smithers/src/monitor/stream-formatter.ts#L41-L79)

## Current Code

```typescript
switch (event.type) {
  case 'phase':
    if (event.data['status'] === 'COMPLETE') {
      this.stats.phasesCompleted++
    }
    output = this.formatPhase(time, event.data['name'], event.data['status'])
    break

  case 'agent':
    if (event.data['status'] === 'COMPLETE') {
      this.stats.agentsExecuted++
    }
    output = this.formatAgent(time, event.data['name'], event.data['status'])
    break

  case 'tool':
    this.stats.toolCalls++
    output = this.formatTool(time, event.data['name'], event.data['details'], logPath, summary)
    break

  case 'ralph':
    output = this.formatRalph(time, event.data['iteration'])
    break

  case 'error':
    this.stats.errors++
    output = this.formatError(time, event.data['message'], logPath)
    break

  case 'log':
    if (this.lastEventType !== 'log') {
      output = this.formatLog(time, event.data['message'])
    }
    break

  default:
    output = this.formatLog(time, event.raw)
}
```

## Suggested Simplification

Use a **strategy pattern** with handler map:

```typescript
type EventHandler = (
  formatter: StreamFormatter,
  time: string,
  event: ParsedEvent,
  logPath?: string,
  summary?: string
) => string

const EVENT_HANDLERS: Record<string, EventHandler> = {
  phase: (f, time, e) => {
    if (e.data['status'] === 'COMPLETE') f.stats.phasesCompleted++
    return f.formatPhase(time, e.data['name'], e.data['status'])
  },
  agent: (f, time, e) => {
    if (e.data['status'] === 'COMPLETE') f.stats.agentsExecuted++
    return f.formatAgent(time, e.data['name'], e.data['status'])
  },
  tool: (f, time, e, logPath, summary) => {
    f.stats.toolCalls++
    return f.formatTool(time, e.data['name'], e.data['details'], logPath, summary)
  },
  ralph: (f, time, e) => f.formatRalph(time, e.data['iteration']),
  error: (f, time, e, logPath) => {
    f.stats.errors++
    return f.formatError(time, e.data['message'], logPath)
  },
  log: (f, time, e) => f.lastEventType !== 'log' ? f.formatLog(time, e.data['message']) : '',
}

// Usage in formatEvent:
formatEvent(event: ParsedEvent, logPath?: string, summary?: string): string {
  const time = this.formatTime(event.timestamp)
  const handler = EVENT_HANDLERS[event.type]
  const output = handler 
    ? handler(this, time, event, logPath, summary)
    : this.formatLog(time, event.raw)
  
  this.lastEventType = event.type
  return output
}
```

## Benefits
- Declarative event handling
- Each handler is independently testable
- Easy to add new event types
- Eliminates switch boilerplate
