# Dynamic API Key Resolution

## Priority: Low

## Problem
API keys read once from env at startup. Cannot support:
- OAuth tokens that expire (GitHub Copilot, Anthropic OAuth)
- Runtime key rotation
- Per-request key selection

## Pi Implementation
- `AgentOptions.getApiKey` callback
- Called before each LLM request
- Returns `Promise<string | undefined>`

```typescript
const agent = new Agent({
  getApiKey: async (provider) => {
    if (provider === "github-copilot") {
      return await refreshCopilotToken();
    }
    return process.env[`${provider.toUpperCase()}_API_KEY`];
  }
});
```

## Use Cases

1. **GitHub Copilot**: OAuth token expires, needs refresh
2. **Anthropic OAuth**: Enterprise SSO integration
3. **Key rotation**: Security compliance
4. **Multi-tenant**: Different keys per workspace

## Implementation Plan

1. Add callback to agent config:
   ```zig
   pub const AgentConfig = struct {
       // ...
       get_api_key: ?*const fn(provider: []const u8) ?[]const u8 = null,
   };
   ```

2. Call before each request in `start_query_stream`:
   ```zig
   const api_key = if (config.get_api_key) |get_fn|
       get_fn("anthropic")
   else
       std.posix.getenv("ANTHROPIC_API_KEY");
   ```

3. Add OAuth token refresh infrastructure (future):
   - Token storage in SQLite
   - Refresh logic with expiry tracking
   - Copilot device flow support

## Reference Files
- `reference/pi-mono/packages/agent/src/agent.ts` (lines 74, 230-231)
- `reference/pi-mono/packages/coding-agent/src/core/auth-storage.ts`
