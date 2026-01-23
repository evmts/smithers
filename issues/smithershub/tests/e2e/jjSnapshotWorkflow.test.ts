/**
 * End-to-end tests for JJ snapshot workflow
 * Tests complete workflow integration from UI to JJ operations
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { JJWrapper } from '../../src/components/JJWrapper'
import { ToolCallInterceptor } from '../../src/utils/toolCallInterceptor'
import type { ExecFunction } from '../../src/vcs/repoVerifier'

// Mock exec function that simulates real JJ workflow
const createMockExec = (): jest.MockedFunction<ExecFunction> => {
  let commitCounter = 1000
  const commits = new Map<string, string>()

  const mockExec = mock() as jest.MockedFunction<ExecFunction>

  mockExec.mockImplementation(async (command: string) => {
    // Simulate JJ status with changes
    if (command === 'jj status') {
      return {
        stdout: `Working copy changes:
M src/component.tsx
A src/utils.ts
D src/legacy.js

Parent commit: base123 Initial setup
`
      }
    }

    // Simulate JJ commit creation
    if (command.startsWith('jj commit -m')) {
      const message = command.match(/-m "([^"]+)"/)?.[1] || 'Commit'
      const commitId = `commit${commitCounter++}`
      commits.set(commitId, message)

      return {
        stdout: `Created commit ${commitId}\nCommit message: ${message}\n`
      }
    }

    // Simulate JJ log output
    if (command.startsWith('jj log')) {
      const logEntries = Array.from(commits.entries())
        .reverse() // Most recent first
        .slice(0, 10)
        .map(([id, message]) => `${id} ${message}`)
        .join('\n')

      return { stdout: logEntries + '\nbase123 Initial setup\n' }
    }

    // Simulate JJ edit (restore)
    if (command.startsWith('jj edit')) {
      const commitId = command.split(' ')[2]
      if (commits.has(commitId) || commitId === 'base123') {
        return { stdout: `Working copy now at: ${commitId}\n` }
      }
      throw new Error(`Unknown revision: ${commitId}`)
    }

    // Simulate JJ undo
    if (command === 'jj undo') {
      const lastCommitId = Array.from(commits.keys()).pop()
      if (lastCommitId) {
        const message = commits.get(lastCommitId)
        commits.delete(lastCommitId)
        return { stdout: `Undid operation: create ${lastCommitId} "${message}"\n` }
      }
      throw new Error('Nothing to undo')
    }

    throw new Error(`Unexpected command: ${command}`)
  })

  return mockExec
}

// Test component that uses JJ operations
const TestApp: React.FC<{ exec: ExecFunction }> = ({ exec }) => {
  return (
    <JJWrapper exec={exec}>
      <div data-testid="test-app">
        <h1>Test Application</h1>
        <p>This component tests the full JJ integration</p>
      </div>
    </JJWrapper>
  )
}

describe('JJ Snapshot Workflow E2E', () => {
  let mockExec: jest.MockedFunction<ExecFunction>

  beforeEach(() => {
    mockExec = createMockExec()
  })

  describe('complete snapshot workflow', () => {
    it('should handle manual snapshot creation workflow', async () => {
      render(<TestApp exec={mockExec} />)

      // Wait for component to initialize
      await waitFor(() => {
        expect(screen.getByTestId('test-app')).toBeInTheDocument()
      })

      // Find and click create snapshot button
      const createButton = await screen.findByRole('button', { name: /create snapshot/i })
      fireEvent.click(createButton)

      // Wait for snapshot creation
      await waitFor(() => {
        expect(mockExec).toHaveBeenCalledWith(
          expect.stringMatching(/jj commit -m "Manual snapshot at \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z"/)
        )
      })

      // Verify success message
      await waitFor(() => {
        expect(screen.getByText(/snapshot created successfully/i)).toBeInTheDocument()
      })
    })

    it('should display snapshot history and allow restoration', async () => {
      // Pre-create some snapshots
      await mockExec('jj commit -m "First snapshot"')
      await mockExec('jj commit -m "Second snapshot"')

      render(<TestApp exec={mockExec} />)

      // Wait for snapshots to load
      await waitFor(() => {
        expect(screen.getByText('Second snapshot')).toBeInTheDocument()
        expect(screen.getByText('First snapshot')).toBeInTheDocument()
      })

      // Click restore on first snapshot
      const restoreButtons = screen.getAllByRole('button', { name: /restore/i })
      fireEvent.click(restoreButtons[1]) // First snapshot is second in list

      // Confirm restoration
      const confirmButton = await screen.findByRole('button', { name: /confirm/i })
      fireEvent.click(confirmButton)

      await waitFor(() => {
        expect(mockExec).toHaveBeenCalledWith('jj edit commit1000')
      })

      // Verify success message
      await waitFor(() => {
        expect(screen.getByText(/restored to snapshot/i)).toBeInTheDocument()
      })
    })

    it('should handle undo last snapshot operation', async () => {
      // Create a snapshot first
      await mockExec('jj commit -m "Snapshot to undo"')

      render(<TestApp exec={mockExec} />)

      // Find and click undo button
      const undoButton = await screen.findByRole('button', { name: /undo last/i })
      fireEvent.click(undoButton)

      // Confirm undo
      const confirmButton = await screen.findByRole('button', { name: /confirm/i })
      fireEvent.click(confirmButton)

      await waitFor(() => {
        expect(mockExec).toHaveBeenCalledWith('jj undo')
      })

      // Verify success message
      await waitFor(() => {
        expect(screen.getByText(/undid last snapshot/i)).toBeInTheDocument()
      })
    })
  })

  describe('auto-snapshot integration', () => {
    it('should create auto-snapshots on tool execution', async () => {
      const interceptor = new ToolCallInterceptor(async (toolName: string) => {
        await mockExec(`jj commit -m "Auto-snapshot: Tool call (${toolName}) at ${new Date().toISOString()}"`)
      })

      // Register a test tool
      const mockTool = mock()
      mockTool.mockResolvedValue({ output: 'Tool executed successfully' })
      interceptor.registerTool({ toolName: 'test-tool', handler: mockTool })

      render(<TestApp exec={mockExec} />)

      // Simulate tool execution through interceptor
      await interceptor.executeTool('test-tool', { param: 'test-value' })

      // Verify auto-snapshot was created
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringMatching(/jj commit -m "Auto-snapshot: Tool call \(test-tool\) at \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z"/)
      )

      // Verify tool was executed
      expect(mockTool).toHaveBeenCalledWith({ param: 'test-value' })

      // Wait for UI to update with new snapshot
      await waitFor(() => {
        expect(screen.getByText(/Auto-snapshot: Tool call \(test-tool\)/)).toBeInTheDocument()
      })
    })

    it('should handle auto-snapshot toggle functionality', async () => {
      render(<TestApp exec={mockExec} />)

      // Find auto-snapshot toggle
      const toggleButton = await screen.findByRole('button', { name: /auto.snapshot.*enabled/i })
      fireEvent.click(toggleButton)

      // Verify toggle state changed
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /auto.snapshot.*disabled/i })).toBeInTheDocument()
      })

      // Toggle back on
      const disabledToggle = screen.getByRole('button', { name: /auto.snapshot.*disabled/i })
      fireEvent.click(disabledToggle)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /auto.snapshot.*enabled/i })).toBeInTheDocument()
      })
    })
  })

  describe('error handling and edge cases', () => {
    it('should handle JJ command failures gracefully', async () => {
      // Mock JJ to fail
      mockExec.mockRejectedValueOnce(new Error('jj: not a jj repo'))

      render(<TestApp exec={mockExec} />)

      // Try to create snapshot
      const createButton = await screen.findByRole('button', { name: /create snapshot/i })
      fireEvent.click(createButton)

      // Verify error message is displayed
      await waitFor(() => {
        expect(screen.getByText(/jj: not a jj repo/i)).toBeInTheDocument()
      })

      // Verify error styling
      const errorElement = screen.getByText(/jj: not a jj repo/i)
      expect(errorElement).toHaveClass('error')
    })

    it('should handle clean working directory scenario', async () => {
      // Mock clean status
      mockExec.mockImplementationOnce(async (command) => {
        if (command === 'jj status') {
          return {
            stdout: `Working copy changes:
(no changes)

Parent commit: base123 Initial setup
`
          }
        }
        throw new Error(`Unexpected command: ${command}`)
      })

      render(<TestApp exec={mockExec} />)

      // Try to create snapshot
      const createButton = await screen.findByRole('button', { name: /create snapshot/i })
      fireEvent.click(createButton)

      // Verify appropriate message
      await waitFor(() => {
        expect(screen.getByText(/no changes to snapshot/i)).toBeInTheDocument()
      })
    })

    it('should handle concurrent operations gracefully', async () => {
      // Make the first operation slow
      mockExec.mockImplementationOnce(async () => {
        await new Promise(resolve => setTimeout(resolve, 200))
        return { stdout: 'Created commit slow123\n' }
      })

      render(<TestApp exec={mockExec} />)

      const createButton = await screen.findByRole('button', { name: /create snapshot/i })

      // Start first operation
      fireEvent.click(createButton)

      // Try second operation immediately
      fireEvent.click(createButton)

      // Should show operation in progress message
      await waitFor(() => {
        expect(screen.getByText(/operation already in progress/i)).toBeInTheDocument()
      })

      // Wait for first operation to complete
      await waitFor(() => {
        expect(screen.getByText(/snapshot created successfully/i)).toBeInTheDocument()
      }, { timeout: 1000 })
    })
  })

  describe('UI state management', () => {
    it('should properly manage loading states during operations', async () => {
      // Make operation take some time
      mockExec.mockImplementationOnce(async () => {
        await new Promise(resolve => setTimeout(resolve, 100))
        return { stdout: 'Created commit loading123\n' }
      })

      render(<TestApp exec={mockExec} />)

      const createButton = await screen.findByRole('button', { name: /create snapshot/i })
      fireEvent.click(createButton)

      // Should show loading state
      await waitFor(() => {
        expect(screen.getByText(/creating snapshot/i)).toBeInTheDocument()
      })

      // Should hide loading state when done
      await waitFor(() => {
        expect(screen.queryByText(/creating snapshot/i)).not.toBeInTheDocument()
        expect(screen.getByText(/snapshot created successfully/i)).toBeInTheDocument()
      })
    })

    it('should refresh snapshot list after operations', async () => {
      render(<TestApp exec={mockExec} />)

      // Initial state should have no snapshots (except base)
      expect(screen.queryByText(/Auto-snapshot/)).not.toBeInTheDocument()

      // Create a snapshot
      const createButton = await screen.findByRole('button', { name: /create snapshot/i })
      fireEvent.click(createButton)

      // Should refresh and show new snapshot
      await waitFor(() => {
        expect(screen.getByText(/Manual snapshot at/)).toBeInTheDocument()
      })
    })
  })
})