# Smithers MCP Integration

Model Context Protocol (MCP) integration for Smithers. MCP servers provide tools that Claude can use during execution - filesystem access, git operations, database queries, web search, and more.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Smithers MCP System                                │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                          MCPManager                                  │    │
│  │                                                                      │    │
│  │   ┌────────────────┐  ┌────────────────┐  ┌────────────────┐        │    │
│  │   │  Connection 1  │  │  Connection 2  │  │  Connection 3  │        │    │
│  │   │                │  │                │  │                │        │    │
│  │   │  filesystem    │  │  git           │  │  github        │        │    │
│  │   │  └─ read_file  │  │  └─ git_status │  │  └─ list_prs   │        │    │
│  │   │  └─ write_file │  │  └─ git_diff   │  │  └─ create_pr  │        │    │
│  │   │  └─ list_dir   │  │  └─ git_commit │  │  └─ get_issues │        │    │
│  │   └────────────────┘  └────────────────┘  └────────────────┘        │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                     │                                        │
│                                     ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        Claude Executor                               │    │
│  │                                                                      │    │
│  │   1. Prepare tools (connect MCP servers)                            │    │
│  │   2. Send tools to Claude API                                       │    │
│  │   3. When Claude calls tool → MCPManager.callTool()                 │    │
│  │   4. Return result to Claude                                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Files

- **`types.ts`** - TypeScript interfaces for MCP configuration and connections
- **`manager.ts`** - MCPManager class for managing server connections
- **`presets.ts`** - Pre-configured MCP server setups
- **`index.ts`** - Re-exports for public API

## Usage

### Using MCP Presets

```tsx
import { Claude, MCPPresets } from '@evmts/smithers'

function FileAgent({ directory }) {
  return (
    <Claude mcpServers={[MCPPresets.filesystem([directory])]}>
      List all TypeScript files in the directory and summarize each.
    </Claude>
  )
}
```

### Available Presets

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           MCP Presets                                       │
│                                                                             │
│  ┌─────────────────┬───────────────────────────────────────────────────┐   │
│  │ Preset          │ Description                                       │   │
│  ├─────────────────┼───────────────────────────────────────────────────┤   │
│  │ filesystem()    │ Read/write files and directories                  │   │
│  │ git()           │ Git operations (status, diff, commit)             │   │
│  │ github()        │ GitHub API (PRs, issues, repos)                   │   │
│  │ sqlite()        │ SQL queries on SQLite databases                   │   │
│  │ memory()        │ Key-value memory store                            │   │
│  │ fetch()         │ HTTP fetch capabilities                           │   │
│  │ braveSearch()   │ Web search via Brave API                          │   │
│  │ puppeteer()     │ Browser automation                                │   │
│  │ custom()        │ Any stdio-based MCP server                        │   │
│  │ http()          │ Any HTTP-based MCP server                         │   │
│  └─────────────────┴───────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────────┘
```

### Custom MCP Server Configuration

```typescript
import { Claude } from '@evmts/smithers'

const customServer = {
  name: 'my-custom-server',
  transport: {
    type: 'stdio',
    command: 'node',
    args: ['./my-mcp-server.js'],
    env: { MY_VAR: 'value' },
    cwd: '/path/to/dir'
  }
}

function MyAgent() {
  return (
    <Claude mcpServers={[customServer]}>
      Use the custom tools...
    </Claude>
  )
}
```

### HTTP-based MCP Server

```typescript
const httpServer = {
  name: 'remote-mcp',
  transport: {
    type: 'http',
    url: 'https://mcp.example.com/api',
    headers: {
      'Authorization': 'Bearer token'
    }
  }
}
```

## MCPManager API

```typescript
const manager = new MCPManager()

// Connect to a server
await manager.connect(MCPPresets.filesystem(['/home/user']))

// Get all discovered tools
const tools = manager.getAllTools()

// Get tools for specific server
const fsTools = manager.getToolsForServer('filesystem')

// Call a tool
const result = await manager.callTool('read_file', { path: '/etc/hosts' })

// Check connection status
const status = manager.getStatus('filesystem')  // 'connected' | 'disconnected' | 'connecting' | 'error'

// Disconnect
await manager.disconnect('filesystem')

// Disconnect all
await manager.disconnectAll()
```

## Connection Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         MCP Connection Flow                                   │
│                                                                               │
│   connect(config)                                                             │
│        │                                                                      │
│        ▼                                                                      │
│   ┌─────────────────┐                                                         │
│   │ Create Client   │                                                         │
│   │ (MCP SDK)       │                                                         │
│   └────────┬────────┘                                                         │
│            │                                                                  │
│            ▼                                                                  │
│   ┌─────────────────┐     ┌─────────────────┐                                 │
│   │ Create Transport│ ──▶ │  stdio          │  ──▶ Spawn subprocess          │
│   │                 │     │  - command      │                                 │
│   │                 │     │  - args         │                                 │
│   │                 │     │  - env          │                                 │
│   │                 │     ├─────────────────┤                                 │
│   │                 │     │  http           │  ──▶ Connect to URL             │
│   │                 │     │  - url          │                                 │
│   │                 │     │  - headers      │                                 │
│   └─────────────────┘     └─────────────────┘                                 │
│            │                                                                  │
│            ▼                                                                  │
│   ┌─────────────────┐                                                         │
│   │ client.connect()│                                                         │
│   │ (with timeout)  │                                                         │
│   └────────┬────────┘                                                         │
│            │                                                                  │
│            ▼                                                                  │
│   ┌─────────────────┐                                                         │
│   │ listTools()     │  ──▶  Discover available tools from server             │
│   └────────┬────────┘                                                         │
│            │                                                                  │
│            ▼                                                                  │
│   status = 'connected'                                                        │
│   tools = [...discovered tools]                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Tool Execution Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          Tool Execution Flow                                  │
│                                                                               │
│   Claude API Response                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐        │
│   │  tool_use: {                                                     │        │
│   │    id: "toolu_123",                                              │        │
│   │    name: "read_file",                                            │        │
│   │    input: { path: "/etc/hosts" }                                 │        │
│   │  }                                                               │        │
│   └────────────────────────────────┬────────────────────────────────┘        │
│                                    │                                          │
│                                    ▼                                          │
│   ┌─────────────────────────────────────────────────────────────────┐        │
│   │  Claude Executor                                                 │        │
│   │                                                                  │        │
│   │  1. Find tool in toolMap                                        │        │
│   │  2. Call tool.execute(input)                                    │        │
│   │     └── MCPManager.callTool("read_file", { path: "..." })       │        │
│   │  3. Return result to Claude API                                 │        │
│   └────────────────────────────────┬────────────────────────────────┘        │
│                                    │                                          │
│                                    ▼                                          │
│   ┌─────────────────────────────────────────────────────────────────┐        │
│   │  MCPManager.callTool()                                           │        │
│   │                                                                  │        │
│   │  1. Find connection with matching tool                          │        │
│   │  2. connection.client.callTool({ name, arguments })             │        │
│   │  3. Transform result to MCPToolResult                           │        │
│   └────────────────────────────────┬────────────────────────────────┘        │
│                                    │                                          │
│                                    ▼                                          │
│   ┌─────────────────────────────────────────────────────────────────┐        │
│   │  MCPToolResult                                                   │        │
│   │  {                                                               │        │
│   │    success: true,                                                │        │
│   │    content: [{ type: 'text', text: '127.0.0.1 localhost...' }]  │        │
│   │  }                                                               │        │
│   └─────────────────────────────────────────────────────────────────┘        │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Tool Name Collision Handling

When both MCP servers and inline tools define tools with the same name:

```tsx
<Claude
  mcpServers={[MCPPresets.filesystem(['/home'])]}  // Has read_file
  tools={[{ name: 'read_file', ... }]}             // Also read_file
>
  ...
</Claude>
```

**Resolution:** Inline tools take precedence. A warning is logged:
```
Tool name collision detected: "read_file" is provided by both MCP server
and inline tools. The inline tool will take precedence.
```

## Environment Variables

Some presets require environment variables:

| Preset | Environment Variable |
|--------|---------------------|
| `github()` | `GITHUB_PERSONAL_ACCESS_TOKEN` |
| `braveSearch()` | `BRAVE_API_KEY` |

## Error Handling

```typescript
try {
  await manager.connect(config)
} catch (error) {
  // Connection failed
  const status = manager.getStatus(config.name)  // 'error'
  const errorMsg = manager.getError(config.name) // Error message
}
```

## Multi-Node Tool Isolation

Each `<Claude>` node only gets tools from the MCP servers specified in its `mcpServers` prop:

```tsx
<>
  {/* This node only has filesystem tools */}
  <Claude mcpServers={[MCPPresets.filesystem(['/home'])]}>
    ...
  </Claude>

  {/* This node only has git tools */}
  <Claude mcpServers={[MCPPresets.git()]}>
    ...
  </Claude>
</>
```

This prevents tool leakage between different agent nodes in the same execution.
