const rawTools = process.env['SMITHERS_TOOLS'] ?? '[]'

try {
  const tools = JSON.parse(rawTools)
  const count = Array.isArray(tools) ? tools.length : 0
  console.error(`[smithers-mcp] Received ${count} tool definitions but MCP execution is not implemented.`)
} catch (error) {
  console.error('[smithers-mcp] Failed to parse SMITHERS_TOOLS.', error)
}

process.exit(1)
