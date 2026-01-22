/**
 * MCP server for legacy tools.
 * 
 * Spawned as subprocess by createLegacyToolServer() to expose
 * LegacyTools via MCP protocol over stdio transport.
 * 
 * Tool execution happens via file-based IPC:
 * 1. Write request to {IPC_DIR}/{requestId}.request.json
 * 2. Wait for {requestId}.response.json from parent process
 * 3. Return result to Claude via MCP
 * 
 * Environment variables:
 * - SMITHERS_LEGACY_TOOLS: JSON array of tool definitions
 * - SMITHERS_IPC_DIR: Directory for IPC files
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { LegacyToolDefinition } from './legacy-tool-server.js'
import type { IPCRequest, IPCResponse } from './legacy-tool-ipc.js'
import { runMCPServer, createLogger } from './mcp-jsonrpc.js'

const log = createLogger('legacy-mcp')

let toolDefinitions: LegacyToolDefinition[] = []
let ipcDir = ''

function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

async function executeViaIPC(toolName: string, input: unknown): Promise<unknown> {
  const requestId = generateRequestId()
  const reqPath = path.join(ipcDir, `${requestId}.request.json`)
  const respPath = path.join(ipcDir, `${requestId}.response.json`)

  const request: IPCRequest = { requestId, toolName, input }

  await fs.promises.mkdir(ipcDir, { recursive: true })
  await fs.promises.writeFile(reqPath, JSON.stringify(request), 'utf-8')

  const timeout = 60000
  const pollInterval = 20
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    try {
      const content = await fs.promises.readFile(respPath, 'utf-8')
      const response: IPCResponse = JSON.parse(content)
      await fs.promises.unlink(respPath).catch(() => {})
      if (!response.success) throw new Error(response.error ?? 'Unknown error')
      return response.result
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT' && !String(err).includes('ENOENT')) {
        throw err
      }
      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }
  }

  await fs.promises.unlink(reqPath).catch(() => {})
  throw new Error(`IPC timeout waiting for response from tool: ${toolName}`)
}

function loadTools(): boolean {
  const rawTools = process.env['SMITHERS_LEGACY_TOOLS'] ?? '[]'
  ipcDir = process.env['SMITHERS_IPC_DIR'] ?? ''

  if (!ipcDir) {
    log('SMITHERS_IPC_DIR not set')
    return false
  }

  try {
    const parsed = JSON.parse(rawTools)
    if (!Array.isArray(parsed)) {
      log('SMITHERS_LEGACY_TOOLS must be a JSON array')
      return false
    }
    toolDefinitions = parsed as LegacyToolDefinition[]
  } catch (error) {
    log(`Failed to parse SMITHERS_LEGACY_TOOLS: ${error}`)
    return false
  }

  log(toolDefinitions.length === 0
    ? 'No tools defined - server will respond to tools/list with empty array'
    : `Loaded ${toolDefinitions.length} tool definition(s)`)

  return true
}

async function main(): Promise<void> {
  if (!loadTools()) process.exit(1)

  await runMCPServer({
    name: 'smithers-legacy-tools',
    version: '1.0.0',
    logPrefix: 'legacy-mcp',
    getTools: () => toolDefinitions,
    executeTool: async (name, args) => {
      const toolDef = toolDefinitions.find(t => t.name === name)
      if (!toolDef) throw new Error(`Tool not found: ${name}`)
      return executeViaIPC(name, args)
    },
  })
}

main().catch(err => {
  log(`Fatal error: ${err}`)
  process.exit(1)
})
