# Claude: legacyLogFormat prop not implemented

## Status
Closed

## Description
The `legacyLogFormat` prop was reported as not implemented, but investigation shows it IS fully implemented.

## Resolution
The prop is implemented in:
- `src/hooks/useAgentRunner.ts` (lines 50, 104-106, 169-170) - Core implementation
- `src/components/agents/types/agents.ts` (line 244) - Type definition with JSDoc
- `src/components/Claude.test.tsx` (lines 228-235) - Tests verify the prop exists
- `docs/components/claude.mdx` (lines 280-282) - Documentation is correct

When enabled, writes legacy raw text logs alongside NDJSON stream logs for typed streaming.

## Files
- docs/components/claude.mdx
- src/hooks/useAgentRunner.ts
- src/components/agents/types/agents.ts

## Tasks
- [x] Implement or remove from docs (ALREADY IMPLEMENTED)
