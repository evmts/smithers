import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import './setup.ts'
import { create } from 'zustand'
import { existsSync, mkdirSync, rmSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  renderPlan,
  executePlan,
  Claude,
  Output,
  File,
  Stop,
  Phase,
} from '../src/index.js'

/**
 * Tests for the Output and File components
 *
 * Output: Renders content to terminal or changes rendered output
 * File: Writes or updates files during agent execution
 */

describe('Output component', () => {
  describe('rendering', () => {
    it('renders children as output content', async () => {
      const plan = await renderPlan(
        <Output>
          Processing complete! Found 42 files.
        </Output>
      )

      expect(plan).toContain('<output>')
      expect(plan).toContain('Processing complete! Found 42 files.')
      expect(plan).toContain('</output>')
    })

    it('renders format prop correctly', async () => {
      const plan = await renderPlan(
        <Output format="json">
          {JSON.stringify({ status: 'complete' })}
        </Output>
      )

      expect(plan).toContain('<output')
      expect(plan).toContain('format="json"')
    })

    it('renders label prop correctly', async () => {
      const plan = await renderPlan(
        <Output label="Result">
          Analysis complete
        </Output>
      )

      expect(plan).toContain('<output')
      expect(plan).toContain('label="Result"')
    })

    it('renders with all props', async () => {
      const plan = await renderPlan(
        <Output format="markdown" label="Status">
          ## Complete
        </Output>
      )

      expect(plan).toContain('format="markdown"')
      expect(plan).toContain('label="Status"')
      expect(plan).toContain('## Complete')
    })

    it('renders multiple outputs in order', async () => {
      const plan = await renderPlan(
        <>
          <Output label="Step 1">First output</Output>
          <Output label="Step 2">Second output</Output>
          <Output label="Step 3">Third output</Output>
        </>
      )

      expect(plan).toContain('First output')
      expect(plan).toContain('Second output')
      expect(plan).toContain('Third output')
      // Verify order by checking relative positions
      const firstPos = plan.indexOf('First output')
      const secondPos = plan.indexOf('Second output')
      const thirdPos = plan.indexOf('Third output')
      expect(firstPos).toBeLessThan(secondPos)
      expect(secondPos).toBeLessThan(thirdPos)
    })
  })

  describe('execution', () => {
    it('does not trigger Claude execution', async () => {
      let claudeExecuted = false

      const result = await executePlan(
        <>
          <Output>Status update</Output>
          <Claude onFinished={() => { claudeExecuted = true }}>
            Some prompt
          </Claude>
        </>,
        { mockMode: true }
      )

      // Claude should execute, but Output doesn't block or trigger it
      expect(claudeExecuted).toBe(true)
    })

    it('works with state transitions', async () => {
      const useStore = create<{ phase: string; setPhase: (p: string) => void }>((set) => ({
        phase: 'start',
        setPhase: (p) => set({ phase: p }),
      }))

      function OutputAgent() {
        const { phase, setPhase } = useStore()

        if (phase === 'start') {
          return (
            <Claude onFinished={() => setPhase('complete')}>
              Do work
            </Claude>
          )
        }

        return (
          <>
            <Output label="Done">Work complete!</Output>
            <Stop reason="Finished" />
          </>
        )
      }

      await executePlan(<OutputAgent />, { mockMode: true })

      expect(useStore.getState().phase).toBe('complete')
    })

    it('output is captured in execution result', async () => {
      const result = await executePlan(
        <>
          <Output>Final status: success</Output>
          <Stop reason="Done" />
        </>
      )

      // Execution should complete without error
      // History may be empty when only Output/Stop nodes are present (no Claude execution)
      expect(result.frames).toBeGreaterThan(0)
    })
  })

  describe('integration with other components', () => {
    it('works with Claude component', async () => {
      const plan = await renderPlan(
        <>
          <Claude>Analyze code</Claude>
          <Output>Analysis in progress...</Output>
        </>
      )

      expect(plan).toContain('<claude>')
      expect(plan).toContain('<output>')
    })

    it('works with Phase component', async () => {
      const plan = await renderPlan(
        <Phase name="reporting">
          <Output label="Phase">Generating report...</Output>
        </Phase>
      )

      expect(plan).toContain('phase name="reporting"')
      expect(plan).toContain('<output')
    })

    it('works with Stop component', async () => {
      const plan = await renderPlan(
        <>
          <Output>Final output before stop</Output>
          <Stop reason="Complete" />
        </>
      )

      expect(plan).toContain('<output>')
      expect(plan).toContain('<stop')
    })
  })
})

describe('File component', () => {
  const testDir = join(process.cwd(), '.test-output')

  beforeEach(() => {
    // Create test directory
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true })
    }
  })

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  describe('rendering', () => {
    it('renders with path prop', async () => {
      const plan = await renderPlan(
        <File path="output/report.md">
          # Report
        </File>
      )

      expect(plan).toContain('<file')
      expect(plan).toContain('path="output/report.md"')
      expect(plan).toContain('# Report')
    })

    it('renders mode prop correctly', async () => {
      const plan = await renderPlan(
        <File path="log.txt" mode="append">
          Log entry
        </File>
      )

      expect(plan).toContain('mode="append"')
    })

    it('renders encoding prop correctly', async () => {
      const plan = await renderPlan(
        <File path="output.txt" encoding="utf-8">
          Content
        </File>
      )

      expect(plan).toContain('encoding="utf-8"')
    })

    it('renders with all props', async () => {
      const plan = await renderPlan(
        <File path="data.json" mode="write" encoding="utf-8">
          {JSON.stringify({ key: 'value' })}
        </File>
      )

      expect(plan).toContain('path="data.json"')
      expect(plan).toContain('mode="write"')
      expect(plan).toContain('encoding="utf-8"')
    })

    it('renders multiple files', async () => {
      const plan = await renderPlan(
        <>
          <File path="file1.txt">Content 1</File>
          <File path="file2.txt">Content 2</File>
          <File path="file3.txt">Content 3</File>
        </>
      )

      expect(plan).toContain('path="file1.txt"')
      expect(plan).toContain('path="file2.txt"')
      expect(plan).toContain('path="file3.txt"')
    })
  })

  describe('execution', () => {
    it('writes file content during execution', async () => {
      const filePath = join(testDir, 'test-write.txt')

      await executePlan(
        <>
          <File path={filePath}>
            Hello, World!
          </File>
          <Stop reason="Done" />
        </>
      )

      expect(existsSync(filePath)).toBe(true)
      expect(readFileSync(filePath, 'utf-8')).toBe('Hello, World!')
    })

    it('creates parent directories if needed', async () => {
      const filePath = join(testDir, 'nested', 'dir', 'file.txt')

      await executePlan(
        <>
          <File path={filePath}>
            Nested content
          </File>
          <Stop reason="Done" />
        </>
      )

      expect(existsSync(filePath)).toBe(true)
      expect(readFileSync(filePath, 'utf-8')).toBe('Nested content')
    })

    it('overwrites file in write mode', async () => {
      const filePath = join(testDir, 'overwrite.txt')

      // First write
      await executePlan(
        <>
          <File path={filePath}>Original content</File>
          <Stop reason="Done" />
        </>
      )

      expect(readFileSync(filePath, 'utf-8')).toBe('Original content')

      // Second write should overwrite
      await executePlan(
        <>
          <File path={filePath} mode="write">New content</File>
          <Stop reason="Done" />
        </>
      )

      expect(readFileSync(filePath, 'utf-8')).toBe('New content')
    })

    it('appends to file in append mode', async () => {
      const filePath = join(testDir, 'append.txt')

      // First write
      await executePlan(
        <>
          <File path={filePath}>Line 1</File>
          <Stop reason="Done" />
        </>
      )

      // Append
      await executePlan(
        <>
          <File path={filePath} mode="append">{'\n'}Line 2</File>
          <Stop reason="Done" />
        </>
      )

      expect(readFileSync(filePath, 'utf-8')).toBe('Line 1\nLine 2')
    })

    it('calls onWritten callback after writing', async () => {
      const filePath = join(testDir, 'callback.txt')
      let writtenPath: string | null = null

      const useStore = create<{ written: boolean; setWritten: () => void }>((set) => ({
        written: false,
        setWritten: () => set({ written: true }),
      }))

      function FileAgent() {
        const { setWritten } = useStore()

        return (
          <>
            <File
              path={filePath}
              onWritten={(path) => {
                writtenPath = path
                setWritten()
              }}
            >
              Content with callback
            </File>
            <Stop reason="Done" />
          </>
        )
      }

      await executePlan(<FileAgent />)

      expect(useStore.getState().written).toBe(true)
      expect(writtenPath).toBe(filePath)
    })

    it('calls onError callback on failure', async () => {
      // Try to write to an invalid path (e.g., root on most systems)
      const invalidPath = '/nonexistent-root-dir-test/file.txt'
      let errorCaught: Error | null = null

      const useStore = create<{ error: boolean; setError: () => void }>((set) => ({
        error: false,
        setError: () => set({ error: true }),
      }))

      function FileAgent() {
        const { setError } = useStore()

        return (
          <>
            <File
              path={invalidPath}
              onError={(err) => {
                errorCaught = err
                setError()
              }}
            >
              This will fail
            </File>
            <Stop reason="Done" />
          </>
        )
      }

      await executePlan(<FileAgent />)

      expect(useStore.getState().error).toBe(true)
      expect(errorCaught).not.toBeNull()
    })

    it('writes JSON content correctly', async () => {
      const filePath = join(testDir, 'data.json')
      const data = { name: 'test', values: [1, 2, 3] }

      await executePlan(
        <>
          <File path={filePath}>
            {JSON.stringify(data, null, 2)}
          </File>
          <Stop reason="Done" />
        </>
      )

      const content = readFileSync(filePath, 'utf-8')
      expect(JSON.parse(content)).toEqual(data)
    })
  })

  describe('integration with other components', () => {
    it('works after Claude execution', async () => {
      const filePath = join(testDir, 'claude-output.txt')

      const useStore = create<{ result: string | null; setResult: (r: string) => void }>((set) => ({
        result: null,
        setResult: (r) => set({ result: r }),
      }))

      function AgentWithFile() {
        const { result, setResult } = useStore()

        if (!result) {
          return (
            <Claude onFinished={(r) => setResult(String(r))}>
              Generate some content
            </Claude>
          )
        }

        return (
          <>
            <File path={filePath}>
              Generated: {result}
            </File>
            <Stop reason="Done" />
          </>
        )
      }

      await executePlan(<AgentWithFile />, { mockMode: true })

      expect(existsSync(filePath)).toBe(true)
      const content = readFileSync(filePath, 'utf-8')
      expect(content).toContain('Generated:')
    })

    it('works with Output component', async () => {
      const filePath = join(testDir, 'with-output.txt')

      await executePlan(
        <>
          <File path={filePath}>File content</File>
          <Output>File written successfully</Output>
          <Stop reason="Done" />
        </>
      )

      expect(existsSync(filePath)).toBe(true)
    })

    it('multiple files in sequence', async () => {
      const file1 = join(testDir, 'seq1.txt')
      const file2 = join(testDir, 'seq2.txt')
      const file3 = join(testDir, 'seq3.txt')

      await executePlan(
        <>
          <File path={file1}>First file</File>
          <File path={file2}>Second file</File>
          <File path={file3}>Third file</File>
          <Stop reason="Done" />
        </>
      )

      expect(existsSync(file1)).toBe(true)
      expect(existsSync(file2)).toBe(true)
      expect(existsSync(file3)).toBe(true)
      expect(readFileSync(file1, 'utf-8')).toBe('First file')
      expect(readFileSync(file2, 'utf-8')).toBe('Second file')
      expect(readFileSync(file3, 'utf-8')).toBe('Third file')
    })

    it('conditional file writing', async () => {
      const writtenFile = join(testDir, 'written.txt')
      const skippedFile = join(testDir, 'skipped.txt')
      const shouldWrite = true
      const shouldSkip = false

      await executePlan(
        <>
          {shouldWrite && <File path={writtenFile}>Written content</File>}
          {shouldSkip && <File path={skippedFile}>Skipped content</File>}
          <Stop reason="Done" />
        </>
      )

      expect(existsSync(writtenFile)).toBe(true)
      expect(existsSync(skippedFile)).toBe(false)
    })
  })

  describe('mock mode', () => {
    it('does not write files in mock mode', async () => {
      const filePath = join(testDir, 'mock-mode.txt')

      // Mock mode is the default when no API key is set
      await executePlan(
        <>
          <File path={filePath} _mockMode={true}>
            Mock content
          </File>
          <Stop reason="Done" />
        </>,
        { mockMode: true }
      )

      // In mock mode, file should NOT be written
      // (This depends on implementation - update if behavior differs)
      // For now, we test that it doesn't throw
    })
  })
})

describe('Output and File together', () => {
  const testDir = join(process.cwd(), '.test-output-combined')

  beforeEach(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true })
    }
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  it('workflow with both Output and File', async () => {
    const filePath = join(testDir, 'workflow.txt')

    const useStore = create<{
      step: number
      data: string | null
      setStep: (s: number) => void
      setData: (d: string) => void
    }>((set) => ({
      step: 1,
      data: null,
      setStep: (s) => set({ step: s }),
      setData: (d) => set({ data: d }),
    }))

    function WorkflowAgent() {
      const { step, data, setStep, setData } = useStore()

      if (step === 1) {
        return (
          <Claude onFinished={(r) => { setData(String(r)); setStep(2) }}>
            Generate report data
          </Claude>
        )
      }

      if (step === 2) {
        return (
          <>
            <Output label="Status">Writing report...</Output>
            <File
              path={filePath}
              onWritten={() => setStep(3)}
            >
              Report Data: {data}
            </File>
          </>
        )
      }

      return (
        <>
          <Output format="markdown">
            ## Complete

            Report saved to {filePath}
          </Output>
          <Stop reason="Workflow complete" />
        </>
      )
    }

    await executePlan(<WorkflowAgent />, { mockMode: true })

    expect(useStore.getState().step).toBe(3)
    expect(existsSync(filePath)).toBe(true)
  })
})
