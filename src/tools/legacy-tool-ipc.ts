/**
 * IPC communication for legacy tool execute handlers.
 * 
 * When Claude CLI spawns an MCP server for legacy tools, this module handles
 * executing the tool handlers in the parent Smithers process via file-based IPC.
 * 
 * Protocol:
 * 1. MCP server writes request to {IPC_DIR}/{requestId}.request.json
 * 2. Parent process watches for .request.json files
 * 3. Parent executes handler, writes result to {requestId}.response.json
 * 4. MCP server reads response and returns to Claude
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { LegacyTool, SmithersToolContext } from './types.js'

const IPC_DIR = path.join(os.tmpdir(), 'smithers-legacy-tools-ipc')

let handlers: Map<string, LegacyTool> = new Map()
let watcher: fs.FSWatcher | null = null
let scanTimeout: ReturnType<typeof setTimeout> | null = null
let scanInFlight = false
let scanQueued = false
let isWatching = false

export interface IPCRequest {
  requestId: string
  toolName: string
  input: unknown
}

export interface IPCResponse {
  requestId: string
  success: boolean
  result?: unknown
  error?: string
}

/**
 * Get the IPC directory path for this execution
 */
export function getIpcDir(): string {
  return IPC_DIR
}

/**
 * Register legacy tool handlers for IPC execution
 */
export function registerHandlers(tools: LegacyTool[]): void {
  handlers.clear()
  for (const tool of tools) {
    handlers.set(tool.name, tool)
  }
}

/**
 * Start watching for IPC requests from MCP server subprocess
 */
export async function startWatcher(): Promise<void> {
  if (isWatching) return
  
  // Ensure IPC directory exists
  await fs.promises.mkdir(IPC_DIR, { recursive: true })
  
  scanInFlight = false
  scanQueued = false

  isWatching = true

  const scheduleScan = (delay = 10) => {
    if (scanTimeout) return
    scanTimeout = setTimeout(() => {
      scanTimeout = null
      void scanRequests()
    }, delay)
  }

  const scanRequests = async () => {
    if (scanInFlight) {
      scanQueued = true
      return
    }
    scanInFlight = true
    try {
      const files = await fs.promises.readdir(IPC_DIR)
      const requestFiles = files.filter(f => f.endsWith('.request.json'))

      for (const reqFile of requestFiles) {
        await processRequestFile(reqFile)
      }
    } catch {
      // Directory might not exist yet, ignore
    } finally {
      scanInFlight = false
      if (scanQueued) {
        scanQueued = false
        scheduleScan()
      }
    }
  }

  async function processRequestFile(reqFile: string) {
    const reqPath = path.join(IPC_DIR, reqFile)
    const requestId = reqFile.replace('.request.json', '')
    const respPath = path.join(IPC_DIR, `${requestId}.response.json`)

    try {
      await fs.promises.access(respPath)
      return
    } catch {
      // No response yet, continue
    }

    try {
      const content = await fs.promises.readFile(reqPath, 'utf-8')
      const request: IPCRequest = JSON.parse(content)

      const handler = handlers.get(request.toolName)
      if (!handler) {
        await writeResponse(respPath, {
          requestId: request.requestId,
          success: false,
          error: `Tool not found: ${request.toolName}`,
        })
        return
      }

      const context: SmithersToolContext = {
        db: new Proxy({} as SmithersToolContext['db'], {
          get(_target, prop) {
            throw new Error(
              `SmithersToolContext.db not available in legacy tool context (attempted: ${String(prop)})`
            )
          },
        }),
        agentId: 'legacy-tool',
        executionId: 'legacy-tool',
        cwd: process.cwd(),
        env: process.env as Record<string, string>,
        log: (msg: string) => console.error(`[legacy-tool:${request.toolName}] ${msg}`),
      }

      try {
        const result = await handler.execute(request.input, context)
        await writeResponse(respPath, {
          requestId: request.requestId,
          success: true,
          result,
        })
      } catch (err) {
        await writeResponse(respPath, {
          requestId: request.requestId,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        })
      }

      await fs.promises.unlink(reqPath).catch((err) => console.debug('Cleanup failed:', err))
    } catch (err) {
      console.error(`[legacy-tool-ipc] Error processing ${reqFile}:`, err)
      scheduleScan()
    }
  }

  watcher = fs.watch(IPC_DIR, () => {
    scheduleScan()
  })

  scheduleScan(0)
}

/**
 * Stop the IPC watcher
 */
export async function stopWatcher(): Promise<void> {
  if (watcher) {
    watcher.close()
    watcher = null
  }
  if (scanTimeout) {
    clearTimeout(scanTimeout)
    scanTimeout = null
  }
  isWatching = false
}

/**
 * Clean up IPC directory
 */
export async function cleanupIpcDir(): Promise<void> {
  try {
    const files = await fs.promises.readdir(IPC_DIR)
    await Promise.all(
      files.map(f => fs.promises.unlink(path.join(IPC_DIR, f)).catch((err) => console.debug('Cleanup failed:', err)))
    )
    await fs.promises.rmdir(IPC_DIR).catch((err) => console.debug('Cleanup failed:', err))
  } catch (err) {
    console.debug('Cleanup error:', err)
  }
}

async function writeResponse(path: string, response: IPCResponse): Promise<void> {
  await fs.promises.writeFile(path, JSON.stringify(response), 'utf-8')
}
