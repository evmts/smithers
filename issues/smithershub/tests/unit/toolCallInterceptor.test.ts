/**
 * Unit tests for tool call interceptor
 * Tests automatic snapshot creation on tool calls and configuration
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test'
import {
  ToolCallInterceptor,
  type ToolCallHandler,
  type ToolCallConfig,
  type InterceptedToolCall
} from '../../src/utils/toolCallInterceptor'

// Mock snapshot function
const mockCreateSnapshot = mock()

// Mock tool function
const mockToolFunction = mock()

beforeEach(() => {
  mockCreateSnapshot.mockClear()
  mockToolFunction.mockClear()
})

describe('ToolCallInterceptor', () => {
  describe('constructor and configuration', () => {
    it('should initialize with default config', () => {
      const interceptor = new ToolCallInterceptor(mockCreateSnapshot)

      expect(interceptor.isEnabled()).toBe(true)
    })

    it('should initialize with custom config', () => {
      const config: ToolCallConfig = {
        enabled: false,
        snapshotOnError: false,
        excludeTools: ['test-tool']
      }

      const interceptor = new ToolCallInterceptor(mockCreateSnapshot, config)

      expect(interceptor.isEnabled()).toBe(false)
    })

    it('should update configuration', () => {
      const interceptor = new ToolCallInterceptor(mockCreateSnapshot)

      interceptor.configure({ enabled: false, excludeTools: ['bash'] })

      expect(interceptor.isEnabled()).toBe(false)
    })
  })

  describe('tool registration and interception', () => {
    it('should register and intercept tool calls', async () => {
      mockToolFunction.mockResolvedValue({ result: 'success' })
      mockCreateSnapshot.mockResolvedValue({ success: true, commitId: 'snap123' })

      const interceptor = new ToolCallInterceptor(mockCreateSnapshot)
      const handler: ToolCallHandler = {
        toolName: 'test-tool',
        handler: mockToolFunction
      }

      interceptor.registerTool(handler)

      const result = await interceptor.executeTool('test-tool', { param: 'value' })

      expect(mockCreateSnapshot).toHaveBeenCalledWith('test-tool')
      expect(mockToolFunction).toHaveBeenCalledWith({ param: 'value' })
      expect(result).toEqual({ result: 'success' })
    })

    it('should not create snapshot for excluded tools', async () => {
      mockToolFunction.mockResolvedValue({ result: 'success' })

      const config: ToolCallConfig = {
        excludeTools: ['excluded-tool']
      }
      const interceptor = new ToolCallInterceptor(mockCreateSnapshot, config)

      interceptor.registerTool({
        toolName: 'excluded-tool',
        handler: mockToolFunction
      })

      await interceptor.executeTool('excluded-tool', {})

      expect(mockCreateSnapshot).not.toHaveBeenCalled()
      expect(mockToolFunction).toHaveBeenCalled()
    })

    it('should not intercept when disabled', async () => {
      mockToolFunction.mockResolvedValue({ result: 'success' })

      const interceptor = new ToolCallInterceptor(mockCreateSnapshot, { enabled: false })

      interceptor.registerTool({
        toolName: 'test-tool',
        handler: mockToolFunction
      })

      await interceptor.executeTool('test-tool', {})

      expect(mockCreateSnapshot).not.toHaveBeenCalled()
      expect(mockToolFunction).toHaveBeenCalled()
    })

    it('should handle unregistered tools', async () => {
      const interceptor = new ToolCallInterceptor(mockCreateSnapshot)

      await expect(interceptor.executeTool('unknown-tool', {}))
        .rejects.toThrow('Tool "unknown-tool" not registered')
    })
  })

  describe('error handling', () => {
    it('should create snapshot on tool error when configured', async () => {
      mockToolFunction.mockRejectedValue(new Error('Tool failed'))
      mockCreateSnapshot.mockResolvedValue({ success: true })

      const config: ToolCallConfig = {
        snapshotOnError: true
      }
      const interceptor = new ToolCallInterceptor(mockCreateSnapshot, config)

      interceptor.registerTool({
        toolName: 'failing-tool',
        handler: mockToolFunction
      })

      await expect(interceptor.executeTool('failing-tool', {}))
        .rejects.toThrow('Tool failed')

      expect(mockCreateSnapshot).toHaveBeenCalledWith('failing-tool')
    })

    it('should not create snapshot on tool error by default', async () => {
      mockToolFunction.mockRejectedValue(new Error('Tool failed'))

      const interceptor = new ToolCallInterceptor(mockCreateSnapshot)

      interceptor.registerTool({
        toolName: 'failing-tool',
        handler: mockToolFunction
      })

      await expect(interceptor.executeTool('failing-tool', {}))
        .rejects.toThrow('Tool failed')

      expect(mockCreateSnapshot).not.toHaveBeenCalled()
    })

    it('should handle snapshot creation failure gracefully', async () => {
      mockToolFunction.mockResolvedValue({ result: 'success' })
      mockCreateSnapshot.mockRejectedValue(new Error('Snapshot failed'))

      const interceptor = new ToolCallInterceptor(mockCreateSnapshot)

      interceptor.registerTool({
        toolName: 'test-tool',
        handler: mockToolFunction
      })

      // Should not throw despite snapshot failure
      const result = await interceptor.executeTool('test-tool', {})

      expect(result).toEqual({ result: 'success' })
      expect(mockToolFunction).toHaveBeenCalled()
    })
  })

  describe('tool call tracking', () => {
    it('should track successful tool calls', async () => {
      mockToolFunction.mockResolvedValue({ result: 'success' })
      mockCreateSnapshot.mockResolvedValue({ success: true, commitId: 'snap123' })

      const interceptor = new ToolCallInterceptor(mockCreateSnapshot)

      interceptor.registerTool({
        toolName: 'test-tool',
        handler: mockToolFunction
      })

      await interceptor.executeTool('test-tool', { param: 'value' })

      const history = interceptor.getCallHistory()

      expect(history).toHaveLength(1)
      expect(history[0]).toMatchObject({
        toolName: 'test-tool',
        args: { param: 'value' },
        success: true,
        snapshotCreated: true,
        snapshotId: 'snap123'
      })
      expect(history[0].timestamp).toBeInstanceOf(Date)
    })

    it('should track failed tool calls', async () => {
      mockToolFunction.mockRejectedValue(new Error('Tool failed'))

      const interceptor = new ToolCallInterceptor(mockCreateSnapshot)

      interceptor.registerTool({
        toolName: 'failing-tool',
        handler: mockToolFunction
      })

      try {
        await interceptor.executeTool('failing-tool', {})
      } catch {}

      const history = interceptor.getCallHistory()

      expect(history).toHaveLength(1)
      expect(history[0]).toMatchObject({
        toolName: 'failing-tool',
        success: false,
        error: 'Tool failed',
        snapshotCreated: false
      })
    })

    it('should limit history size', async () => {
      mockToolFunction.mockResolvedValue({ result: 'success' })
      mockCreateSnapshot.mockResolvedValue({ success: true })

      const interceptor = new ToolCallInterceptor(mockCreateSnapshot)

      interceptor.registerTool({
        toolName: 'test-tool',
        handler: mockToolFunction
      })

      // Create more than default history limit (100)
      for (let i = 0; i < 105; i++) {
        await interceptor.executeTool('test-tool', { call: i })
      }

      const history = interceptor.getCallHistory()

      expect(history).toHaveLength(100)
      expect(history[0].args).toEqual({ call: 104 }) // Most recent first
    })
  })

  describe('batch operations', () => {
    it('should register multiple tools', () => {
      const interceptor = new ToolCallInterceptor(mockCreateSnapshot)

      const handlers: ToolCallHandler[] = [
        { toolName: 'tool1', handler: mock() },
        { toolName: 'tool2', handler: mock() },
        { toolName: 'tool3', handler: mock() }
      ]

      interceptor.registerTools(handlers)

      expect(interceptor.getRegisteredTools()).toEqual(['tool1', 'tool2', 'tool3'])
    })

    it('should clear all registrations', () => {
      const interceptor = new ToolCallInterceptor(mockCreateSnapshot)

      interceptor.registerTool({ toolName: 'test-tool', handler: mockToolFunction })
      interceptor.clearRegistrations()

      expect(interceptor.getRegisteredTools()).toEqual([])
    })
  })
})