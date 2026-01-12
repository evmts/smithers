import pc from 'picocolors'
import { LoaderError } from './loader.js'

/**
 * Display the XML plan in a Terraform-style format
 */
export function displayPlan(xml: string, frame?: number): void {
  const header = frame !== undefined ? `Plan (Frame ${frame})` : 'Plan'
  const divider = '─'.repeat(60)

  console.log()
  console.log(pc.bold(pc.cyan(header)))
  console.log(pc.dim(divider))
  console.log()

  // Syntax highlight the XML
  const highlighted = highlightXml(xml)
  console.log(highlighted)

  console.log()
  console.log(pc.dim(divider))
}

/**
 * Simple XML syntax highlighting
 */
function highlightXml(xml: string): string {
  return xml
    // Tags
    .replace(/<(\/?[\w-]+)/g, pc.cyan('<') + pc.green('$1'))
    .replace(/>/g, pc.cyan('>'))
    // Attributes
    .replace(/(\w+)=/g, pc.yellow('$1') + '=')
    // Strings
    .replace(/"([^"]*)"/g, pc.magenta('"$1"'))
}

/**
 * Display execution frame result
 */
export function displayFrame(frame: number, nodes: string[], duration: number): void {
  console.log(
    pc.dim(`[Frame ${frame}]`),
    pc.green('Executed:'),
    nodes.join(', '),
    pc.dim(`(${duration}ms)`)
  )
}

/**
 * Display final execution result
 */
export function displayResult(
  output: unknown,
  frames: number,
  duration: number
): void {
  const divider = '─'.repeat(60)

  console.log()
  console.log(pc.bold(pc.green('Execution Complete')))
  console.log(pc.dim(divider))
  console.log()
  console.log(pc.dim('Frames:'), frames)
  console.log(pc.dim('Duration:'), `${duration}ms`)
  console.log()
  console.log(pc.dim('Output:'))
  console.log(JSON.stringify(output, null, 2))
  console.log()
}

/**
 * Check if an error is a LoaderError (duck typing to work across bundle boundaries)
 */
function isLoaderError(error: Error): error is LoaderError {
  return (
    typeof (error as LoaderError).format === 'function' &&
    typeof (error as LoaderError).filePath === 'string'
  )
}

/**
 * Display an error with rich formatting for LoaderError types
 */
export function displayError(error: Error): void {
  console.error()
  console.error(pc.bold(pc.red('Error')))

  // Use rich formatting for LoaderError types (duck typing for bundle compatibility)
  if (isLoaderError(error)) {
    console.error()
    console.error(pc.red(error.format()))
    return
  }

  // Standard error display
  console.error(pc.red(error.message))

  // Only show stack in verbose mode or for unexpected errors
  if (error.stack && process.env.DEBUG) {
    console.error()
    console.error(pc.dim('Stack trace:'))
    console.error(pc.dim(error.stack))
  }
}

/**
 * Display info message
 */
export function info(message: string): void {
  console.log(pc.blue('ℹ'), message)
}

/**
 * Display success message
 */
export function success(message: string): void {
  console.log(pc.green('✓'), message)
}

/**
 * Display warning message
 */
export function warn(message: string): void {
  console.log(pc.yellow('⚠'), message)
}
