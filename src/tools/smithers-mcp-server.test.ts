import { describe, test, expect } from 'bun:test'
import { spawn } from 'bun'

describe('smithers-mcp-server', () => {
  const serverPath = new URL('./smithers-mcp-server.ts', import.meta.url).pathname

  test('exits with error when no tools provided', async () => {
    const proc = spawn({
      cmd: ['bun', 'run', serverPath],
      env: { ...process.env, SMITHERS_TOOLS: undefined },
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const exitCode = await proc.exited
    const stderr = await new Response(proc.stderr).text()

    expect(exitCode).toBe(1)
    expect(stderr).toContain('[smithers-mcp]')
    expect(stderr).toContain('0 tool definitions')
  })

  test('parses valid tools JSON from env', async () => {
    const tools = [
      { name: 'test', description: 'Test', inputSchema: { type: 'object', properties: {} } },
    ]

    const proc = spawn({
      cmd: ['bun', 'run', serverPath],
      env: { ...process.env, SMITHERS_TOOLS: JSON.stringify(tools) },
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const exitCode = await proc.exited
    const stderr = await new Response(proc.stderr).text()

    expect(exitCode).toBe(1)
    expect(stderr).toContain('1 tool definitions')
  })

  test('handles multiple tools', async () => {
    const tools = [
      { name: 'tool1', description: 'First', inputSchema: { type: 'object', properties: {} } },
      { name: 'tool2', description: 'Second', inputSchema: { type: 'object', properties: {} } },
      { name: 'tool3', description: 'Third', inputSchema: { type: 'object', properties: {} } },
    ]

    const proc = spawn({
      cmd: ['bun', 'run', serverPath],
      env: { ...process.env, SMITHERS_TOOLS: JSON.stringify(tools) },
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const exitCode = await proc.exited
    const stderr = await new Response(proc.stderr).text()

    expect(exitCode).toBe(1)
    expect(stderr).toContain('3 tool definitions')
  })

  test('reports parse error for invalid JSON', async () => {
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

  test('handles empty array', async () => {
    const proc = spawn({
      cmd: ['bun', 'run', serverPath],
      env: { ...process.env, SMITHERS_TOOLS: '[]' },
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const exitCode = await proc.exited
    const stderr = await new Response(proc.stderr).text()

    expect(exitCode).toBe(1)
    expect(stderr).toContain('0 tool definitions')
  })

  test('handles non-array JSON', async () => {
    const proc = spawn({
      cmd: ['bun', 'run', serverPath],
      env: { ...process.env, SMITHERS_TOOLS: '{"not": "array"}' },
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const exitCode = await proc.exited
    const stderr = await new Response(proc.stderr).text()

    expect(exitCode).toBe(1)
    expect(stderr).toContain('0 tool definitions')
  })
})
