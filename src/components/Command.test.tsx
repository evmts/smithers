import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import React from 'react'
import { Command, type CommandResult } from './Command.js'
import { SmithersProvider } from './SmithersProvider.js'
import { createSmithersRoot, type SmithersRoot } from '../reconciler/root.js'
import { createSmithersDB, type SmithersDB } from '../db/index.js'

describe('Command', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-command', 'Command.test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    root.dispose()
    db.close()
  })

  const waitFor = async (
    condition: () => boolean,
    { timeout = 5000 }: { timeout?: number } = {}
  ): Promise<void> => {
    const start = Date.now()
    while (!condition()) {
      if (Date.now() - start > timeout) {
        throw new Error('waitFor timeout')
      }
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }

  describe('basic execution', () => {
    test('executes string command via shell', async () => {
      let capturedResult: CommandResult | undefined
      const onFinished = mock((result: CommandResult) => {
        capturedResult = result
      })

      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Command cmd="echo hello" onFinished={onFinished} />
        </SmithersProvider>
      )

      await waitFor(() => capturedResult !== undefined)

      expect(capturedResult?.stdout.trim()).toBe('hello')
      expect(capturedResult?.exitCode).toBe(0)
      expect(capturedResult?.success).toBe(true)
      expect(capturedResult?.durationMs).toBeGreaterThan(0)
      expect(onFinished).toHaveBeenCalledTimes(1)
    })

    test('executes array command directly', async () => {
      let capturedResult: CommandResult | undefined
      const onFinished = mock((result: CommandResult) => {
        capturedResult = result
      })

      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Command cmd={['echo', 'hello', 'world']} onFinished={onFinished} />
        </SmithersProvider>
      )

      await waitFor(() => capturedResult !== undefined)

      expect(capturedResult?.stdout.trim()).toBe('hello world')
      expect(capturedResult?.exitCode).toBe(0)
      expect(capturedResult?.success).toBe(true)
    })

    test('executes string cmd with args array', async () => {
      let capturedResult: CommandResult | undefined
      const onFinished = mock((result: CommandResult) => {
        capturedResult = result
      })

      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Command cmd="echo" args={['foo', 'bar']} onFinished={onFinished} />
        </SmithersProvider>
      )

      await waitFor(() => capturedResult !== undefined)

      expect(capturedResult?.stdout.trim()).toBe('foo bar')
    })
  })

  describe('error handling', () => {
    test('calls onError for failed commands', async () => {
      let capturedError: CommandResult | undefined
      const onError = mock((error: CommandResult) => {
        capturedError = error
      })

      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Command cmd="bash -c 'exit 1'" onError={onError} />
        </SmithersProvider>
      )

      await waitFor(() => capturedError !== undefined)

      expect(capturedError?.exitCode).toBe(1)
      expect(capturedError?.success).toBe(false)
      expect(onError).toHaveBeenCalledTimes(1)
    })

    test('captures stderr on failure', async () => {
      let capturedError: CommandResult | undefined
      const onError = mock((error: CommandResult) => {
        capturedError = error
      })

      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Command cmd="bash -c 'echo error >&2; exit 1'" onError={onError} />
        </SmithersProvider>
      )

      await waitFor(() => capturedError !== undefined)

      expect(capturedError?.stderr.trim()).toBe('error')
      expect(capturedError?.success).toBe(false)
    })
  })

  describe('cwd option', () => {
    test('executes in specified directory', async () => {
      let capturedResult: CommandResult | undefined
      const onFinished = mock((result: CommandResult) => {
        capturedResult = result
      })

      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Command cmd="pwd" cwd="/tmp" onFinished={onFinished} />
        </SmithersProvider>
      )

      await waitFor(() => capturedResult !== undefined)

      // macOS symlinks /tmp to /private/tmp
      expect(capturedResult?.stdout.trim()).toMatch(/^(\/tmp|\/private\/tmp)$/)
    })
  })

  describe('environment variables', () => {
    test('passes custom env vars', async () => {
      let capturedResult: CommandResult | undefined
      const onFinished = mock((result: CommandResult) => {
        capturedResult = result
      })

      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Command
            cmd="bash -c 'echo $MY_VAR'"
            env={{ MY_VAR: 'custom_value' }}
            onFinished={onFinished}
          />
        </SmithersProvider>
      )

      await waitFor(() => capturedResult !== undefined)

      expect(capturedResult?.stdout.trim()).toBe('custom_value')
    })
  })

  describe('timeout', () => {
    test('times out long-running commands', async () => {
      let capturedError: CommandResult | undefined
      const onError = mock((error: CommandResult) => {
        capturedError = error
      })

      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Command cmd="sleep 10" timeout={100} onError={onError} />
        </SmithersProvider>
      )

      await waitFor(() => capturedError !== undefined)

      expect(capturedError?.success).toBe(false)
    })
  })

  describe('children render function', () => {
    test('renders children with result after completion', async () => {
      let renderedOutput = ''

      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Command cmd="echo test_output">
            {(result) => {
              renderedOutput = result.stdout.trim()
              return <task>{result.stdout.trim()}</task>
            }}
          </Command>
        </SmithersProvider>
      )

      await waitFor(() => renderedOutput === 'test_output')

      expect(renderedOutput).toBe('test_output')
    })
  })

  describe('shell features', () => {
    test('supports pipes in string form', async () => {
      let capturedResult: CommandResult | undefined
      const onFinished = mock((result: CommandResult) => {
        capturedResult = result
      })

      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Command cmd="echo hello | tr 'h' 'H'" onFinished={onFinished} />
        </SmithersProvider>
      )

      await waitFor(() => capturedResult !== undefined)

      expect(capturedResult?.stdout.trim()).toBe('Hello')
    })

    test('supports && chaining in string form', async () => {
      let capturedResult: CommandResult | undefined
      const onFinished = mock((result: CommandResult) => {
        capturedResult = result
      })

      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Command cmd="echo first && echo second" onFinished={onFinished} />
        </SmithersProvider>
      )

      await waitFor(() => capturedResult !== undefined)

      expect(capturedResult?.stdout.trim()).toContain('first')
      expect(capturedResult?.stdout.trim()).toContain('second')
    })
  })

  describe('XML output', () => {
    test('renders command element with status attribute', async () => {
      await root.render(
        <SmithersProvider db={db} executionId={executionId}>
          <Command cmd="echo test" />
        </SmithersProvider>
      )

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 200))

      const xml = root.toXML()
      expect(xml).toContain('<command')
      expect(xml).toContain('status=')
    })
  })
})
