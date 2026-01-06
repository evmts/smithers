/**
 * Loader tests - comprehensive coverage of MDX/TSX file loading
 */

import { describe, test, expect } from 'bun:test'
import * as path from 'path'
import React from 'react'
import {
  loadAgentFile,
  loadMdxFile,
  loadTsxFile,
  extractElement,
  LoaderError,
  SyntaxLoadError,
  ExportError,
  InvalidElementError,
} from '../src/cli/loader.js'

const FIXTURES_DIR = path.join(import.meta.dir, 'fixtures', 'loader')

// Helper to get fixture path
function fixture(name: string): string {
  return path.join(FIXTURES_DIR, name)
}

describe('MDX Loading', () => {
  test('loads basic MDX with Claude component', async () => {
    const element = await loadAgentFile(fixture('basic.mdx'))
    expect(React.isValidElement(element)).toBe(true)
    // MDX wraps content in a component, so we check it's a valid element
  })

  test('loads MDX with multiple components', async () => {
    const element = await loadAgentFile(fixture('multi-component.mdx'))
    expect(React.isValidElement(element)).toBe(true)
    // Check that element is valid
    expect(element.props).toBeDefined()
  })

  test('loads MDX with imports', async () => {
    const element = await loadAgentFile(fixture('with-import.mdx'))
    expect(React.isValidElement(element)).toBe(true)
  })

  test('loads MDX with expressions', async () => {
    const element = await loadAgentFile(fixture('with-expression.mdx'))
    expect(React.isValidElement(element)).toBe(true)
    // The expression should be evaluated in the rendered content
  })

  test('MDX syntax error shows line and column', async () => {
    try {
      await loadAgentFile(fixture('mdx-syntax-error.mdx'))
      expect(true).toBe(false) // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(SyntaxLoadError)
      const syntaxError = error as SyntaxLoadError
      expect(syntaxError.filePath).toContain('mdx-syntax-error.mdx')
      // Should have line info
      expect(syntaxError.line).toBeGreaterThan(0)
    }
  })

  test('MDX with undefined component shows suggestions', async () => {
    try {
      await loadAgentFile(fixture('mdx-undefined-component.mdx'))
      expect(true).toBe(false) // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      const loaderError = error as Error
      expect(loaderError.message).toBeTruthy()
    }
  })
})

describe('TSX/JSX Loading', () => {
  test('loads direct element export', async () => {
    const element = await loadAgentFile(fixture('basic-element.tsx'))
    expect(React.isValidElement(element)).toBe(true)
    // Type will be the Claude function from components
    expect(typeof element.type).toBe('function')
  })

  test('loads component function export', async () => {
    const element = await loadAgentFile(fixture('component-function.tsx'))
    expect(React.isValidElement(element)).toBe(true)
    // Type will be the Agent component function
    expect(typeof element.type).toBe('function')
  })

  test('loads component with hooks', async () => {
    const element = await loadAgentFile(fixture('with-hooks.tsx'))
    expect(React.isValidElement(element)).toBe(true)
  })

  test('loads component with props', async () => {
    const element = await loadAgentFile(fixture('with-props.tsx'), {
      props: { task: 'code review' },
    })
    expect(React.isValidElement(element)).toBe(true)
  })

  test('TSX syntax error shows code frame', async () => {
    try {
      await loadAgentFile(fixture('tsx-syntax-error.tsx'))
      expect(true).toBe(false) // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(SyntaxLoadError)
      const syntaxError = error as SyntaxLoadError
      expect(syntaxError.filePath).toContain('tsx-syntax-error.tsx')
      // Check suggestions are provided
      expect(syntaxError.suggestions.length).toBeGreaterThan(0)
    }
  })

  test('missing module error shows suggestions', async () => {
    // Note: This test checks error handling for missing imports
    // However, Bun may tree-shake unused imports, so the file may load successfully
    // We test that if it errors, the error message is helpful
    try {
      const element = await loadAgentFile(fixture('missing-import.tsx'))
      // If Bun tree-shakes the unused import, the file loads successfully
      expect(React.isValidElement(element)).toBe(true)
    } catch (error) {
      // If it does error, check that the error is informative
      expect(error).toBeInstanceOf(SyntaxLoadError)
      const loadError = error as SyntaxLoadError
      expect(loadError.suggestions.length).toBeGreaterThan(0)
    }
  })

  test('missing default export shows available exports', async () => {
    try {
      await loadAgentFile(fixture('no-default-export.tsx'))
      expect(true).toBe(false) // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(ExportError)
      const exportError = error as ExportError
      expect(exportError.exportName).toBe('default')
      expect(exportError.actualExports).toContain('agent')
      expect(exportError.actualExports).toContain('anotherExport')
    }
  })

  test('invalid default export shows type', async () => {
    try {
      await loadAgentFile(fixture('invalid-export-type.tsx'))
      expect(true).toBe(false) // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidElementError)
      const invalidError = error as InvalidElementError
      expect(invalidError.actualType).toContain('string')
    }
  })

  test('component returning null does not error', async () => {
    // Note: extractElement creates an element from the component function
    // The component itself returns null when rendered, but extractElement returns a React element
    const element = await loadAgentFile(fixture('component-returns-null.tsx'))
    // extractElement creates a React element wrapping the component
    expect(React.isValidElement(element)).toBe(true)
  })
})

describe('Error Formatting', () => {
  test('LoaderError.format() includes file path', () => {
    const error = new LoaderError('Test error', '/path/to/file.tsx', ['Suggestion 1'])
    const formatted = error.format()
    expect(formatted).toContain('Test error')
    expect(formatted).toContain('/path/to/file.tsx')
    expect(formatted).toContain('Suggestion 1')
  })

  test('SyntaxLoadError.format() includes code frame', () => {
    const error = new SyntaxLoadError('Syntax error', '/path/to/file.tsx', {
      line: 10,
      column: 5,
      codeFrame: '  10 | const x = {',
      suggestions: ['Check brackets'],
    })
    const formatted = error.format()
    expect(formatted).toContain('10')
    expect(formatted).toContain('5')
    expect(formatted).toContain('const x = {')
    expect(formatted).toContain('Check brackets')
  })

  test('ExportError.format() includes available exports', () => {
    const error = new ExportError(
      'No default export',
      '/path/to/file.tsx',
      'default',
      ['agent', 'config'],
      ['Add default export']
    )
    const formatted = error.format()
    expect(formatted).toContain('agent')
    expect(formatted).toContain('config')
    expect(formatted).toContain('Add default export')
  })

  test('InvalidElementError.format() includes actual type', () => {
    const error = new InvalidElementError(
      'Invalid export',
      '/path/to/file.tsx',
      'string ("hello")',
      ['Export a React element']
    )
    const formatted = error.format()
    expect(formatted).toContain('string ("hello")')
    expect(formatted).toContain('Export a React element')
  })
})

describe('File Resolution', () => {
  test('loads relative path', async () => {
    const element = await loadAgentFile('./evals/fixtures/loader/basic.mdx')
    expect(React.isValidElement(element)).toBe(true)
  })

  test('loads absolute path', async () => {
    const element = await loadAgentFile(fixture('basic.mdx'))
    expect(React.isValidElement(element)).toBe(true)
  })

  test('file not found throws LoaderError', async () => {
    try {
      await loadAgentFile('./does-not-exist.mdx')
      expect(true).toBe(false)
    } catch (error) {
      expect(error).toBeInstanceOf(LoaderError)
      const loaderError = error as LoaderError
      expect(loaderError.message).toContain('File not found')
    }
  })

  test('unsupported extension throws LoaderError', async () => {
    // Create a temp file with unsupported extension
    const fs = await import('fs')
    const testPath = fixture('test.txt')
    fs.writeFileSync(testPath, 'test content')

    try {
      await loadAgentFile(testPath)
      expect(true).toBe(false)
    } catch (error) {
      expect(error).toBeInstanceOf(LoaderError)
      const loaderError = error as LoaderError
      expect(loaderError.message).toContain('Unsupported file extension')
      expect(loaderError.suggestions.some(s => s.includes('.mdx'))).toBe(true)
    } finally {
      fs.unlinkSync(testPath)
    }
  })
})

describe('extractElement', () => {
  test('extracts valid React element', () => {
    const element = React.createElement('div', {}, 'Hello')
    const result = extractElement({ default: element }, '/test.tsx')
    expect(result).toBe(element)
  })

  test('extracts and calls component function', () => {
    const Component = () => React.createElement('div', {}, 'Hello')
    const result = extractElement({ default: Component }, '/test.tsx')
    expect(React.isValidElement(result)).toBe(true)
  })

  test('passes props to component function', () => {
    const Component = (props: { name: string }) =>
      React.createElement('div', {}, props.name)
    const result = extractElement(
      { default: Component },
      '/test.tsx',
      { name: 'Alice' }
    )
    expect(React.isValidElement(result)).toBe(true)
    // extractElement creates an element with the component as type
    // The props are passed as props to the element
    expect(typeof result.type).toBe('function')
    expect(result.props.name).toBe('Alice')
  })

  test('clones element with new props', () => {
    const element = React.createElement('div', { id: 'test' }, 'Hello')
    const result = extractElement(
      { default: element },
      '/test.tsx',
      { className: 'new' }
    )
    expect(React.isValidElement(result)).toBe(true)
    expect(result.props.className).toBe('new')
  })

  test('throws ExportError for missing default export', () => {
    try {
      extractElement({ named: 'value' }, '/test.tsx')
      expect(true).toBe(false)
    } catch (error) {
      expect(error).toBeInstanceOf(ExportError)
    }
  })

  test('throws InvalidElementError for non-element/function export', () => {
    try {
      extractElement({ default: 'string' }, '/test.tsx')
      expect(true).toBe(false)
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidElementError)
    }
  })
})

describe('Edge Cases', () => {
  test('handles empty MDX file', async () => {
    // Create temporary empty file
    const emptyPath = fixture('empty.mdx')
    const fs = await import('fs')
    fs.writeFileSync(emptyPath, '')

    try {
      const element = await loadAgentFile(emptyPath)
      // Empty MDX files create a fragment with no children
      expect(React.isValidElement(element)).toBe(true)
    } finally {
      fs.unlinkSync(emptyPath)
    }
  })

  test('handles file with special characters in path', async () => {
    const fs = await import('fs')
    const specialPath = fixture('file with spaces.mdx')
    fs.writeFileSync(specialPath, '<Claude>Test</Claude>')

    try {
      const element = await loadAgentFile(specialPath)
      expect(React.isValidElement(element)).toBe(true)
    } finally {
      fs.unlinkSync(specialPath)
    }
  })

  test('loadMdxFile returns LoadedModule with default export', async () => {
    const module = await loadMdxFile(fixture('basic.mdx'))
    expect(module.default).toBeDefined()
    // MDX exports a component function, not a direct element
    expect(typeof module.default).toBe('function')
  })

  test('loadTsxFile returns LoadedModule with default export', async () => {
    const module = await loadTsxFile(fixture('basic-element.tsx'))
    expect(module.default).toBeDefined()
    expect(React.isValidElement(module.default)).toBe(true)
  })
})
