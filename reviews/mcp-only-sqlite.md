# MCP Config Generator Only Implements SQLite

## Status: LOW PRIORITY

## Summary
The MCP configuration generator only implements the SQLite server type. Other MCP servers (filesystem, GitHub, etc.) are not supported.

## Impact
- Limited tool access for agents
- Users cannot easily add other MCP servers
- Manual configuration required for additional servers

## Location
- `src/utils/mcp-config.ts`
- `src/components/MCP/Sqlite.tsx`

## Suggested Fix
1. Add support for common MCP servers:
   - Filesystem
   - GitHub
   - Brave Search
   - Puppeteer
2. Create generic MCP server component
3. Document how to add custom MCP servers

## Priority
**P4** - Feature enhancement

## Estimated Effort
4-6 hours per server type
