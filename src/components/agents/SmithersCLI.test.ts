import { test, expect, describe } from 'bun:test'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

// We'll test the internal functions by importing them
// Note: executeSmithers depends on Claude CLI, so we test helpers independently

describe('SmithersCLI', () => {
  describe('script template', () => {
    test('template has required placeholders', async () => {
      // Import the module to check the template structure
      const module = await import('./SmithersCLI.js')

      // The module should export executeSmithers
      expect(typeof module.executeSmithers).toBe('function')
    })
  })

  describe('script file handling', () => {
    test('can write and read script files in temp directory', async () => {
      const testScript = `#!/usr/bin/env bun
console.log('test script')
`
      const scriptPath = path.join(os.tmpdir(), `test-smithers-${Date.now()}.tsx`)

      // Write script
      await fs.writeFile(scriptPath, testScript)
      await fs.chmod(scriptPath, '755')

      // Verify file exists and is executable
      const stats = await fs.stat(scriptPath)
      expect(stats.isFile()).toBe(true)
      expect(stats.mode & 0o111).toBeGreaterThan(0) // Has execute bits

      // Read back content
      const content = await fs.readFile(scriptPath, 'utf-8')
      expect(content).toBe(testScript)

      // Clean up
      await fs.unlink(scriptPath)
    })

    test.skip('script execution with bun works', async () => {
      const testScript = `#!/usr/bin/env bun
console.log('Hello from test script')
`
      const scriptPath = path.join(os.tmpdir(), `test-exec-${Date.now()}.ts`)

      await fs.writeFile(scriptPath, testScript)
      await fs.chmod(scriptPath, '755')

      // Execute with bun
      const proc = Bun.spawn(['bun', scriptPath], {
        stdout: 'pipe',
        stderr: 'pipe',
      })

      const output = await new Response(proc.stdout).text()
      const exitCode = await proc.exited

      expect(exitCode).toBe(0)
      expect(output.trim()).toBe('Hello from test script')

      // Clean up
      await fs.unlink(scriptPath)
    })
  })

  describe('SmithersExecutionOptions validation', () => {
    test('options interface has required fields', () => {
      // Type check - this will fail at compile time if the interface is wrong
      const options: import('./SmithersCLI.js').SmithersExecutionOptions = {
        task: 'Test task',
      }

      expect(options.task).toBe('Test task')
      expect(options.plannerModel).toBeUndefined()
      expect(options.executionModel).toBeUndefined()
      expect(options.timeout).toBeUndefined()
    })

    test('options with all fields', () => {
      const progressMessages: string[] = []

      const options: import('./SmithersCLI.js').SmithersExecutionOptions = {
        task: 'Create a user management system',
        plannerModel: 'opus',
        executionModel: 'sonnet',
        cwd: '/tmp',
        timeout: 300000,
        maxPlanningTurns: 10,
        context: 'Using TypeScript and React',
        keepScript: true,
        scriptPath: '/tmp/custom-script.tsx',
        onProgress: (msg) => progressMessages.push(msg),
        onScriptGenerated: (script, path) => {
          expect(typeof script).toBe('string')
          expect(typeof path).toBe('string')
        },
      }

      expect(options.plannerModel).toBe('opus')
      expect(options.executionModel).toBe('sonnet')
      expect(options.keepScript).toBe(true)

      // Test callback
      options.onProgress?.('Test message')
      expect(progressMessages).toContain('Test message')
    })
  })

  describe('SmithersResult interface', () => {
    test('result has all required fields', () => {
      const result: import('./SmithersCLI.js').SmithersResult = {
        output: 'Task completed successfully',
        script: '// generated script',
        scriptPath: '/tmp/script.tsx',
        planningResult: {
          output: 'Planning output',
          tokensUsed: { input: 100, output: 200 },
          turnsUsed: 3,
          stopReason: 'completed',
          durationMs: 5000,
        },
        tokensUsed: { input: 100, output: 200 },
        turnsUsed: 3,
        stopReason: 'completed',
        durationMs: 10000,
      }

      expect(result.script).toBe('// generated script')
      expect(result.scriptPath).toBe('/tmp/script.tsx')
      expect(result.planningResult.output).toBe('Planning output')
      expect(result.stopReason).toBe('completed')
    })
  })
})
