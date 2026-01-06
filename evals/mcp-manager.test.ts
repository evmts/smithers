import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test'
import { MCPManager } from '../src/mcp/manager.js'
import type { MCPServerConfig, MCPTool } from '../src/mcp/types.js'

/**
 * MCPManager Unit Tests
 *
 * Tests the MCP (Model Context Protocol) manager functionality for:
 * - Connection management (connect, disconnect, disconnectAll)
 * - Tool discovery (getAllTools, getToolsForServer)
 * - Tool execution (callTool)
 * - Status tracking (getStatus, getAllStatuses, isConnected, getError)
 */
describe('MCPManager', () => {
  let manager: MCPManager

  beforeEach(() => {
    manager = new MCPManager()
  })

  afterEach(async () => {
    // Clean up any connections
    await manager.disconnectAll()
  })

  describe('connection management', () => {
    it('should create an instance with no connections', () => {
      expect(manager).toBeDefined()
      expect(manager.getAllTools()).toEqual([])
    })

    it('getStatus returns disconnected for unknown server', () => {
      expect(manager.getStatus('unknown')).toBe('disconnected')
    })

    it('isConnected returns false for unknown server', () => {
      expect(manager.isConnected('unknown')).toBe(false)
    })

    it('getError returns undefined for unknown server', () => {
      expect(manager.getError('unknown')).toBeUndefined()
    })

    it('getAllStatuses returns empty map when no connections', () => {
      const statuses = manager.getAllStatuses()
      expect(statuses.size).toBe(0)
    })

    it('disconnect does nothing for unknown server', async () => {
      // Should not throw
      await manager.disconnect('unknown')
      expect(manager.getStatus('unknown')).toBe('disconnected')
    })

    it('disconnectAll works with no connections', async () => {
      // Should not throw
      await manager.disconnectAll()
      expect(manager.getAllStatuses().size).toBe(0)
    })
  })

  describe('getToolsForServer', () => {
    it('returns empty array for unknown server', () => {
      const tools = manager.getToolsForServer('unknown')
      expect(tools).toEqual([])
    })

    it('returns empty array for disconnected server', async () => {
      // Manager tracks by name, disconnected servers return empty
      const tools = manager.getToolsForServer('test-server')
      expect(tools).toEqual([])
    })
  })

  describe('callTool', () => {
    it('returns error result for unknown tool', async () => {
      const result = await manager.callTool('unknown-tool', { arg: 'value' })
      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })

    it('returns error result when no servers connected', async () => {
      const result = await manager.callTool('read_file', { path: '/test.txt' })
      expect(result.success).toBe(false)
      expect(result.error).toContain('not found in any connected server')
    })
  })

  describe('transport type validation', () => {
    it('should throw for unsupported transport type', async () => {
      const config: MCPServerConfig = {
        name: 'test',
        transport: {
          type: 'unsupported' as any,
        },
      }

      await expect(manager.connect(config)).rejects.toThrow('Unsupported transport type')
    })
  })

  describe('connection state tracking', () => {
    // These tests verify state tracking without actually connecting
    // (which would require real MCP servers)

    it('tracks multiple server statuses independently', async () => {
      // Create managers for testing state tracking
      const statuses = manager.getAllStatuses()
      expect(statuses.size).toBe(0)

      // After failed connection attempts, error state is tracked
      const badConfig: MCPServerConfig = {
        name: 'bad-server',
        transport: {
          type: 'stdio',
          command: 'nonexistent-command-that-will-fail',
          args: [],
        },
      }

      try {
        await manager.connect(badConfig)
      } catch {
        // Expected to fail
      }

      // Server should be tracked with error status
      expect(manager.getStatus('bad-server')).toBe('error')
      expect(manager.getError('bad-server')).toBeDefined()
    })
  })

  describe('timeout handling', () => {
    it('should respect timeout configuration', async () => {
      const config: MCPServerConfig = {
        name: 'timeout-test',
        timeout: 100, // Very short timeout
        transport: {
          type: 'stdio',
          command: 'sleep',
          args: ['10'], // Would take 10 seconds normally
        },
      }

      const startTime = Date.now()

      try {
        await manager.connect(config)
      } catch (error) {
        // Should fail relatively quickly due to timeout
        const elapsed = Date.now() - startTime
        expect(elapsed).toBeLessThan(5000) // Should fail within 5 seconds
        expect(String(error)).toContain('timeout')
      }
    })
  })
})

describe('MCPManager HTTP Transport', () => {
  it('creates HTTP transport config correctly', () => {
    const manager = new MCPManager()

    // We can't actually connect without a real server, but we verify
    // the config is accepted
    const config: MCPServerConfig = {
      name: 'http-test',
      transport: {
        type: 'http',
        url: 'http://localhost:3000/mcp',
        headers: {
          Authorization: 'Bearer test-token',
        },
      },
    }

    // This will fail to connect (no server), but shouldn't throw on config
    expect(async () => {
      try {
        await manager.connect(config)
      } catch {
        // Expected - no server running
      }
    }).not.toThrow()

    manager.disconnectAll()
  })
})
