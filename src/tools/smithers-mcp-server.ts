/**
 * Stub MCP server for Smithers tools.
 * 
 * This file is spawned as a subprocess by createSmithersToolServer() to expose
 * SmithersTools via MCP protocol. Currently unimplemented - exits with error.
 * 
 * Implementation would require:
 * 1. Parse SMITHERS_TOOLS env var containing tool definitions
 * 2. Start MCP server on stdio
 * 3. Handle tool invocation requests
 * 4. Route to appropriate tool execute() function
 */
const rawTools = process.env['SMITHERS_TOOLS'] ?? '[]'

try {
  const tools = JSON.parse(rawTools)
  const count = Array.isArray(tools) ? tools.length : 0
  console.error(`[smithers-mcp] Received ${count} tool definitions but MCP execution is not implemented.`)
} catch (error) {
  console.error('[smithers-mcp] Failed to parse SMITHERS_TOOLS.', error)
}

process.exit(1)
