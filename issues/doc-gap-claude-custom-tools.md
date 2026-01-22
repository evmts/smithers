# Claude: custom tools execute handlers not used

## Status
Resolved

## Description
Legacy tools (with JSON Schema inputSchema) now have their execute handlers wired up via
file-based IPC between the MCP server subprocess and the parent Smithers process.

## Resolution
- Created `legacy-tool-ipc.ts` - Handles IPC communication for executing tool handlers in parent process
- Created `legacy-tool-server.ts` - Creates MCP server config for legacy tools
- Created `legacy-mcp-server.ts` - MCP server that communicates via IPC back to parent
- Added exports to `src/tools/index.ts`
- Added comprehensive tests for both modules

### Architecture
```
┌─────────────────┐    ┌──────────────────────┐    ┌─────────────────┐
│  Claude CLI     │───▶│  legacy-mcp-server   │───▶│  Smithers       │
│  (subprocess)   │    │  (MCP over stdio)    │    │  (parent proc)  │
└─────────────────┘    └──────────────────────┘    └─────────────────┘
                              │                            │
                              │  IPC via files             │
                              │  .request.json ──────────▶ │
                              │  ◀────────── .response.json│
```

## Files
- src/tools/legacy-tool-ipc.ts (new)
- src/tools/legacy-tool-server.ts (new)
- src/tools/legacy-mcp-server.ts (new)
- src/tools/legacy-tool-ipc.test.ts (new)
- src/tools/legacy-tool-server.test.ts (new)
- src/tools/index.ts
- src/hooks/adapters/claude.ts (imports already existed)
- docs/components/claude.mdx

## Tasks
- [x] Implement custom tool execute handlers
