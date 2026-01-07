# MCP Integration Example

This example demonstrates using MCP (Model Context Protocol) servers to extend Claude with external tool capabilities.

## What It Does

Shows how to integrate three types of MCP servers:
1. **Filesystem** - File operations (read, write, search)
2. **SQLite** - Database queries and manipulation
3. **GitHub** - Repository and issue management

## Key Concepts

### MCP Servers

MCP (Model Context Protocol) servers provide standardized tool interfaces:

```tsx
<Claude
  mcpServers={[
    filesystem({ allowedDirectories: ['./src'] }),
    sqlite({ databases: { mydb: './data.db' } }),
  ]}
>
  You now have filesystem and database tools available
</Claude>
```

### Built-in Presets

Smithers provides presets for common MCP servers:

```typescript
import { filesystem, sqlite, github, git, memory, fetch } from 'smithers/mcp/presets'
```

### Tool Scoping

MCP tools are scoped to specific Claude components:

```tsx
// Agent A has filesystem tools
<Claude mcpServers={[filesystem()]}>...</Claude>

// Agent B has database tools
<Claude mcpServers={[sqlite({ databases: {...} })]}>...</Claude>
```

## Usage

### Filesystem Demo

```bash
bun run examples/10-mcp-integration/agent.tsx filesystem
```

Demonstrates:
- Listing directory contents
- Reading files
- Searching for keywords
- Getting file metadata

### Database Demo

```bash
bun run examples/10-mcp-integration/agent.tsx database
```

Demonstrates:
- Creating tables
- Inserting data
- Querying with SQL
- Schema inspection

### GitHub Demo

```bash
# Requires GITHUB_TOKEN
export GITHUB_TOKEN=ghp_...
bun run examples/10-mcp-integration/agent.tsx github
```

Demonstrates:
- Repository information
- Issue management
- Pull request search
- Commit history

## Example Output

### Filesystem Demo

```
🔌 MCP Integration Demo
  Type: filesystem

✅ MCP Demo Complete

Result:
Found 6 example directories in ./examples:
- 01-hello-world
- 02-code-review
- 03-research-pipeline
- 04-parallel-research
- 05-dev-team
- 06-file-processor

README.md from 01-hello-world:
# Hello World Example
This is the simplest possible Smithers agent...

Files containing "Claude":
- ./examples/01-hello-world/agent.tsx (3 matches)
- ./examples/02-code-review/agent.tsx (5 matches)
...

package.json:
  Size: 2,456 bytes
  Modified: 2025-01-05 14:32:01
```

## MCP Server Configuration

### Filesystem Server

```typescript
import { filesystem } from 'smithers/mcp/presets'

filesystem({
  allowedDirectories: ['./src', './docs'],  // Restrict access
})
```

### SQLite Server

```typescript
import { sqlite } from 'smithers/mcp/presets'

sqlite({
  databases: {
    prod: './production.db',
    dev: './development.db',
    memory: ':memory:',  // In-memory DB
  },
})
```

### GitHub Server

```typescript
import { github } from 'smithers/mcp/presets'

github({
  owner: 'evmts',
  repo: 'smithers',
  // Requires GITHUB_TOKEN environment variable
})
```

### Git Server

```typescript
import { git } from 'smithers/mcp/presets'

git({
  repository: process.cwd(),  // Git repo path
})
```

### Memory Server

```typescript
import { memory } from 'smithers/mcp/presets'

memory({
  persistence: './agent-memory.json',  // Optional persistence
})
```

### Fetch Server

```typescript
import { fetch } from 'smithers/mcp/presets'

fetch({
  allowedDomains: ['api.example.com'],  // Restrict to specific domains
})
```

## Advanced Patterns

### Multiple MCP Servers

```tsx
<Claude
  mcpServers={[
    filesystem({ allowedDirectories: ['./src'] }),
    git({ repository: process.cwd() }),
    memory({ persistence: './memory.json' }),
  ]}
>
  You have filesystem, git, and memory tools
</Claude>
```

### Conditional MCP Servers

```tsx
<Claude
  mcpServers={[
    filesystem({ allowedDirectories: ['./src'] }),
    ...(needsDatabase ? [sqlite({ databases: { db: './data.db' } })] : []),
  ]}
>
  Filesystem always available, database conditional
</Claude>
```

### Custom MCP Server

```tsx
import { custom } from 'smithers/mcp/presets'

<Claude
  mcpServers={[
    custom({
      command: 'node',
      args: ['./my-mcp-server.js'],
      env: { API_KEY: process.env.API_KEY },
    }),
  ]}
>
  Using custom MCP server
</Claude>
```

## Security Considerations

### 1. Restrict Filesystem Access

```typescript
filesystem({
  allowedDirectories: ['./safe-dir'],  // Only allow specific paths
})
```

### 2. Use Read-Only Databases

```typescript
sqlite({
  databases: {
    readonly: './data.db?mode=ro',  // Read-only mode
  },
})
```

### 3. Limit API Access

```typescript
fetch({
  allowedDomains: ['api.example.com'],  // Whitelist domains
})
```

### 4. Protect Secrets

Never hardcode tokens or keys:

```typescript
// Bad
github({ token: 'ghp_abc123' })

// Good
github() // Uses GITHUB_TOKEN env var
```

## Troubleshooting

### MCP Server Connection Failed

Check that the MCP server process is accessible:

```bash
# For stdio servers
which node  # Ensure runtime exists

# For HTTP servers
curl http://localhost:3000  # Check server is running
```

### Tool Not Available

Verify MCP server is providing the tool:

```tsx
<Claude
  mcpServers={[filesystem()]}
  onFinished={(result) => {
    console.log('Available tools:', result.toolsUsed)
  }}
>
  List available tools
</Claude>
```

### Permission Denied

Check allowed directories/databases:

```typescript
filesystem({
  allowedDirectories: ['/correct/path'],  // Fix path
})
```

## Related Examples

- [07-git-helper](../07-git-helper) - Git operations with Bash tool
- [06-file-processor](../06-file-processor) - File transformation
- [02-code-review](../02-code-review) - Tool composition

## Related Documentation

- [MCP Integration Guide](../../docs/guides/mcp-integration.mdx)
- [Claude Component Docs](../../docs/components/claude.mdx)
- [Tool Composition](../../docs/guides/advanced-patterns.mdx#tool-composition)
