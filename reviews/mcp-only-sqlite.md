# MCP Config Generator Only Implements SQLite

**SCOPE: EASY**

## Status: LOW PRIORITY

## Summary
The MCP configuration generator only implements the SQLite server type. Other MCP servers (filesystem, GitHub, etc.) are defined in types but not implemented - they have explicit placeholder comments.

## Impact
- Limited tool access for agents
- Users cannot easily add other MCP servers
- Manual configuration required for additional servers

## Current State
**Types defined but not implemented:**
- `src/utils/mcp-config.ts:6` - Type union includes `'sqlite' | 'filesystem' | 'github' | 'custom'`
- Lines 89-94 have explicit placeholder comments: "Future: Add more MCP server types" and "Placeholder for future implementations"

**Only SQLite implemented:**
- `src/utils/mcp-config.ts:76-87` - Full SQLite implementation with `npx @anthropic/mcp-server-sqlite`
- `src/components/MCP/Sqlite.tsx` - React component wrapper
- `src/components/MCP/index.ts` - Only exports Sqlite

## Implementation Pattern
Follow the SQLite pattern in `src/utils/mcp-config.ts:76-87`:

```typescript
case 'filesystem':
  mcpConfig['mcpServers']['filesystem'] = {
    command: 'npx',
    args: [
      '-y',
      '@modelcontextprotocol/server-filesystem',
      tool.config['rootPath']
    ],
  }
  break

case 'github':
  mcpConfig['mcpServers']['github'] = {
    command: 'npx',
    args: [
      '-y',
      '@modelcontextprotocol/server-github',
      '--auth',
      tool.config['authToken']
    ],
  }
  break
```

## Component Pattern
Create React components in `src/components/MCP/` following `Sqlite.tsx` pattern:
1. Define props interface
2. Serialize config as JSON
3. Return `<mcp-tool type="..." config={json}>{children}</mcp-tool>`
4. Export from `src/components/MCP/index.ts`

## Suggested Implementation Order
1. **Filesystem** (~1h) - Most straightforward, just rootPath config
2. **GitHub** (~2h) - Requires auth token handling
3. **Brave Search** (~1h) - Similar to GitHub with API key
4. **Puppeteer** (~2h) - More complex setup, may need additional config

## Tests to Update
- `src/utils/mcp-config.test.ts` - Add test cases for each new server type
- `src/tools/registry.test.ts` - Update MCP server registration tests

## Priority
**P4** - Feature enhancement

## Estimated Effort
1-2 hours per server type (4-8 hours total for all four common servers)
