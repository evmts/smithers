/**
 * Integration tests for tool call snapshots
 * Tests integration between ToolCallInterceptor, useJJSnapshots, and actual tool execution
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { renderHook, act } from '@testing-library/react'
import { ToolCallInterceptor } from '../../src/utils/toolCallInterceptor'
import { useJJSnapshots } from '../../src/hooks/useJJSnapshots'
import type { ExecFunction } from '../../src/vcs/repoVerifier'

// Mock tools for testing
const mockBashTool = mock()
const mockEditTool = mock()
const mockGlobTool = mock()

// Mock exec function with JJ responses
const createMockExec = (): jest.MockedFunction<ExecFunction> => {
  const mockExec = mock() as jest.MockedFunction<ExecFunction>

  mockExec.mockImplementation(async (command: string) => {
    if (command === 'jj status') {
      return {
        stdout: `Working copy changes:
M src/modified.ts
A src/new.ts
`
      }
    }

    if (command.startsWith('jj commit -m')) {
      return {
        stdout: 'Created commit abc123def\n'
      }
    }

    if (command.startsWith('jj log')) {
      return {
        stdout: `abc123def Auto-snapshot: Tool call (bash) at 2024-01-15T10:30:00
def456abc Auto-snapshot: Tool call (edit) at 2024-01-15T10:25:00
`
      }
    }

    return { stdout: '' }
  })

  return mockExec
}

describe('Tool Call Snapshots Integration', () => {
  let mockExec: jest.MockedFunction<ExecFunction>
  let interceptor: ToolCallInterceptor
  let createAutoSnapshot: jest.MockedFunction<(toolName: string) => Promise<void>>

  beforeEach(() => {
    mockExec = createMockExec()
    mockBashTool.mockClear()
    mockEditTool.mockClear()
    mockGlobTool.mockClear()

    // Mock the auto-snapshot function
    createAutoSnapshot = mock()
  })

  describe('basic tool interception with snapshots', () => {
    it('should create snapshot before tool execution', async () => {
      mockBashTool.mockResolvedValue({ stdout: 'ls output', exitCode: 0 })
      createAutoSnapshot.mockResolvedValue(undefined)

      interceptor = new ToolCallInterceptor(createAutoSnapshot)
      interceptor.registerTool({
        toolName: 'bash',
        handler: mockBashTool
      })

      const result = await interceptor.executeTool('bash', { command: 'ls -la' })

      expect(createAutoSnapshot).toHaveBeenCalledWith('bash')
      expect(mockBashTool).toHaveBeenCalledWith({ command: 'ls -la' })
      expect(result).toEqual({ stdout: 'ls output', exitCode: 0 })
    })

    it('should track tool calls with snapshot information', async () => {
      mockEditTool.mockResolvedValue({ success: true })
      createAutoSnapshot.mockResolvedValue(undefined)

      interceptor = new ToolCallInterceptor(createAutoSnapshot)
      interceptor.registerTool({
        toolName: 'edit',
        handler: mockEditTool
      })

      await interceptor.executeTool('edit', { file: 'test.ts', content: 'new content' })

      const history = interceptor.getCallHistory()
      expect(history).toHaveLength(1)
      expect(history[0]).toMatchObject({
        toolName: 'edit',
        args: { file: 'test.ts', content: 'new content' },
        success: true,
        snapshotCreated: true
      })
    })
  })

  describe('integration with useJJSnapshots hook', () => {
    it('should create snapshots through the hook', async () => {
      const { result } = renderHook(() => useJJSnapshots(mockExec))

      // Setup interceptor with the hook's createAutoSnapshot function
      interceptor = new ToolCallInterceptor(result.current.createAutoSnapshot)
      interceptor.registerTool({
        toolName: 'bash',
        handler: mockBashTool
      })

      mockBashTool.mockResolvedValue({ stdout: 'test output' })

      await act(async () => {
        await interceptor.executeTool('bash', { command: 'echo test' })
      })

      // Verify snapshot was created
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringMatching(/jj commit -m "Auto-snapshot: Tool call \(bash\) at/)
      )

      // Verify tool was executed
      expect(mockBashTool).toHaveBeenCalledWith({ command: 'echo test' })
    })

    it('should handle multiple tool calls with individual snapshots', async () => {
      const { result } = renderHook(() => useJJSnapshots(mockExec))

      interceptor = new ToolCallInterceptor(result.current.createAutoSnapshot)

      interceptor.registerTools([
        { toolName: 'bash', handler: mockBashTool },
        { toolName: 'edit', handler: mockEditTool },
        { toolName: 'glob', handler: mockGlobTool }
      ])

      mockBashTool.mockResolvedValue({ stdout: 'bash output' })
      mockEditTool.mockResolvedValue({ success: true })
      mockGlobTool.mockResolvedValue({ files: ['file1.ts', 'file2.ts'] })

      await act(async () => {
        await interceptor.executeTool('bash', { command: 'ls' })
      })

      await act(async () => {
        await interceptor.executeTool('edit', { file: 'test.ts', content: 'test' })
      })

      await act(async () => {
        await interceptor.executeTool('glob', { pattern: '*.ts' })
      })

      // Should have created 3 snapshots
      expect(mockExec).toHaveBeenCalledTimes(9) // 3 status checks + 3 commits + 3 snapshot lists

      // Verify commit messages
      const commitCalls = mockExec.mock.calls.filter(call =>
        call[0].includes('jj commit -m')
      )
      expect(commitCalls).toHaveLength(3)
      expect(commitCalls[0][0]).toContain('Auto-snapshot: Tool call (bash)')
      expect(commitCalls[1][0]).toContain('Auto-snapshot: Tool call (edit)')
      expect(commitCalls[2][0]).toContain('Auto-snapshot: Tool call (glob)')
    })
  })

  describe('error handling in tool call snapshots', () => {
    it('should handle snapshot creation failure gracefully', async () => {
      const { result } = renderHook(() => useJJSnapshots(mockExec))

      // Mock snapshot creation to fail
      mockExec.mockRejectedValueOnce(new Error('jj commit failed'))
      mockBashTool.mockResolvedValue({ stdout: 'tool still works' })

      interceptor = new ToolCallInterceptor(result.current.createAutoSnapshot)
      interceptor.registerTool({
        toolName: 'bash',
        handler: mockBashTool
      })

      const result_exec = await interceptor.executeTool('bash', { command: 'echo test' })

      // Tool should still execute despite snapshot failure
      expect(result_exec).toEqual({ stdout: 'tool still works' })
      expect(mockBashTool).toHaveBeenCalledWith({ command: 'echo test' })

      const history = interceptor.getCallHistory()
      expect(history[0]).toMatchObject({
        toolName: 'bash',
        success: true,
        snapshotCreated: false // Snapshot failed
      })
    })

    it('should handle tool execution failure with snapshot on error', async () => {
      const { result } = renderHook(() => useJJSnapshots(mockExec))

      interceptor = new ToolCallInterceptor(result.current.createAutoSnapshot, {
        snapshotOnError: true
      })
      interceptor.registerTool({
        toolName: 'bash',
        handler: mockBashTool
      })

      mockBashTool.mockRejectedValue(new Error('Command failed'))

      await act(async () => {
        try {
          await interceptor.executeTool('bash', { command: 'invalid-command' })
        } catch {
          // Expected to fail
        }
      })

      // Should still create snapshot on error
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringMatching(/jj commit -m "Auto-snapshot: Tool call \(bash\) at/)
      )

      const history = interceptor.getCallHistory()
      expect(history[0]).toMatchObject({
        toolName: 'bash',
        success: false,
        error: 'Command failed',
        snapshotCreated: true
      })
    })
  })

  describe('configuration and filtering', () => {
    it('should exclude specific tools from snapshots', async () => {
      const { result } = renderHook(() => useJJSnapshots(mockExec))

      interceptor = new ToolCallInterceptor(result.current.createAutoSnapshot, {
        excludeTools: ['glob']
      })

      interceptor.registerTools([
        { toolName: 'bash', handler: mockBashTool },
        { toolName: 'glob', handler: mockGlobTool }
      ])

      mockBashTool.mockResolvedValue({ stdout: 'bash output' })
      mockGlobTool.mockResolvedValue({ files: ['file1.ts'] })

      await act(async () => {
        await interceptor.executeTool('bash', { command: 'ls' })
      })

      await act(async () => {
        await interceptor.executeTool('glob', { pattern: '*.ts' })
      })

      // Only bash should have created a snapshot
      const commitCalls = mockExec.mock.calls.filter(call =>
        call[0].includes('jj commit -m')
      )
      expect(commitCalls).toHaveLength(1)
      expect(commitCalls[0][0]).toContain('Auto-snapshot: Tool call (bash)')

      const history = interceptor.getCallHistory()
      expect(history).toHaveLength(2)
      expect(history.find(h => h.toolName === 'bash')?.snapshotCreated).toBe(true)
      expect(history.find(h => h.toolName === 'glob')?.snapshotCreated).toBe(false)
    })

    it('should disable all snapshots when configured', async () => {
      const { result } = renderHook(() => useJJSnapshots(mockExec))

      interceptor = new ToolCallInterceptor(result.current.createAutoSnapshot, {
        enabled: false
      })

      interceptor.registerTool({
        toolName: 'bash',
        handler: mockBashTool
      })

      mockBashTool.mockResolvedValue({ stdout: 'output' })

      await interceptor.executeTool('bash', { command: 'echo test' })

      // No snapshots should be created
      const commitCalls = mockExec.mock.calls.filter(call =>
        call[0].includes('jj commit -m')
      )
      expect(commitCalls).toHaveLength(0)

      // Tool should still execute
      expect(mockBashTool).toHaveBeenCalledWith({ command: 'echo test' })
    })
  })

  describe('snapshot history integration', () => {
    it('should integrate with snapshot loading and history', async () => {
      const { result } = renderHook(() => useJJSnapshots(mockExec))

      interceptor = new ToolCallInterceptor(result.current.createAutoSnapshot)
      interceptor.registerTool({
        toolName: 'bash',
        handler: mockBashTool
      })

      mockBashTool.mockResolvedValue({ stdout: 'output' })

      // Execute tool to create snapshot
      await act(async () => {
        await interceptor.executeTool('bash', { command: 'ls' })
      })

      // Load snapshots to see the new one
      await act(async () => {
        await result.current.loadSnapshots()
      })

      expect(result.current.snapshots).toHaveLength(2)
      expect(result.current.snapshots[0]).toMatchObject({
        id: 'abc123def',
        message: expect.stringContaining('Auto-snapshot: Tool call (bash)'),
        isAutoSnapshot: true
      })
    })
  })
})