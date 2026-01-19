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

## Debugging Plan

### Files to Investigate
1. `src/utils/mcp-config.ts` - Main config generator (lines 89-94 have placeholders)
2. `src/components/MCP/Sqlite.tsx` - Reference implementation for component pattern
3. `src/components/MCP/index.ts` - Exports only Sqlite currently

### Grep Patterns
```bash
# Find all MCP server type references
grep -r "filesystem\|github\|custom" src/

# Find MCP tool usages to understand expected config shape
grep -r "mcp-tool" src/

# Check for any existing MCP server packages
grep -r "@modelcontextprotocol" .
```

### Test Commands
```bash
# Run existing MCP tests
bun test src/utils/mcp-config.test.ts

# Verify SQLite implementation works
bun test --grep "MCP"
```

### Proposed Fix Approach
1. **Implement `filesystem` case** in `generateMCPServerConfig()`:
   ```typescript
   case 'filesystem':
     mcpConfig['mcpServers']['filesystem'] = {
       command: 'bunx',
       args: ['-y', '@modelcontextprotocol/server-filesystem', tool.config['rootPath']],
     }
     break
   ```

2. **Create `Filesystem.tsx`** component following `Sqlite.tsx` pattern

3. **Repeat for `github`** with auth token handling

4. **Update exports** in `src/components/MCP/index.ts`

5. **Add tests** in `src/utils/mcp-config.test.ts` for each new type

## Debugging Plan

**Verified 2026-01-18: Issue still exists**

### Confirmed Current State
- `src/utils/mcp-config.ts:89-94` still has placeholder cases for `filesystem`, `github`, `custom`
- `src/components/MCP/` only contains `Sqlite.tsx` and `index.ts`

### Investigation Steps
1. **Review Sqlite.tsx pattern** - understand component structure for replication
2. **Check MCP package availability** - verify `@modelcontextprotocol/server-filesystem` and `@modelcontextprotocol/server-github` exist
3. **Run existing tests** - `bun test src/utils/mcp-config.test.ts` to understand test patterns

### Implementation Order
1. `filesystem` - simplest, just `rootPath` config
2. `github` - needs `GITHUB_PERSONAL_ACCESS_TOKEN` env handling  
3. Add corresponding React components in `src/components/MCP/`
4. Update exports in `index.ts`
5. Add test cases for each type
