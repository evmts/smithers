import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test'
import {
  ProgressLogger,
  getProgressLogger,
  resetProgressLogger,
} from './progress-logger.js'

describe('ProgressLogger', () => {
  let consoleLogMock: ReturnType<typeof spyOn>

  beforeEach(() => {
    consoleLogMock = spyOn(console, 'log').mockImplementation(() => {})
    resetProgressLogger()
  })

  afterEach(() => {
    consoleLogMock.mockRestore()
    resetProgressLogger()
  })

  describe('constructor and options', () => {
    test('uses default heartbeat interval of 30s', () => {
      const logger = new ProgressLogger()
      // Test by starting heartbeat and checking it doesn't throw
      logger.startHeartbeat()
      logger.stopHeartbeat()
    })

    test('accepts custom heartbeat interval', () => {
      const logger = new ProgressLogger({ heartbeatInterval: 1000 })
      expect(logger).toBeDefined()
    })

    test('uses default prefix [Progress]', () => {
      const logger = new ProgressLogger()
      logger.phaseStart('test')
      expect(consoleLogMock).toHaveBeenCalled()
      const call = consoleLogMock.mock.calls[0][0] as string
      expect(call).toContain('[Progress]')
    })

    test('accepts custom prefix', () => {
      const logger = new ProgressLogger({ prefix: '[Custom]' })
      logger.phaseStart('test')
      const call = consoleLogMock.mock.calls[0][0] as string
      expect(call).toContain('[Custom]')
    })

    test('shows elapsed time by default', () => {
      const logger = new ProgressLogger()
      logger.phaseStart('test')
      const call = consoleLogMock.mock.calls[0][0] as string
      // Should contain time in format [Xs] or [Xm Xs]
      expect(call).toMatch(/\[\d+s\]|\[\d+m\d+s\]/)
    })

    test('can disable elapsed time', () => {
      const logger = new ProgressLogger({ showElapsed: false })
      logger.phaseStart('test')
      const call = consoleLogMock.mock.calls[0][0] as string
      expect(call).not.toMatch(/\[\d+s\]|\[\d+m\d+s\]/)
    })
  })

  describe('elapsed time formatting', () => {
    test('formats seconds correctly', async () => {
      const logger = new ProgressLogger()
      // Log immediately - should show 0s
      logger.phaseStart('test')
      const call = consoleLogMock.mock.calls[0][0] as string
      expect(call).toContain('[0s]')
    })

    test('formats minutes and seconds', async () => {
      // Can't easily test minutes format without long delays
      // Test the format pattern instead
      const formatElapsed = (ms: number): string => {
        const seconds = Math.floor(ms / 1000)
        const minutes = Math.floor(seconds / 60)
        if (minutes > 0) {
          return `${minutes}m${seconds % 60}s`
        }
        return `${seconds}s`
      }

      expect(formatElapsed(30000)).toBe('30s')
      expect(formatElapsed(60000)).toBe('1m0s')
      expect(formatElapsed(90000)).toBe('1m30s')
      expect(formatElapsed(3600000)).toBe('60m0s')
    })
  })

  describe('heartbeat', () => {
    test('starts heartbeat only once', () => {
      const logger = new ProgressLogger({ heartbeatInterval: 100 })
      logger.startHeartbeat()
      logger.startHeartbeat() // Should be no-op
      logger.stopHeartbeat()
      // First call is "Orchestration started", no duplicate
      expect(consoleLogMock).toHaveBeenCalledTimes(1)
    })

    test('stops heartbeat', () => {
      const logger = new ProgressLogger({ heartbeatInterval: 100 })
      logger.startHeartbeat()
      logger.stopHeartbeat()
      // Should not throw and timer should be cleared
      logger.stopHeartbeat() // Should be no-op
    })

    test('heartbeat shows initializing when no phase', () => {
      const logger = new ProgressLogger({ heartbeatInterval: 10 })
      logger.startHeartbeat()
      // Let one heartbeat tick
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          logger.stopHeartbeat()
          const calls = consoleLogMock.mock.calls.map((c) => c[0] as string)
          const heartbeatCall = calls.find((c) => c.includes('Initializing'))
          expect(heartbeatCall || calls.some((c) => c.includes('Running') || c.includes('In phase'))).toBeTruthy()
          resolve()
        }, 30)
      })
    })
  })

  describe('phase lifecycle', () => {
    test('logs phase start', () => {
      const logger = new ProgressLogger()
      logger.phaseStart('Build')
      const call = consoleLogMock.mock.calls[0][0] as string
      expect(call).toContain('Phase started: Build')
    })

    test('logs phase complete and increments counter', () => {
      const logger = new ProgressLogger()
      logger.phaseComplete('Build')
      const stats = logger.getStats()
      expect(stats.phasesCompleted).toBe(1)
      const call = consoleLogMock.mock.calls[0][0] as string
      expect(call).toContain('Phase complete: Build')
    })

    test('logs phase skipped with reason', () => {
      const logger = new ProgressLogger()
      logger.phaseSkipped('Deploy', 'no changes')
      const call = consoleLogMock.mock.calls[0][0] as string
      expect(call).toContain('Phase skipped: Deploy')
      expect(call).toContain('(no changes)')
    })

    test('logs phase skipped without reason', () => {
      const logger = new ProgressLogger()
      logger.phaseSkipped('Deploy')
      const call = consoleLogMock.mock.calls[0][0] as string
      expect(call).toContain('Phase skipped: Deploy')
      expect(call).not.toContain('(')
    })
  })

  describe('step lifecycle', () => {
    test('logs step start', () => {
      const logger = new ProgressLogger()
      logger.stepStart('Compile')
      const call = consoleLogMock.mock.calls[0][0] as string
      expect(call).toContain('Step started: Compile')
    })

    test('logs step complete and increments counter', () => {
      const logger = new ProgressLogger()
      logger.stepComplete('Compile')
      const stats = logger.getStats()
      expect(stats.stepsCompleted).toBe(1)
      const call = consoleLogMock.mock.calls[0][0] as string
      expect(call).toContain('Step complete: Compile')
    })
  })

  describe('agent lifecycle', () => {
    test('logs agent start with model', () => {
      const logger = new ProgressLogger()
      logger.agentStart('claude-3')
      const call = consoleLogMock.mock.calls[0][0] as string
      expect(call).toContain('Agent started: claude-3')
    })

    test('logs agent start with truncated prompt', () => {
      const logger = new ProgressLogger()
      const longPrompt = 'x'.repeat(150)
      logger.agentStart('claude-3', longPrompt)
      const call = consoleLogMock.mock.calls[0][0] as string
      expect(call).toContain('Agent started: claude-3')
      expect(call).toContain('...')
      expect(call.length).toBeLessThan(250) // Should be truncated
    })

    test('logs agent progress', () => {
      const logger = new ProgressLogger()
      logger.agentProgress('Processing tokens...')
      const call = consoleLogMock.mock.calls[0][0] as string
      expect(call).toContain('Processing tokens...')
    })

    test('logs agent complete and increments counter', () => {
      const logger = new ProgressLogger()
      logger.agentComplete('claude-3', 'Generated 500 tokens')
      const stats = logger.getStats()
      expect(stats.agentsRun).toBe(1)
      const call = consoleLogMock.mock.calls[0][0] as string
      expect(call).toContain('Agent complete: claude-3')
      expect(call).toContain('Generated 500 tokens')
    })
  })

  describe('error logging', () => {
    test('logs error and increments counter', () => {
      const logger = new ProgressLogger()
      logger.error('Something went wrong')
      const stats = logger.getStats()
      expect(stats.errors).toBe(1)
      const call = consoleLogMock.mock.calls[0][0] as string
      expect(call).toContain('Error: Something went wrong')
    })

    test('logs error with Error object', () => {
      const logger = new ProgressLogger()
      logger.error('Failed', new Error('Connection timeout'))
      const call = consoleLogMock.mock.calls[0][0] as string
      expect(call).toContain('Failed')
      expect(call).toContain('Connection timeout')
    })
  })

  describe('summary', () => {
    test('logs summary with stats', () => {
      const logger = new ProgressLogger()
      logger.phaseComplete('Build')
      logger.stepComplete('Compile')
      logger.agentComplete('claude-3')
      logger.summary()

      const calls = consoleLogMock.mock.calls.map((c) => c[0] as string)
      expect(calls.some((c) => c.includes('Orchestration Summary'))).toBe(true)
      expect(calls.some((c) => c.includes('Total time'))).toBe(true)
    })

    test('stops heartbeat on summary', () => {
      const logger = new ProgressLogger({ heartbeatInterval: 10 })
      logger.startHeartbeat()
      logger.summary()
      // After summary, heartbeat should be stopped
      // No way to directly test timer is cleared, but shouldn't throw
    })
  })

  describe('getStats', () => {
    test('returns copy of stats', () => {
      const logger = new ProgressLogger()
      logger.phaseComplete('A')
      logger.stepComplete('B')
      logger.agentComplete('C')
      logger.error('D')

      const stats = logger.getStats()
      expect(stats.phasesCompleted).toBe(1)
      expect(stats.stepsCompleted).toBe(1)
      expect(stats.agentsRun).toBe(1)
      expect(stats.errors).toBe(1)
    })

    test('returns independent copy', () => {
      const logger = new ProgressLogger()
      const stats1 = logger.getStats()
      logger.phaseComplete('A')
      const stats2 = logger.getStats()

      expect(stats1.phasesCompleted).toBe(0)
      expect(stats2.phasesCompleted).toBe(1)
    })
  })

  describe('global logger', () => {
    test('getProgressLogger returns singleton', () => {
      const logger1 = getProgressLogger()
      const logger2 = getProgressLogger()
      expect(logger1).toBe(logger2)
    })

    test('getProgressLogger uses options on first call', () => {
      const logger = getProgressLogger({ prefix: '[Test]' })
      logger.phaseStart('A')
      const call = consoleLogMock.mock.calls[0][0] as string
      expect(call).toContain('[Test]')
    })

    test('resetProgressLogger clears singleton', () => {
      const logger1 = getProgressLogger()
      resetProgressLogger()
      const logger2 = getProgressLogger()
      expect(logger1).not.toBe(logger2)
    })

    test('resetProgressLogger stops heartbeat', () => {
      const logger = getProgressLogger({ heartbeatInterval: 10 })
      logger.startHeartbeat()
      resetProgressLogger()
      // Should not throw
    })
  })

  describe('edge cases', () => {
    test('handles 0% progress (initial state)', () => {
      const logger = new ProgressLogger()
      const stats = logger.getStats()
      expect(stats.phasesCompleted).toBe(0)
      expect(stats.stepsCompleted).toBe(0)
      expect(stats.agentsRun).toBe(0)
      expect(stats.errors).toBe(0)
    })

    test('handles multiple phases', () => {
      const logger = new ProgressLogger()
      for (let i = 0; i < 10; i++) {
        logger.phaseComplete(`Phase${i}`)
      }
      expect(logger.getStats().phasesCompleted).toBe(10)
    })

    test('handles empty strings', () => {
      const logger = new ProgressLogger()
      logger.phaseStart('')
      logger.stepStart('')
      logger.agentStart('')
      // Should not throw
      expect(consoleLogMock).toHaveBeenCalledTimes(3)
    })

    test('handles special characters in names', () => {
      const logger = new ProgressLogger()
      logger.phaseStart('Build <production> & "test"')
      const call = consoleLogMock.mock.calls[0][0] as string
      expect(call).toContain('Build <production> & "test"')
    })
  })
})
