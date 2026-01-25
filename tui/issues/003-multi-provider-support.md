# Multi-Provider Support

## Priority: High

## Problem
Hardcoded to Anthropic only. Users with OpenAI/Google/etc keys cannot use the TUI.

## Pi Implementation
- `packages/ai/src/stream.ts` - unified streaming interface
- `packages/ai/src/providers/` - provider-specific implementations
- `Model<TApi>` generic type for type-safe provider options
- `getEnvApiKey()` for automatic credential detection

## Supported Providers in Pi
1. Anthropic (`anthropic-messages`)
2. OpenAI Completions (`openai-completions`)
3. OpenAI Responses (`openai-responses`)
4. OpenAI Codex (`openai-codex-responses`)
5. Google Gemini (`google-generative-ai`)
6. Google Vertex (`google-vertex`)
7. Amazon Bedrock (`bedrock-converse-stream`)
8. Google Gemini CLI (`google-gemini-cli`)

## Implementation Plan

1. Define provider interface in `provider_interface.zig`:
   ```zig
   pub const ProviderApi = struct {
       startStream: fn(...) StreamingState,
       poll: fn(*StreamingState) bool,
       cleanup: fn(*StreamingState) void,
   };
   ```

2. Create provider implementations:
   - `anthropic_provider.zig` (existing, refactor)
   - `openai_provider.zig` (new)
   - `gemini_provider.zig` (new)

3. Add model selection:
   - Parse `SMITHERS_MODEL` env var or config
   - Format: `provider/model-id` (e.g., `openai/gpt-4o`)

4. Add credential detection:
   ```zig
   fn getApiKey(provider: []const u8) ?[]const u8 {
       return switch (provider) {
           "anthropic" => getenv("ANTHROPIC_API_KEY"),
           "openai" => getenv("OPENAI_API_KEY"),
           "google" => getenv("GEMINI_API_KEY"),
           else => null,
       };
   }
   ```

5. Update tools JSON per provider (different formats)

## Reference Files
- `reference/pi-mono/packages/ai/src/stream.ts`
- `reference/pi-mono/packages/ai/src/providers/anthropic.ts`
- `reference/pi-mono/packages/ai/src/providers/openai-completions.ts`
