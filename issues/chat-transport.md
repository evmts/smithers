# ChatTransport Abstraction for Smithers

> **FUTURE ENHANCEMENT** - This feature is not considered vital for first release

---

<context>

## Current Smithers Architecture

Smithers orchestrations currently run **locally only**:

- `createSmithersRoot()` creates a React fiber root in the same process
- Components execute synchronously via the custom reconciler
- Results stored in local SQLite database via `SmithersDB`
- No built-in support for remote execution or streaming to external clients

```tsx
// Current local-only execution
const db = await createSmithersDB({ path: '.smithers/data' })
const executionId = await db.execution.start('My Task', './main.tsx')

<SmithersProvider db={db} executionId={executionId}>
  <Claude>Do something</Claude>
</SmithersProvider>
```

</context>

---

<reference>

## AI SDK ChatTransport Pattern

The Vercel AI SDK provides a `ChatTransport` interface that decouples message handling from execution location.

### Interface Definition

```typescript
// From reference/vercel-ai-sdk/packages/ai/src/ui/chat-transport.ts
interface ChatTransport<UI_MESSAGE extends UIMessage> {
  /**
   * Sends messages and returns a streaming response.
   * Handles both new submissions and message regeneration.
   */
  sendMessages(options: {
    trigger: 'submit-message' | 'regenerate-message';
    chatId: string;
    messageId: string | undefined;
    messages: UI_MESSAGE[];
    abortSignal: AbortSignal | undefined;
    headers?: HeadersInit;
    body?: Record<string, any>;
    metadata?: unknown;
  }): Promise<ReadableStream<UIMessageChunk>>;

  /**
   * Reconnects to an existing stream (for recovery/resumption).
   * Returns null if no active stream exists.
   */
  reconnectToStream(options: {
    chatId: string;
    headers?: HeadersInit;
    body?: Record<string, any>;
    metadata?: unknown;
  }): Promise<ReadableStream<UIMessageChunk> | null>;
}
```

### Built-in Implementations

**HttpChatTransport** - Remote execution over HTTP/SSE:
- Sends messages via POST to `/api/chat`
- Receives streaming responses via ReadableStream
- Supports custom headers, credentials, request transformation
- Enables stream reconnection for recovery

**DirectChatTransport** - Local in-process execution:
- Calls agent's `stream()` method directly
- No network overhead
- Useful for testing, SSR, single-process apps
- Does not support reconnection (no persistent stream)

</reference>

---

<proposal>

## SmithersChatTransport

A transport implementation that would enable Smithers orchestrations to run remotely and stream results to web clients.

### Potential Interface

```typescript
interface SmithersChatTransportOptions {
  // Orchestration to execute (JSX element or path to file)
  orchestration: ReactElement | string;

  // Database configuration
  dbPath?: string;

  // Smithers config
  config?: SmithersConfig;
}

class SmithersChatTransport implements ChatTransport<SmithersMessage> {
  constructor(options: SmithersChatTransportOptions);

  async sendMessages(options: {
    chatId: string;
    messages: SmithersMessage[];
    abortSignal?: AbortSignal;
  }): Promise<ReadableStream<SmithersChunk>>;

  async reconnectToStream(options: {
    chatId: string;
  }): Promise<ReadableStream<SmithersChunk> | null>;
}
```

### Use Cases

1. **Web-based orchestration UI**: Users interact with Smithers via browser, orchestrations run on server
2. **Remote agent execution**: Distribute orchestration work across multiple servers
3. **Stream-to-dashboard**: Real-time progress updates to monitoring dashboards
4. **Multi-tenant hosting**: Run orchestrations for multiple users on shared infrastructure

### Implementation Considerations

- **Message format**: Define `SmithersMessage` and `SmithersChunk` types compatible with existing DB schema
- **Execution mapping**: Map `chatId` to `executionId` in Smithers database
- **State streaming**: Stream task progress, agent outputs, tool results in real-time
- **Reconnection**: Use database as source of truth to resume streams after disconnection
- **Abort handling**: Wire `abortSignal` to `requestStop()` mechanism

</proposal>

---

<coordination>

## Integration Notes

**Another agent is working on related functionality.** Before implementing this feature:

1. Check for existing streaming/transport work in progress
2. Coordinate on message format and chunk types
3. Align on database schema changes if needed
4. Review any new agent output streaming patterns

This is documented as a future enhancement to capture the design direction without duplicating effort.

</coordination>

---

<next-steps>

## When Ready to Implement

1. Review AI SDK transport implementations in `reference/vercel-ai-sdk/packages/ai/src/ui/`
2. Define Smithers-specific message and chunk types
3. Implement `SmithersChatTransport` class
4. Add HTTP transport variant using `Bun.serve()` routes
5. Create integration tests with mock orchestrations
6. Document usage patterns for web deployment scenarios

</next-steps>
