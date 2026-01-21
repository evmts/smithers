import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { spawn, type Subprocess } from 'bun'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFileSync, unlinkSync } from 'fs'

const serverPath = new URL('./smithers-mcp-server.ts', import.meta.url).pathname

function sendRequest(proc: Subprocess<'ignore', 'pipe', 'pipe'>, request: object): void {
  proc.stdin?.write(JSON.stringify(request) + '\n')
}

async function readResponse(reader: ReadableStreamDefaultReader<Uint8Array>, timeout = 5000): Promise<object> {
  const decoder = new TextDecoder()
  let buffer = ''
  const start = Date.now()
  
  while (Date.now() - start < timeout) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    
    const newlineIndex = buffer.indexOf('\n')
    if (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim()
      if (line) {
        return JSON.parse(line)
      }
      buffer = buffer.slice(newlineIndex + 1)
    }
  }
  throw new Error('Timeout waiting for response')
}

describe('smithers-mcp-server', () => {
  test('exits when no tool module provided (logs warning)', async () => {
    const tools = [
      { name: 'test', description: 'Test', inputSchema: { type: 'object', properties: {} } },
    ]

    const proc = spawn({
      cmd: ['bun', 'run', serverPath],
      env: { ...process.env, SMITHERS_TOOLS: JSON.stringify(tools) },
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const reader = proc.stdout.getReader()
    
    sendRequest(proc, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } })
    
    const response = await readResponse(reader)
    expect(response).toHaveProperty('result')
    expect((response as any).result.serverInfo.name).toBe('smithers-tools')
    
    proc.kill()
  })

  test('responds to initialize request', async () => {
    const tools = [
      { name: 'echo', description: 'Echo tool', inputSchema: { type: 'object', properties: { msg: { type: 'string' } } } },
    ]

    const proc = spawn({
      cmd: ['bun', 'run', serverPath],
      env: { ...process.env, SMITHERS_TOOLS: JSON.stringify(tools) },
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const reader = proc.stdout.getReader()
    
    sendRequest(proc, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } })
    
    const response = await readResponse(reader)
    
    expect((response as any).jsonrpc).toBe('2.0')
    expect((response as any).id).toBe(1)
    expect((response as any).result.protocolVersion).toBe('2024-11-05')
    expect((response as any).result.capabilities.tools).toBeDefined()
    
    proc.kill()
  })

  test('responds to tools/list request', async () => {
    const tools = [
      { name: 'echo', description: 'Echo tool', inputSchema: { type: 'object', properties: { msg: { type: 'string' } } } },
      { name: 'add', description: 'Add numbers', inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } } },
    ]

    const proc = spawn({
      cmd: ['bun', 'run', serverPath],
      env: { ...process.env, SMITHERS_TOOLS: JSON.stringify(tools) },
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const reader = proc.stdout.getReader()
    
    sendRequest(proc, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
    await readResponse(reader)
    
    sendRequest(proc, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    const response = await readResponse(reader)
    
    expect((response as any).result.tools).toHaveLength(2)
    expect((response as any).result.tools[0].name).toBe('echo')
    expect((response as any).result.tools[1].name).toBe('add')
    
    proc.kill()
  })

  test('returns error for tools/list before initialize', async () => {
    const proc = spawn({
      cmd: ['bun', 'run', serverPath],
      env: { ...process.env, SMITHERS_TOOLS: '[]' },
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const reader = proc.stdout.getReader()
    
    sendRequest(proc, { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
    const response = await readResponse(reader)
    
    expect((response as any).error).toBeDefined()
    expect((response as any).error.message).toContain('not initialized')
    
    proc.kill()
  })

  test('returns error for unknown method', async () => {
    const proc = spawn({
      cmd: ['bun', 'run', serverPath],
      env: { ...process.env, SMITHERS_TOOLS: '[]' },
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const reader = proc.stdout.getReader()
    
    sendRequest(proc, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
    await readResponse(reader)
    
    sendRequest(proc, { jsonrpc: '2.0', id: 2, method: 'unknown/method', params: {} })
    const response = await readResponse(reader)
    
    expect((response as any).error).toBeDefined()
    expect((response as any).error.code).toBe(-32601)
    expect((response as any).error.message).toContain('Method not found')
    
    proc.kill()
  })

  test('handles invalid JSON gracefully', async () => {
    const proc = spawn({
      cmd: ['bun', 'run', serverPath],
      env: { ...process.env, SMITHERS_TOOLS: '[]' },
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const reader = proc.stdout.getReader()
    
    proc.stdin?.write('{invalid json}\n')
    const response = await readResponse(reader)
    
    expect((response as any).error).toBeDefined()
    expect((response as any).error.code).toBe(-32700)
    
    proc.kill()
  })

  test('reports parse error for invalid SMITHERS_TOOLS JSON', async () => {
    const proc = spawn({
      cmd: ['bun', 'run', serverPath],
      env: { ...process.env, SMITHERS_TOOLS: '{invalid json}' },
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const exitCode = await proc.exited
    const stderr = await new Response(proc.stderr).text()

    expect(exitCode).toBe(1)
    expect(stderr).toContain('Failed to parse SMITHERS_TOOLS')
  })
})

describe('smithers-mcp-server with tool module', () => {
  let toolModulePath: string
  
  beforeAll(() => {
    toolModulePath = join(tmpdir(), `test-tools-${Date.now()}.ts`)
    const toolModuleContent = `
import { z } from 'zod'

export const tools = {
  echo: {
    name: 'echo',
    description: 'Echo back the message',
    inputSchema: z.object({ message: z.string() }),
    execute: async (input: { message: string }) => ({ echoed: input.message }),
  },
  add: {
    name: 'add',
    description: 'Add two numbers',
    inputSchema: z.object({ a: z.number(), b: z.number() }),
    execute: async (input: { a: number; b: number }) => ({ result: input.a + input.b }),
  },
}
`
    writeFileSync(toolModulePath, toolModuleContent)
  })

  afterAll(() => {
    try { unlinkSync(toolModulePath) } catch {}
  })

  test('executes tool via tools/call', async () => {
    const tools = [
      { name: 'echo', description: 'Echo back', inputSchema: { type: 'object', properties: { message: { type: 'string' } } } },
    ]

    const proc = spawn({
      cmd: ['bun', 'run', serverPath],
      env: { 
        ...process.env, 
        SMITHERS_TOOLS: JSON.stringify(tools),
        SMITHERS_TOOL_MODULE: toolModulePath,
      },
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const reader = proc.stdout.getReader()
    
    sendRequest(proc, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
    await readResponse(reader)
    
    sendRequest(proc, { 
      jsonrpc: '2.0', 
      id: 2, 
      method: 'tools/call', 
      params: { name: 'echo', arguments: { message: 'hello world' } } 
    })
    const response = await readResponse(reader)
    
    expect((response as any).result.content).toBeDefined()
    expect((response as any).result.content[0].type).toBe('text')
    expect((response as any).result.content[0].text).toContain('hello world')
    
    proc.kill()
  })

  test('returns error for unknown tool', async () => {
    const tools = [
      { name: 'echo', description: 'Echo back', inputSchema: { type: 'object', properties: {} } },
    ]

    const proc = spawn({
      cmd: ['bun', 'run', serverPath],
      env: { 
        ...process.env, 
        SMITHERS_TOOLS: JSON.stringify(tools),
        SMITHERS_TOOL_MODULE: toolModulePath,
      },
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const reader = proc.stdout.getReader()
    
    sendRequest(proc, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
    await readResponse(reader)
    
    sendRequest(proc, { 
      jsonrpc: '2.0', 
      id: 2, 
      method: 'tools/call', 
      params: { name: 'nonexistent', arguments: {} } 
    })
    const response = await readResponse(reader)
    
    expect((response as any).error).toBeDefined()
    expect((response as any).error.message).toContain('Tool not found')
    
    proc.kill()
  })

  test('handles tool execution errors', async () => {
    const errorToolPath = join(tmpdir(), `error-tools-${Date.now()}.ts`)
    writeFileSync(errorToolPath, `
import { z } from 'zod'
export const tools = {
  fail: {
    name: 'fail',
    inputSchema: z.object({}),
    execute: async () => { throw new Error('Intentional failure') },
  },
}
`)

    const tools = [
      { name: 'fail', description: 'Fails', inputSchema: { type: 'object', properties: {} } },
    ]

    const proc = spawn({
      cmd: ['bun', 'run', serverPath],
      env: { 
        ...process.env, 
        SMITHERS_TOOLS: JSON.stringify(tools),
        SMITHERS_TOOL_MODULE: errorToolPath,
      },
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const reader = proc.stdout.getReader()
    
    sendRequest(proc, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
    await readResponse(reader)
    
    sendRequest(proc, { 
      jsonrpc: '2.0', 
      id: 2, 
      method: 'tools/call', 
      params: { name: 'fail', arguments: {} } 
    })
    const response = await readResponse(reader)
    
    expect((response as any).result.isError).toBe(true)
    expect((response as any).result.content[0].text).toContain('Intentional failure')
    
    proc.kill()
    try { unlinkSync(errorToolPath) } catch {}
  })
})
