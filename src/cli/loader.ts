import type { ReactElement } from 'react'
import * as fs from 'fs'
import * as path from 'path'
import { pathToFileURL } from 'url'
import { evaluate } from '@mdx-js/mdx'
import * as runtime from 'react/jsx-runtime'
import React from 'react'

// Import smithers components to make them available to MDX files
import {
  Claude,
  Subagent,
  Phase,
  Step,
  Persona,
  Constraints,
  OutputFormat,
} from '../components/index.js'

// MDX components (only actual React components, not utilities/types)
const mdxComponents = {
  Claude,
  Subagent,
  Phase,
  Step,
  Persona,
  Constraints,
  OutputFormat,
}

/**
 * Base error class for loader errors with rich context
 */
export class LoaderError extends Error {
  readonly filePath: string
  readonly suggestions: string[]

  constructor(message: string, filePath: string, suggestions: string[] = []) {
    super(message)
    this.name = 'LoaderError'
    this.filePath = filePath
    this.suggestions = suggestions
  }

  /**
   * Format the error for display
   */
  format(): string {
    let output = `${this.message}\n\n  File: ${this.filePath}`

    if (this.suggestions.length > 0) {
      output += '\n\n  Suggestions:'
      for (const suggestion of this.suggestions) {
        output += `\n    - ${suggestion}`
      }
    }

    return output
  }
}

/**
 * Error for syntax errors in MDX/TSX files
 */
export class SyntaxLoadError extends LoaderError {
  readonly line?: number
  readonly column?: number
  readonly codeFrame?: string

  constructor(
    message: string,
    filePath: string,
    options: {
      line?: number
      column?: number
      codeFrame?: string
      suggestions?: string[]
    } = {}
  ) {
    super(message, filePath, options.suggestions)
    this.name = 'SyntaxLoadError'
    this.line = options.line
    this.column = options.column
    this.codeFrame = options.codeFrame
  }

  format(): string {
    let output = this.message

    if (this.line !== undefined) {
      output += `\n\n  Location: ${this.filePath}:${this.line}`
      if (this.column !== undefined) {
        output += `:${this.column}`
      }
    } else {
      output += `\n\n  File: ${this.filePath}`
    }

    if (this.codeFrame) {
      output += `\n\n${this.codeFrame}`
    }

    if (this.suggestions.length > 0) {
      output += '\n\n  Suggestions:'
      for (const suggestion of this.suggestions) {
        output += `\n    - ${suggestion}`
      }
    }

    return output
  }
}

/**
 * Error for missing or invalid exports
 */
export class ExportError extends LoaderError {
  readonly exportName: string
  readonly actualExports: string[]

  constructor(
    message: string,
    filePath: string,
    exportName: string,
    actualExports: string[] = [],
    suggestions: string[] = []
  ) {
    super(message, filePath, suggestions)
    this.name = 'ExportError'
    this.exportName = exportName
    this.actualExports = actualExports
  }

  format(): string {
    let output = `${this.message}\n\n  File: ${this.filePath}`

    if (this.actualExports.length > 0) {
      output += `\n\n  Available exports: ${this.actualExports.join(', ')}`
    }

    if (this.suggestions.length > 0) {
      output += '\n\n  Suggestions:'
      for (const suggestion of this.suggestions) {
        output += `\n    - ${suggestion}`
      }
    }

    return output
  }
}

/**
 * Error for invalid React element/component exports
 */
export class InvalidElementError extends LoaderError {
  readonly actualType: string

  constructor(
    message: string,
    filePath: string,
    actualType: string,
    suggestions: string[] = []
  ) {
    super(message, filePath, suggestions)
    this.name = 'InvalidElementError'
    this.actualType = actualType
  }

  format(): string {
    let output = `${this.message}\n\n  File: ${this.filePath}`
    output += `\n  Received type: ${this.actualType}`

    if (this.suggestions.length > 0) {
      output += '\n\n  Suggestions:'
      for (const suggestion of this.suggestions) {
        output += `\n    - ${suggestion}`
      }
    }

    return output
  }
}

/**
 * Generate a code frame showing the error location in context
 */
function generateCodeFrame(
  content: string,
  line: number,
  column?: number,
  contextLines = 2
): string {
  const lines = content.split('\n')
  const start = Math.max(0, line - contextLines - 1)
  const end = Math.min(lines.length, line + contextLines)

  const lineNumWidth = String(end).length
  let frame = ''

  for (let i = start; i < end; i++) {
    const lineNum = i + 1
    const isErrorLine = lineNum === line
    const prefix = isErrorLine ? '> ' : '  '
    const paddedNum = String(lineNum).padStart(lineNumWidth, ' ')

    frame += `${prefix}${paddedNum} | ${lines[i]}\n`

    // Add column indicator for the error line
    if (isErrorLine && column !== undefined && column > 0) {
      const spacing = ' '.repeat(lineNumWidth + 3 + column - 1)
      frame += `  ${spacing}^\n`
    }
  }

  return frame
}

export interface LoadOptions {
  /**
   * Base URL for resolving imports in MDX files
   */
  baseUrl?: string
  /**
   * Props to pass to the default export component
   */
  props?: Record<string, unknown>
}

export interface LoadedModule {
  /**
   * The default export of the module (should be a React element or component)
   */
  default: unknown
  /**
   * Any other named exports
   */
  [key: string]: unknown
}

/**
 * Main entry point for loading agent files
 * Supports .tsx, .jsx, .ts, .js (via Bun import) and .mdx (via @mdx-js/mdx evaluate)
 */
export async function loadAgentFile(
  filePath: string,
  options: LoadOptions = {}
): Promise<ReactElement> {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath)

  if (!fs.existsSync(absolutePath)) {
    throw new LoaderError(
      `File not found: ${absolutePath}`,
      absolutePath,
      [
        'Check that the file path is correct',
        'Ensure the file exists and is readable',
      ]
    )
  }

  const ext = path.extname(absolutePath).toLowerCase()

  let module: LoadedModule

  if (ext === '.mdx') {
    module = await loadMdxFile(absolutePath, options)
  } else if (['.tsx', '.jsx', '.ts', '.js'].includes(ext)) {
    module = await loadTsxFile(absolutePath)
  } else {
    throw new LoaderError(
      `Unsupported file extension: "${ext}"`,
      absolutePath,
      [
        'Rename your file to use one of: .mdx, .tsx, .jsx, .ts, .js',
        'MDX files are recommended for declarative agent definitions',
        'TSX files are recommended for agents with complex logic',
      ]
    )
  }

  return extractElement(module, absolutePath, options.props)
}

/**
 * Load a TSX/JSX/TS/JS file using Bun's native import
 */
export async function loadTsxFile(filePath: string): Promise<LoadedModule> {
  try {
    // Convert file path to file URL for proper ESM import
    // This handles paths with spaces and ensures Node ESM compatibility
    const fileUrl = pathToFileURL(filePath).href
    const module = await import(fileUrl)
    return module
  } catch (error) {
    throw parseTsxError(error, filePath)
  }
}

/**
 * Parse TSX/JSX import errors and convert to rich error objects
 */
function parseTsxError(error: unknown, filePath: string): LoaderError {
  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack : undefined

  // Bun's BuildMessage has special structure with position info
  const bunError = error as {
    position?: {
      line?: number
      column?: number
      lineText?: string
      file?: string
    }
    line?: number
    column?: number
    name?: string
  }

  // Extract line/column from Bun's position object if available
  let line = bunError.position?.line ?? bunError.line
  let column = bunError.position?.column ?? bunError.column
  const lineText = bunError.position?.lineText

  // Fall back to parsing from message/stack if no position info
  if (line === undefined) {
    // Try to extract line/column from stack trace or error message
    // Common patterns:
    // - Bun: "file.tsx:10:5: error: ..."
    // - Node: "SyntaxError: ... at file.tsx:10:5"
    // - esbuild: "file.tsx:10:5 - error TS..."
    const locationMatch = message.match(/(\d+):(\d+)/) ||
      stack?.match(new RegExp(`${escapeRegex(path.basename(filePath))}:(\\d+):(\\d+)`))

    if (locationMatch) {
      line = parseInt(locationMatch[1], 10)
      column = parseInt(locationMatch[2], 10)
    }
  }

  // Try to read file content for code frame
  let codeFrame: string | undefined
  if (line !== undefined) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      codeFrame = generateCodeFrame(content, line, column)
    } catch {
      // Ignore file read errors
    }
  }

  // Detect common error types and provide specific suggestions
  const suggestions = getTsxErrorSuggestions(message, filePath)

  // Build a more helpful error message
  let simplifiedMessage: string
  if (bunError.name === 'BuildMessage') {
    simplifiedMessage = `Syntax error in TSX/JSX file: ${message || 'unable to parse'}`
    if (lineText) {
      simplifiedMessage += `\n  Near: ${lineText.trim()}`
    }
  } else {
    simplifiedMessage = simplifySyntaxErrorMessage(message, 'TSX/JSX')
  }

  return new SyntaxLoadError(simplifiedMessage, filePath, {
    line,
    column,
    codeFrame,
    suggestions,
  })
}

/**
 * Get suggestions for common TSX errors
 */
function getTsxErrorSuggestions(message: string, filePath: string): string[] {
  const suggestions: string[] = []
  const lowerMessage = message.toLowerCase()

  if (lowerMessage.includes('cannot find module') || lowerMessage.includes('module not found')) {
    suggestions.push('Check that all imported modules are installed (run npm install or bun install)')
    suggestions.push('Verify import paths are correct and case-sensitive')
  }

  if (lowerMessage.includes('unexpected token') || lowerMessage.includes('parse error')) {
    suggestions.push('Check for missing or extra brackets, parentheses, or semicolons')
    suggestions.push('Ensure JSX syntax is correct (closing tags, proper nesting)')
  }

  if (lowerMessage.includes('jsx') && lowerMessage.includes('not defined')) {
    suggestions.push("Import React at the top of your file: import React from 'react'")
  }

  if (lowerMessage.includes('export') || lowerMessage.includes('default')) {
    suggestions.push('Ensure your file has a default export: export default <MyComponent />')
  }

  if (lowerMessage.includes('type') || lowerMessage.includes('typescript')) {
    suggestions.push('Check TypeScript type annotations are correct')
    suggestions.push('Ensure tsconfig.json has JSX support enabled')
  }

  // Add generic suggestion if no specific ones matched
  if (suggestions.length === 0) {
    suggestions.push('Check the file for syntax errors')
    suggestions.push('Ensure the file exports a valid React element or component')
  }

  return suggestions
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Simplify verbose error messages
 */
function simplifySyntaxErrorMessage(message: string, fileType: string): string {
  // Remove long file paths from the message
  let simplified = message
    .replace(/file:\/\/[^\s]+/g, '')
    .replace(/\s+at\s+.*$/gm, '')
    .trim()

  // Capitalize first letter
  if (simplified.length > 0) {
    simplified = simplified.charAt(0).toUpperCase() + simplified.slice(1)
  }

  // Add context if message is too short
  if (simplified.length < 10) {
    return `Failed to parse ${fileType} file: ${simplified || 'syntax error'}`
  }

  return simplified
}

/**
 * Load an MDX file using @mdx-js/mdx evaluate()
 */
export async function loadMdxFile(
  filePath: string,
  options: LoadOptions = {}
): Promise<LoadedModule> {
  let content: string

  try {
    content = fs.readFileSync(filePath, 'utf-8')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new LoaderError(
      `Failed to read MDX file: ${message}`,
      filePath,
      [
        'Check that the file exists and is readable',
        'Verify you have permission to read the file',
      ]
    )
  }

  try {
    // Evaluate the MDX content with React runtime and smithers components
    const module = await evaluate(content, {
      ...runtime,
      // Convert file path to file URL for proper baseUrl
      baseUrl: options.baseUrl || pathToFileURL(filePath).href,
      development: false,
      // Provide smithers components to MDX (only actual React components)
      useMDXComponents: () => mdxComponents,
    })

    return module as LoadedModule
  } catch (error) {
    throw parseMdxError(error, filePath, content)
  }
}

/**
 * Parse MDX errors and convert to rich error objects
 * MDX uses VFileMessage which has line, column, and other useful info
 */
function parseMdxError(error: unknown, filePath: string, content: string): LoaderError {
  // VFileMessage from MDX/unified ecosystem has rich location info
  const vfileError = error as {
    line?: number
    column?: number
    reason?: string
    message?: string
    ruleId?: string
    source?: string
    position?: {
      start?: { line?: number; column?: number }
      end?: { line?: number; column?: number }
    }
  }

  // Extract line and column (VFileMessage uses 'line' and 'column' or 'position')
  const line = vfileError.line ??
    vfileError.position?.start?.line ??
    extractLineFromMessage(vfileError.message || '')
  const column = vfileError.column ??
    vfileError.position?.start?.column ??
    extractColumnFromMessage(vfileError.message || '')

  // Get the error message
  const message = vfileError.reason || vfileError.message ||
    (error instanceof Error ? error.message : String(error))

  // Generate code frame if we have line info
  let codeFrame: string | undefined
  if (line !== undefined) {
    codeFrame = generateCodeFrame(content, line, column)
  }

  // Get suggestions based on the error
  const suggestions = getMdxErrorSuggestions(message, vfileError.ruleId)

  // Simplify the error message
  const simplifiedMessage = simplifySyntaxErrorMessage(message, 'MDX')

  return new SyntaxLoadError(simplifiedMessage, filePath, {
    line,
    column,
    codeFrame,
    suggestions,
  })
}

/**
 * Extract line number from error message if present
 */
function extractLineFromMessage(message: string): number | undefined {
  const match = message.match(/line\s+(\d+)/i) || message.match(/:(\d+):\d+/)
  return match ? parseInt(match[1], 10) : undefined
}

/**
 * Extract column number from error message if present
 */
function extractColumnFromMessage(message: string): number | undefined {
  const match = message.match(/column\s+(\d+)/i) || message.match(/:\d+:(\d+)/)
  return match ? parseInt(match[1], 10) : undefined
}

/**
 * Get suggestions for common MDX errors
 */
function getMdxErrorSuggestions(message: string, ruleId?: string): string[] {
  const suggestions: string[] = []
  const lowerMessage = message.toLowerCase()

  // JSX-related errors
  if (lowerMessage.includes('expected closing tag') || lowerMessage.includes('mismatched')) {
    suggestions.push('Check that all JSX tags are properly closed')
    suggestions.push('Ensure opening and closing tags match (e.g., <Claude>...</Claude>)')
  }

  if (lowerMessage.includes('unexpected') && lowerMessage.includes('jsx')) {
    suggestions.push('Check JSX syntax is correct')
    suggestions.push('Ensure component names start with a capital letter (e.g., <Claude>, not <claude>)')
  }

  // Import/export errors
  if (lowerMessage.includes('could not parse') || lowerMessage.includes('acorn')) {
    suggestions.push('Check JavaScript/JSX syntax in code blocks or expressions')
    suggestions.push('Ensure expressions in {} are valid JavaScript')
  }

  if (lowerMessage.includes('import') || lowerMessage.includes('export')) {
    suggestions.push('Check import/export statements are at the top of the file')
    suggestions.push('Verify imported modules exist and paths are correct')
  }

  // Expression errors
  if (lowerMessage.includes('expression') || lowerMessage.includes('expected')) {
    suggestions.push('Check that expressions inside {} are valid JavaScript')
    suggestions.push('Ensure props are formatted correctly (e.g., prop="value" or prop={expression})')
  }

  // Markdown syntax issues
  if (lowerMessage.includes('frontmatter') || lowerMessage.includes('yaml')) {
    suggestions.push('Check frontmatter syntax (should be between --- delimiters)')
    suggestions.push('Ensure YAML in frontmatter is properly formatted')
  }

  // Component usage
  if (lowerMessage.includes('undefined') || lowerMessage.includes('is not defined')) {
    suggestions.push('Check component names are spelled correctly')
    suggestions.push('Available components: Claude, Subagent, Phase, Step, Persona, Constraints, OutputFormat')
  }

  // Add generic suggestions if no specific ones matched
  if (suggestions.length === 0) {
    suggestions.push('Check the MDX syntax at the indicated location')
    suggestions.push('Ensure JSX components are properly formatted')
    suggestions.push('Review MDX documentation at https://mdxjs.com/')
  }

  return suggestions
}

/**
 * Extract a React element from a loaded module
 * Handles both direct element exports and component exports
 */
export function extractElement(
  module: LoadedModule,
  filePath: string,
  props?: Record<string, unknown>
): ReactElement {
  const defaultExport = module.default
  const hasProps = props !== undefined && Object.keys(props).length > 0

  // Get available exports for error messages
  const availableExports = Object.keys(module).filter(k => k !== '__esModule')

  if (defaultExport === null || defaultExport === undefined) {
    const hasNamedExports = availableExports.length > 0
    const suggestions = [
      'Add a default export: export default <YourComponent />',
    ]

    if (hasNamedExports) {
      suggestions.push(`Found named exports (${availableExports.join(', ')}) but no default export`)
      suggestions.push('Convert a named export to default: export default YourComponent')
    }

    suggestions.push('For MDX files, ensure the file contains JSX content (it auto-exports as default)')

    throw new ExportError(
      'No default export found in agent file',
      filePath,
      'default',
      availableExports,
      suggestions
    )
  }

  // If it's already a React element, validate and return it
  if (React.isValidElement(defaultExport)) {
    if (hasProps) {
      return React.cloneElement(defaultExport, props)
    }
    return defaultExport
  }

  // If it's a function (component), try to call it to get the element
  if (typeof defaultExport === 'function') {
    try {
      const element = React.createElement(
        defaultExport as React.ComponentType,
        hasProps ? props : undefined
      )

      // Validate the created element
      if (!React.isValidElement(element)) {
        throw new InvalidElementError(
          'Component did not return a valid React element',
          filePath,
          typeof element,
          [
            'Ensure your component returns JSX (e.g., return <Claude>...</Claude>)',
            'Check that the component does not return null or undefined',
          ]
        )
      }

      return element
    } catch (error) {
      // If it's already one of our errors, re-throw it
      if (error instanceof LoaderError) {
        throw error
      }

      const message = error instanceof Error ? error.message : String(error)
      throw new InvalidElementError(
        `Failed to render component: ${message}`,
        filePath,
        'function (component)',
        [
          'Check that the component can render without required props',
          'Ensure all hooks are used correctly inside the component',
          'Verify all dependencies are imported correctly',
        ]
      )
    }
  }

  // Not a valid export type
  const actualType = getDetailedType(defaultExport)
  throw new InvalidElementError(
    `Invalid default export: expected a React element or component`,
    filePath,
    actualType,
    [
      'Export a React element: export default <Claude>...</Claude>',
      'Export a component function: export default function Agent() { return <Claude>...</Claude> }',
      `Received ${actualType} instead of React element/component`,
    ]
  )
}

/**
 * Get a detailed type description for error messages
 */
function getDetailedType(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return `array (${value.length} items)`

  const type = typeof value

  if (type === 'object') {
    const constructor = (value as object).constructor?.name
    if (constructor && constructor !== 'Object') {
      return constructor
    }
    return 'object'
  }

  if (type === 'string') {
    const str = value as string
    if (str.length > 50) {
      return `string ("${str.slice(0, 50)}...")`
    }
    return `string ("${str}")`
  }

  if (type === 'number') {
    return `number (${value})`
  }

  return type
}
