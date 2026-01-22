import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  getIpcDir,
  registerHandlers,
  startWatcher,
  stopWatcher,
  cleanupIpcDir,
  type IPCRequest,
  type IPCResponse,
} from './legacy-tool-ipc.js'
import type { LegacyTool } from './types.js'

describe('legacy-tool-ipc', () => {
  beforeEach(async () => {
    await cleanupIpcDir()
  })

  afterEach(async () => {
    await stopWatcher()
    await cleanupIpcDir()
  })

  test('getIpcDir returns consistent path', () => {
    const dir1 = getIpcDir()
    const dir2 = getIpcDir()
    expect(dir1).toBe(dir2)
    expect(dir1).toContain('smithers-legacy-tools-ipc')
  })

  test('registerHandlers stores tools by name', () => {
    const mockTool: LegacyTool = {
      name: 'test-tool',
      description: 'A test tool',
      inputSchema: { type: 'object', properties: { value: { type: 'string' } } },
      execute: async (input) => ({ result: input.value }),
    }

    registerHandlers([mockTool])
    // No error means success - handlers are stored internally
  })

  test('startWatcher creates IPC directory', async () => {
    await startWatcher()
    const dir = getIpcDir()
    const exists = await fs.promises.access(dir).then(() => true).catch(() => false)
    expect(exists).toBe(true)
  })

  test('watcher processes request files', async () => {
    const mockTool: LegacyTool = {
      name: 'echo-tool',
      description: 'Echoes input',
      inputSchema: { type: 'object', properties: { message: { type: 'string' } } },
      execute: async (input) => `Echo: ${input.message}`,
    }

    registerHandlers([mockTool])
    await startWatcher()

    const dir = getIpcDir()
    const requestId = 'test-123'
    const reqPath = path.join(dir, `${requestId}.request.json`)
    const respPath = path.join(dir, `${requestId}.response.json`)

    const request: IPCRequest = {
      requestId,
      toolName: 'echo-tool',
      input: { message: 'hello' },
    }

    await fs.promises.writeFile(reqPath, JSON.stringify(request), 'utf-8')

    // Wait for response with timeout
    const timeout = 5000
    const startTime = Date.now()
    let response: IPCResponse | null = null

    while (Date.now() - startTime < timeout) {
      try {
        const content = await fs.promises.readFile(respPath, 'utf-8')
        response = JSON.parse(content)
        break
      } catch {
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    }

    expect(response).not.toBeNull()
    expect(response?.success).toBe(true)
    expect(response?.result).toBe('Echo: hello')
  })

  test('watcher handles missing tool', async () => {
    registerHandlers([])
    await startWatcher()

    const dir = getIpcDir()
    const requestId = 'missing-tool-test'
    const reqPath = path.join(dir, `${requestId}.request.json`)
    const respPath = path.join(dir, `${requestId}.response.json`)

    const request: IPCRequest = {
      requestId,
      toolName: 'nonexistent-tool',
      input: {},
    }

    await fs.promises.writeFile(reqPath, JSON.stringify(request), 'utf-8')

    const timeout = 5000
    const startTime = Date.now()
    let response: IPCResponse | null = null

    while (Date.now() - startTime < timeout) {
      try {
        const content = await fs.promises.readFile(respPath, 'utf-8')
        response = JSON.parse(content)
        break
      } catch {
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    }

    expect(response).not.toBeNull()
    expect(response?.success).toBe(false)
    expect(response?.error).toContain('Tool not found')
  })

  test('watcher handles execute errors', async () => {
    const errorTool: LegacyTool = {
      name: 'error-tool',
      description: 'Always throws',
      inputSchema: { type: 'object' },
      execute: async () => { throw new Error('Intentional test error') },
    }

    registerHandlers([errorTool])
    await startWatcher()

    const dir = getIpcDir()
    const requestId = 'error-test'
    const reqPath = path.join(dir, `${requestId}.request.json`)
    const respPath = path.join(dir, `${requestId}.response.json`)

    const request: IPCRequest = {
      requestId,
      toolName: 'error-tool',
      input: {},
    }

    await fs.promises.writeFile(reqPath, JSON.stringify(request), 'utf-8')

    const timeout = 5000
    const startTime = Date.now()
    let response: IPCResponse | null = null

    while (Date.now() - startTime < timeout) {
      try {
        const content = await fs.promises.readFile(respPath, 'utf-8')
        response = JSON.parse(content)
        break
      } catch {
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    }

    expect(response).not.toBeNull()
    expect(response?.success).toBe(false)
    expect(response?.error).toContain('Intentional test error')
  })

  test('cleanupIpcDir removes files', async () => {
    await startWatcher()
    const dir = getIpcDir()
    
    // Create some test files
    await fs.promises.writeFile(path.join(dir, 'test.json'), '{}', 'utf-8')
    await fs.promises.writeFile(path.join(dir, 'test2.json'), '{}', 'utf-8')

    await stopWatcher()
    await cleanupIpcDir()

    const exists = await fs.promises.access(dir).then(() => true).catch(() => false)
    expect(exists).toBe(false)
  })
})
