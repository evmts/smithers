import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test'
import * as display from '../src/cli/display.js'
import { LoaderError, SyntaxLoadError } from '../src/cli/loader.js'

/**
 * Display Module Unit Tests
 *
 * Tests the CLI display/output functions:
 * - displayPlan: Shows XML plan with syntax highlighting
 * - displayFrame: Shows execution frame results
 * - displayResult: Shows final execution results
 * - displayError: Shows formatted errors
 * - info, success, warn: Utility message functions
 */
describe('display module', () => {
  let originalLog: typeof console.log
  let originalError: typeof console.error
  let logOutput: string[]
  let errorOutput: string[]

  beforeEach(() => {
    // Capture console output
    originalLog = console.log
    originalError = console.error
    logOutput = []
    errorOutput = []

    console.log = (...args: unknown[]) => {
      logOutput.push(args.map(String).join(' '))
    }
    console.error = (...args: unknown[]) => {
      errorOutput.push(args.map(String).join(' '))
    }
  })

  afterEach(() => {
    // Restore console
    console.log = originalLog
    console.error = originalError
  })

  describe('displayPlan', () => {
    it('displays XML plan with header', () => {
      const xml = '<claude><step>Test</step></claude>'
      display.displayPlan(xml)

      const output = logOutput.join('\n')
      expect(output).toContain('Plan')
      expect(output).toContain('claude')
      expect(output).toContain('step')
      expect(output).toContain('Test')
    })

    it('includes frame number when provided', () => {
      const xml = '<claude>Content</claude>'
      display.displayPlan(xml, 5)

      const output = logOutput.join('\n')
      expect(output).toContain('Frame 5')
    })

    it('displays dividers', () => {
      const xml = '<test>Content</test>'
      display.displayPlan(xml)

      const output = logOutput.join('\n')
      // Check for divider characters
      expect(output).toContain('─')
    })

    it('handles empty XML', () => {
      display.displayPlan('')

      const output = logOutput.join('\n')
      expect(output).toContain('Plan')
    })

    it('handles complex nested XML', () => {
      const xml = `<agent name="test">
        <phase name="research">
          <step>Search</step>
          <step>Analyze</step>
        </phase>
        <phase name="report">
          <step>Write</step>
        </phase>
      </agent>`

      display.displayPlan(xml)

      const output = logOutput.join('\n')
      expect(output).toContain('research')
      expect(output).toContain('report')
      expect(output).toContain('Search')
      expect(output).toContain('Analyze')
    })

    it('handles XML with attributes', () => {
      const xml = '<phase name="test" priority="high">Content</phase>'
      display.displayPlan(xml)

      const output = logOutput.join('\n')
      expect(output).toContain('name')
      expect(output).toContain('test')
      expect(output).toContain('priority')
      expect(output).toContain('high')
    })
  })

  describe('displayFrame', () => {
    it('displays frame number and executed nodes', () => {
      display.displayFrame(3, ['claude', 'subagent'], 150)

      const output = logOutput.join('\n')
      expect(output).toContain('Frame 3')
      expect(output).toContain('claude')
      expect(output).toContain('subagent')
      expect(output).toContain('150')
    })

    it('handles single node', () => {
      display.displayFrame(1, ['claude'], 50)

      const output = logOutput.join('\n')
      expect(output).toContain('Frame 1')
      expect(output).toContain('claude')
      expect(output).toContain('50')
    })

    it('handles many nodes', () => {
      const nodes = ['node1', 'node2', 'node3', 'node4', 'node5']
      display.displayFrame(10, nodes, 500)

      const output = logOutput.join('\n')
      expect(output).toContain('node1')
      expect(output).toContain('node5')
    })

    it('shows duration', () => {
      display.displayFrame(1, ['test'], 1234)

      const output = logOutput.join('\n')
      expect(output).toContain('1234')
      expect(output).toContain('ms')
    })
  })

  describe('displayResult', () => {
    it('displays completion message', () => {
      display.displayResult({ status: 'success' }, 5, 1000)

      const output = logOutput.join('\n')
      expect(output).toContain('Complete')
    })

    it('displays frame count', () => {
      display.displayResult('output', 10, 500)

      const output = logOutput.join('\n')
      expect(output).toContain('10')
      expect(output).toContain('Frames')
    })

    it('displays duration', () => {
      display.displayResult('output', 3, 2500)

      const output = logOutput.join('\n')
      expect(output).toContain('2500')
      expect(output).toContain('Duration')
    })

    it('displays JSON output for objects', () => {
      const output = { result: 'success', data: [1, 2, 3] }
      display.displayResult(output, 1, 100)

      const consoleOutput = logOutput.join('\n')
      expect(consoleOutput).toContain('result')
      expect(consoleOutput).toContain('success')
      expect(consoleOutput).toContain('1')
      expect(consoleOutput).toContain('2')
      expect(consoleOutput).toContain('3')
    })

    it('displays string output', () => {
      display.displayResult('Simple string output', 1, 50)

      const output = logOutput.join('\n')
      expect(output).toContain('Simple string output')
    })

    it('handles null output', () => {
      display.displayResult(null, 1, 50)

      const output = logOutput.join('\n')
      expect(output).toContain('null')
    })
  })

  describe('displayError', () => {
    it('displays basic Error message', () => {
      const error = new Error('Something went wrong')
      display.displayError(error)

      const output = errorOutput.join('\n')
      expect(output).toContain('Error')
      expect(output).toContain('Something went wrong')
    })

    it('displays LoaderError with formatting', () => {
      const error = new LoaderError('File not found', '/path/to/file.tsx', [
        'Check the path',
      ])
      display.displayError(error)

      const output = errorOutput.join('\n')
      expect(output).toContain('Error')
      expect(output).toContain('File not found')
      expect(output).toContain('/path/to/file.tsx')
      expect(output).toContain('Check the path')
    })

    it('displays SyntaxLoadError with line info', () => {
      const error = new SyntaxLoadError('Parse error', '/file.tsx', {
        line: 10,
        column: 5,
        suggestions: ['Fix syntax'],
      })
      display.displayError(error)

      const output = errorOutput.join('\n')
      expect(output).toContain('Parse error')
      expect(output).toContain('/file.tsx')
    })

    it('handles error without stack trace', () => {
      const error = new Error('No stack')
      delete error.stack

      display.displayError(error)

      const output = errorOutput.join('\n')
      expect(output).toContain('Error')
      expect(output).toContain('No stack')
    })
  })

  describe('info', () => {
    it('displays info message with icon', () => {
      display.info('This is an info message')

      const output = logOutput.join('\n')
      expect(output).toContain('This is an info message')
      // Should contain info icon (ℹ) or similar indicator
    })

    it('handles empty message', () => {
      display.info('')

      expect(logOutput.length).toBe(1)
    })

    it('handles message with special characters', () => {
      display.info('Check /path/to/file.tsx for more info')

      const output = logOutput.join('\n')
      expect(output).toContain('/path/to/file.tsx')
    })
  })

  describe('success', () => {
    it('displays success message with icon', () => {
      display.success('Operation completed successfully')

      const output = logOutput.join('\n')
      expect(output).toContain('Operation completed successfully')
      // Should contain success icon (✓) or similar indicator
    })

    it('handles empty message', () => {
      display.success('')

      expect(logOutput.length).toBe(1)
    })
  })

  describe('warn', () => {
    it('displays warning message with icon', () => {
      display.warn('This might cause issues')

      const output = logOutput.join('\n')
      expect(output).toContain('This might cause issues')
      // Should contain warning icon (⚠) or similar indicator
    })

    it('handles empty message', () => {
      display.warn('')

      expect(logOutput.length).toBe(1)
    })

    it('handles long message', () => {
      const longMessage = 'A'.repeat(200)
      display.warn(longMessage)

      const output = logOutput.join('\n')
      expect(output).toContain(longMessage)
    })
  })
})

describe('XML Highlighting Integration', () => {
  let originalLog: typeof console.log
  let logOutput: string[]

  beforeEach(() => {
    originalLog = console.log
    logOutput = []
    console.log = (...args: unknown[]) => {
      logOutput.push(args.map(String).join(' '))
    }
  })

  afterEach(() => {
    console.log = originalLog
  })

  it('highlights self-closing tags', () => {
    const xml = '<input type="text" />'
    display.displayPlan(xml)

    const output = logOutput.join('\n')
    expect(output).toContain('input')
    expect(output).toContain('type')
    expect(output).toContain('text')
  })

  it('highlights closing tags', () => {
    const xml = '<div>Content</div>'
    display.displayPlan(xml)

    const output = logOutput.join('\n')
    expect(output).toContain('div')
    expect(output).toContain('Content')
    expect(output).toContain('/div') // Closing tag
  })

  it('handles XML with CDATA', () => {
    const xml = '<script><![CDATA[function test() {}]]></script>'
    display.displayPlan(xml)

    const output = logOutput.join('\n')
    expect(output).toContain('script')
    expect(output).toContain('CDATA')
  })

  it('handles XML with comments', () => {
    const xml = '<root><!-- This is a comment --><child>Value</child></root>'
    display.displayPlan(xml)

    const output = logOutput.join('\n')
    expect(output).toContain('root')
    expect(output).toContain('child')
    expect(output).toContain('Value')
  })

  it('handles multi-line XML', () => {
    const xml = `<agent>
  <phase name="research">
    <step>
      Search for information
    </step>
  </phase>
</agent>`

    display.displayPlan(xml)

    const output = logOutput.join('\n')
    expect(output).toContain('agent')
    expect(output).toContain('phase')
    expect(output).toContain('research')
    expect(output).toContain('step')
    expect(output).toContain('Search for information')
  })
})
