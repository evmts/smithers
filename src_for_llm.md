# Project Source Code for LLM

## `src/jsx-runtime.ts`

```typescript
/**
 * JSX Runtime for Smithers
 *
 * Re-exports from reconciler for backwards compatibility.
 * The canonical location is now src/reconciler/jsx-runtime.ts
 */
export { jsx, jsxs, Fragment, jsxDEV } from './reconciler/jsx-runtime.js'
export type { SmithersNode } from './reconciler/types.js'

```

## `src/index.ts`

```typescript
export * from "./core/index.js";
export * from "./reconciler/index.js";
export * from "./components/index.js";
export * from "./debug/index.js";

```

## `src/jsx.d.ts`

```typescript
import type React from 'react'

// Declare JSX namespace globally for custom jsx-runtime
declare global {
  namespace JSX {
    interface IntrinsicElements {
      // Agent execution elements
      claude: {
        status?: string
        result?: unknown
        error?: string
        model?: string
        maxTurns?: number
        tools?: string[]
        systemPrompt?: string
        onFinished?: (result: unknown) => void
        onError?: (error: Error) => void
        validate?: (result: unknown) => Promise<boolean>
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      // Control flow elements
      ralph: {
        iteration?: number
        pending?: number
        maxIterations?: number
        onIteration?: (iteration: number) => void
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      phase: {
        name?: string
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      step: {
        name?: string
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      // Semantic elements
      persona: {
        role?: string
        expertise?: string
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      constraints: {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      // Generic elements for tests
      task: {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      agent: {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      container: {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      message: {
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      // Smithers orchestrator elements
      orchestration: {
        'execution-id'?: string
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      'smithers-subagent': {
        status?: string
        'subagent-id'?: string | null
        'execution-id'?: string
        'planner-model'?: string
        'execution-model'?: string
        'script-path'?: string
        output?: string
        error?: string
        'tokens-input'?: number
        'tokens-output'?: number
        'duration-ms'?: number
        children?: React.ReactNode
        key?: string | number
        [key: string]: unknown
      }

      // Catch-all for any custom element
      [key: string]: any
    }

    // Required JSX types - allow all ReactNode types for React 19 compatibility
    type Element = React.ReactNode
    interface ElementChildrenAttribute {
      children: {}
    }
    interface ElementAttributesProperty {
      props: {}
    }
  }
}

export {}

```

## `src/globals.d.ts`

```typescript
// Global type declarations

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV?: string
      MOCK_MODE?: string
    }

    type Timeout = ReturnType<typeof setTimeout>
  }

  var process: {
    env: NodeJS.ProcessEnv
  }
}

export {}

```

## `src/jsx-runtime.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/debug/index.ts`

```typescript
/**
 * Debug and observability utilities
 */

import type { DebugEvent } from '../reconciler/types.js'

export interface DebugCollector {
  emit(event: DebugEvent): void
}

export type { DebugEvent }

export function createDebugCollector(): DebugCollector {
  return {
    emit(event: DebugEvent): void {
      console.log('[Debug]', event)
    },
  }
}

```

## `src/commands/run.ts`

```typescript
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

/**
 * Find the preload.ts file from the smithers-orchestrator package
 */
function findPreloadPath(): string {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  // Navigate up from src/commands to package root
  let dir = __dirname
  while (dir !== path.dirname(dir)) {
    const preloadPath = path.join(dir, 'preload.ts')
    if (fs.existsSync(preloadPath)) {
      return preloadPath
    }
    dir = path.dirname(dir)
  }
  throw new Error('Could not find preload.ts - smithers-orchestrator may be incorrectly installed')
}

interface RunOptions {
  file?: string
}

export async function run(fileArg?: string, options: RunOptions = {}) {
  const file = fileArg || options.file || '.smithers/main.tsx'
  const filePath = path.resolve(file)

  console.log('🚀 Running Smithers orchestration...')
  console.log(`   File: ${filePath}`)
  console.log('')

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`)
    console.log('')
    console.log('Did you run `smithers init` first?')
    console.log('')
    process.exit(1)
  }

  // Check if file is executable
  try {
    fs.accessSync(filePath, fs.constants.X_OK)
  } catch {
    // Make it executable
    fs.chmodSync(filePath, '755')
  }

  // Execute with bun -i (interactive mode keeps process alive)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')

  const preloadPath = findPreloadPath()
  const child = spawn('bun', ['--preload', preloadPath, '--install=fallback', filePath], {
    stdio: 'inherit',
    shell: true,
  })

  child.on('error', (error) => {
    console.error('')
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error('')
    console.error('❌ Execution failed:', error.message)
    console.error('')

    if (error.message.includes('ENOENT')) {
      console.error('Bun not found. Install it:')
      console.error('   curl -fsSL https://bun.sh/install | bash')
      console.error('')
    }

    process.exit(1)
  })

  child.on('exit', (code) => {
    console.log('')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    if (code === 0) {
      console.log('')
      console.log('✅ Orchestration completed successfully')
      console.log('')
    } else {
      console.log('')
      console.log(`❌ Orchestration exited with code: ${code}`)
      console.log('')
    }

    process.exit(code || 0)
  })
}

```

## `src/commands/db.ts`

```typescript
// Database inspection command
// Re-exports from db/ folder for backward compatibility

export {
  dbCommand,
  showState,
  showTransitions,
  showExecutions,
  showMemories,
  showStats,
  showCurrent,
  showRecovery,
  showHelp,
} from './db/index.js'

```

## `src/commands/monitor.ts`

```typescript
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { OutputParser } from '../monitor/output-parser.jsx'
import { StreamFormatter } from '../monitor/stream-formatter.jsx'
import { LogWriter } from '../monitor/log-writer.jsx'
import { summarizeWithHaiku } from '../monitor/haiku-summarizer.jsx'

/**
 * Find the preload.ts file from the smithers-orchestrator package
 */
function findPreloadPath(): string {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  // Navigate up from src/commands to package root
  let dir = __dirname
  while (dir !== path.dirname(dir)) {
    const preloadPath = path.join(dir, 'preload.ts')
    if (fs.existsSync(preloadPath)) {
      return preloadPath
    }
    dir = path.dirname(dir)
  }
  throw new Error('Could not find preload.ts - smithers-orchestrator may be incorrectly installed')
}

interface MonitorOptions {
  file?: string
  summary?: boolean
}

export async function monitor(fileArg?: string, options: MonitorOptions = {}) {
  const file = fileArg || options.file || '.smithers/main.tsx'
  const filePath = path.resolve(file)
  const enableSummary = options.summary !== false

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`)
    console.log('')
    console.log('Did you run `smithers init` first?')
    console.log('')
    process.exit(1)
  }

  // Check if file is executable
  try {
    fs.accessSync(filePath, fs.constants.X_OK)
  } catch {
    fs.chmodSync(filePath, '755')
  }

  // Initialize monitoring components
  const parser = new OutputParser()
  const formatter = new StreamFormatter()
  const logWriter = new LogWriter()

  // Print header
  console.log(formatter.formatHeader(filePath))

  // Start execution
  const startTime = Date.now()
  const preloadPath = findPreloadPath()
  const child = spawn('bun', ['--preload', preloadPath, '--install=fallback', filePath], {
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: true,
  })

  // Handle stdout
  child.stdout?.on('data', async (data) => {
    const chunk = data.toString()

    // Parse events from output
    const events = parser.parseChunk(chunk)

    // Process each event
    for (const event of events) {
      let logPath: string | undefined
      let summary: string | undefined

      // For tool calls and errors, save to logs and optionally summarize
      if (event.type === 'tool' && event.raw) {
        logPath = logWriter.writeToolCall(event.data['name'], {}, event.raw)

        if (enableSummary) {
          const summaryResult = await summarizeWithHaiku(
            event.raw,
            'output',
            logPath
          )
          summary = summaryResult.summary
        }
      } else if (event.type === 'error') {
        logPath = logWriter.writeError(event.data['message'])
      } else if (event.type === 'agent' && event.data['status'] === 'COMPLETE') {
        logPath = logWriter.writeAgentResult(event.data['name'], event.raw)

        if (enableSummary && event.raw.length > 200) {
          const summaryResult = await summarizeWithHaiku(
            event.raw,
            'result',
            logPath
          )
          summary = summaryResult.summary
        }
      }

      // Format and print event
      const formatted = formatter.formatEvent(event, logPath, summary)
      if (formatted) {
        process.stdout.write(formatted)
      }
    }

    // Also print raw output for transparency
    // Comment this out if you want only structured output
    // process.stdout.write(chunk)
  })

  // Handle stderr
  child.stderr?.on('data', async (data) => {
    const chunk = data.toString()
    const logPath = logWriter.writeError(chunk)

    // Try to summarize errors if they're large
    let summary: string | undefined
    if (enableSummary && chunk.split('\n').length > 10) {
      const summaryResult = await summarizeWithHaiku(
        chunk,
        'error',
        logPath
      )
      summary = summaryResult.summary
    }

    process.stderr.write(`[${new Date().toTimeString().substring(0, 8)}] ✗ ERROR:\n`)
    if (summary) {
      process.stderr.write(`           ${summary}\n`)
    } else {
      process.stderr.write(`           ${chunk}`)
    }
    process.stderr.write(`           📄 Full error: ${logPath}\n\n`)
  })

  // Handle process errors
  child.on('error', (error) => {
    console.error('')
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error('')
    console.error('❌ Execution failed:', error.message)
    console.error('')

    if (error.message.includes('ENOENT')) {
      console.error('Bun not found. Install it:')
      console.error('   curl -fsSL https://bun.sh/install | bash')
      console.error('')
    }

    const logPath = logWriter.writeError(error)
    console.error(`📄 Error log: ${logPath}`)
    console.error('')

    process.exit(1)
  })

  // Handle process exit
  child.on('exit', (code) => {
    // Flush any remaining events
    const remainingEvents = parser.flush()
    for (const event of remainingEvents) {
      const formatted = formatter.formatEvent(event)
      if (formatted) {
        process.stdout.write(formatted)
      }
    }

    const duration = Date.now() - startTime

    // Print summary
    console.log(formatter.formatSummary(duration, logWriter.getLogDir()))

    if (code === 0) {
      console.log('✅ Orchestration completed successfully')
      console.log('')
    } else {
      console.log(`❌ Orchestration exited with code: ${code}`)
      console.log('')
    }

    process.exit(code || 0)
  })
}

```

## `src/commands/init.ts`

```typescript
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

interface InitOptions {
  dir?: string
}

/**
 * Find the package root by looking for package.json
 */
function findPackageRoot(startDir: string): string {
  let dir = startDir
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir
    }
    dir = path.dirname(dir)
  }
  return startDir
}

export async function init(options: InitOptions = {}) {
  const targetDir = options.dir || process.cwd()
  const smithersDir = path.join(targetDir, '.smithers')
  const logsDir = path.join(smithersDir, 'logs')
  const mainFile = path.join(smithersDir, 'main.tsx')

  console.log('🔧 Initializing Smithers orchestration...')
  console.log('')

  // Check if .smithers already exists
  if (fs.existsSync(smithersDir)) {
    console.log('⚠️  .smithers/ directory already exists')
    console.log('')
    console.log('To reinitialize, remove the directory first:')
    console.log(`   rm -rf ${smithersDir}`)
    console.log('')
    process.exit(1)
  }

  // Create directories
  fs.mkdirSync(smithersDir, { recursive: true })
  fs.mkdirSync(logsDir, { recursive: true })

  // Get template path - find package root first
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const packageRoot = findPackageRoot(__dirname)
  const templatePath = path.join(packageRoot, 'templates/main.tsx.template')

  // Copy template
  if (!fs.existsSync(templatePath)) {
    console.error(`❌ Template not found: ${templatePath}`)
    process.exit(1)
  }

  const templateContent = fs.readFileSync(templatePath, 'utf-8')
  fs.writeFileSync(mainFile, templateContent)
  fs.chmodSync(mainFile, '755') // Make executable

  console.log('✅ Smithers orchestration initialized!')
  console.log('')
  console.log('Created:')
  console.log(`   ${smithersDir}/`)
  console.log(`   ├── main.tsx       ← Your orchestration program`)
  console.log(`   └── logs/          ← Monitor output logs`)
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log('Next steps:')
  console.log('')
  console.log('1. Edit your orchestration:')
  console.log(`   ${mainFile}`)
  console.log('')
  console.log('2. Run with monitoring (recommended):')
  console.log('   bunx smithers-orchestrator monitor')
  console.log('')
  console.log('   Or run directly:')
  console.log('   bunx smithers-orchestrator run')
  console.log('')
  console.log('   Dependencies are auto-installed on first run.')
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
}

```

## `src/reconciler/serialize-direct.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/reconciler/serialize.ts`

```typescript
import type { SmithersNode } from './types.js'

/**
 * Known component types that have meaning in Smithers.
 * If a known type appears under an unknown parent, we add a warning.
 */
const KNOWN_TYPES = new Set([
  'claude',
  'ralph',
  'phase',
  'step',
  'task',
  'persona',
  'constraints',
  'human',
  'smithers-stop',
  'subagent',
  'orchestration',
  'review',
  'text',
  'root',
  'messages',
  'message',
  'tool-call',
])

/**
 * Add warnings to nodes when known components appear inside unknown elements.
 * This helps detect accidental nesting like <loop><Claude>...</Claude></loop>
 * where the user likely didn't want Claude to execute.
 */
function addWarningsForUnknownParents(node: SmithersNode): void {
  // Clear previous warnings to ensure idempotency when serialize() is called multiple times
  node.warnings = []

  const type = node.type.toLowerCase()
  const isKnown = KNOWN_TYPES.has(type)

  // Walk up to find unknown parent
  let parent = node.parent
  while (parent) {
    const parentType = parent.type.toLowerCase()

    // If parent is a known type, stop walking - the parent will get its own warning if needed.
    // This prevents redundant warnings for deeply nested known components.
    if (KNOWN_TYPES.has(parentType)) {
      break
    }

    if (parent.type !== 'ROOT') {
      if (isKnown) {
        node.warnings.push(
          `<${node.type}> rendered inside unknown element <${parent.type}>`
        )
      }
      break
    }
    parent = parent.parent
  }

  // Clean up: remove empty warnings array
  if (node.warnings.length === 0) {
    delete node.warnings
  }

  // Recurse to children
  for (const child of node.children) {
    addWarningsForUnknownParents(child)
  }
}

/**
 * Serialize a SmithersNode tree to XML string.
 * This XML is the "plan" shown to users before execution.
 *
 * GOTCHA: When testing entity escaping, create nodes MANUALLY without JSX!
 * JSX pre-escapes entities, so using JSX in tests will cause double-escaping.
 *
 * Example transformations:
 * - { type: 'task', props: { name: 'test' }, children: [] } → '<task name="test" />'
 * - { type: 'ROOT', children: [...] } → children joined with \n (no <ROOT> wrapper)
 * - node.key appears FIRST in attributes (before other props)
 */
export function serialize(node: SmithersNode): string {
  // Skip null/undefined nodes
  if (!node || !node.type) {
    return ''
  }

  // Add warnings for known components under unknown parents (once at root)
  addWarningsForUnknownParents(node)

  return serializeNode(node)
}

/**
 * Internal recursive serialization (doesn't add warnings).
 */
function serializeNode(node: SmithersNode): string {
  // Skip null/undefined nodes
  if (!node || !node.type) {
    return ''
  }

  // TEXT nodes: just escape and return the value
  if (node.type === 'TEXT') {
    return escapeXml(String(node.props['value'] ?? ''))
  }

  // ROOT nodes: serialize children without wrapper tags
  if (node.type === 'ROOT') {
    return node.children.filter(c => c && c.type).map(serializeNode).filter(s => s).join('\n')
  }

  const tag = node.type.toLowerCase()

  // Key attribute goes FIRST (if present) for readability
  const keyAttr = node.key !== undefined ? ` key="${escapeXml(String(node.key))}"` : ''

  // Then other props (filtered and escaped)
  const attrs = serializeProps(node.props)

  // Serialize children recursively
  const children = node.children.filter(c => c && c.type).map(serializeNode).filter(s => s).join('\n')

  // Self-closing tag if no children
  if (!children) {
    return `<${tag}${keyAttr}${attrs} />`
  }

  // Otherwise wrap children with indentation
  return `<${tag}${keyAttr}${attrs}>\n${indent(children)}\n</${tag}>`
}

/**
 * Serialize props to XML attributes.
 *
 * GOTCHA: Several props must be filtered out:
 * - callbacks (onFinished, onError, etc.)
 * - children (handled separately)
 * - key (handled separately via node.key)
 * - any function values
 */
function serializeProps(props: Record<string, unknown>): string {
  // Props that should never appear in XML
  const nonSerializable = new Set([
    'children',      // Handled separately, not a prop
    'onFinished',    // Callbacks are runtime-only
    'onError',
    'onStreamStart',
    'onStreamDelta',
    'onStreamEnd',
    'validate',      // Functions don't serialize
    'key',           // Stored on node.key, not props
  ])

  return Object.entries(props)
    .filter(([key]) => !nonSerializable.has(key))
    .filter(([, value]) => value !== undefined && value !== null)
    .filter(([, value]) => typeof value !== 'function')  // Extra safety: no functions
    .map(([key, value]) => {
      // GOTCHA: Object props need to be serialized as JSON
      if (typeof value === 'object') {
        return ` ${key}="${escapeXml(JSON.stringify(value))}"`
      }
      return ` ${key}="${escapeXml(String(value))}"`
    })
    .join('')
}

/**
 * Escape XML entities.
 *
 * CRITICAL GOTCHA: & MUST be replaced FIRST!
 * Otherwise you'll double-escape: '<' → '&lt;' → '&amp;lt;' ☠️
 *
 * Correct order: & first, then others
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')   // MUST be first!
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')  // Optional but good to have
}

function indent(str: string, spaces = 2): string {
  const prefix = ' '.repeat(spaces)
  return str.split('\n').map(line => prefix + line).join('\n')
}

```

## `src/reconciler/jsx-runtime.ts`

```typescript
/**
 * JSX Runtime for Smithers
 *
 * This module provides the jsx/jsxs/Fragment functions used by babel's
 * automatic JSX runtime to compile JSX to SmithersNode trees.
 */

import type { SmithersNode } from './types.js'

/**
 * Type guard for SmithersNode
 */
function isSmithersNode(value: any): value is SmithersNode {
  return value && typeof value === 'object' && 'type' in value && 'props' in value && 'children' in value
}

/**
 * Create a SmithersNode from JSX
 */
function createNode(
  type: string | ((props: any) => any),
  props: Record<string, any>,
  key?: string | number
): SmithersNode | any {
  // Extract children from props
  const { children, ...restProps } = props

  // If type is a function, it's a component - call it
  if (typeof type === 'function') {
    return type(props)
  }

  // Create a SmithersNode
  const node: SmithersNode = {
    type: type as string,
    props: restProps,
    children: [],
    parent: null,
  }

  // Handle key
  if (key !== undefined) {
    node.key = key
  }

  // Process children
  const childArray = Array.isArray(children) ? children.flat(Infinity) : (children != null ? [children] : [])

  for (const child of childArray) {
    if (child == null || child === false || child === true) {
      continue
    }

    if (typeof child === 'string' || typeof child === 'number') {
      // Create text node
      const textNode: SmithersNode = {
        type: 'TEXT',
        props: { value: String(child) },
        children: [],
        parent: node,
      }
      node.children.push(textNode)
    } else if (isSmithersNode(child)) {
      // Add child node
      child.parent = node
      node.children.push(child)
    }
  }

  return node
}

/**
 * jsx function for automatic runtime (single child)
 */
export function jsx(type: string | ((props: any) => any), props: Record<string, any>, key?: string | number): any {
  return createNode(type, props, key)
}

/**
 * jsxs function for automatic runtime (multiple children)
 */
export function jsxs(type: string | ((props: any) => any), props: Record<string, any>, key?: string | number): any {
  return createNode(type, props, key)
}

/**
 * Fragment - returns children as-is
 */
export function Fragment(props: { children?: any }): any {
  return props.children
}

/**
 * jsxDEV for development mode
 */
export function jsxDEV(type: string | ((props: any) => any), props: Record<string, any>, key?: string | number): any {
  return createNode(type, props, key)
}

export type { SmithersNode }

```

## `src/reconciler/hooks.ts`

```typescript
/**
 * Mount lifecycle hooks vendored from react-use
 * https://github.com/streamich/react-use
 * License: Unlicense (public domain)
 */

import {
  DependencyList,
  EffectCallback,
  useCallback,
  useEffect,
  useRef,
} from "react";

/**
 * Runs an effect exactly once when the component mounts.
 * Unlike a raw useEffect with [], this is semantically clear about intent.
 */
export const useEffectOnce = (effect: EffectCallback) => {
  useEffect(effect, []);
};

/**
 * Runs a callback when the component mounts.
 * More robust than useEffect(() => fn(), []) because it:
 * - Clearly communicates mount-only intent
 * - Is easier to grep for mount behavior
 */
export const useMount = (fn: () => void) => {
  useEffectOnce(() => {
    fn();
  });
};

/**
 * Runs a callback when the component unmounts.
 * More robust than useEffect cleanup because it:
 * - Always calls the latest version of the callback (via ref)
 * - Avoids stale closure issues that plague normal cleanup functions
 */
export const useUnmount = (fn: () => void): void => {
  const fnRef = useRef(fn);

  // Update the ref each render so if it changes, the newest callback will be invoked
  fnRef.current = fn;

  useEffectOnce(() => () => fnRef.current());
};

/**
 * Returns true only on the first render, false on all subsequent renders.
 * Useful for skipping effects on mount or detecting initial state.
 */
export function useFirstMountState(): boolean {
  const isFirst = useRef(true);

  if (isFirst.current) {
    isFirst.current = false;
    return true;
  }

  return isFirst.current;
}

/**
 * Returns a function that tells you if the component is currently mounted.
 * Essential for avoiding "setState on unmounted component" warnings in async code.
 *
 * @example
 * const isMounted = useMountedState();
 *
 * useEffect(() => {
 *   fetchData().then(data => {
 *     if (isMounted()) {
 *       setData(data);
 *     }
 *   });
 * }, []);
 */
export function useMountedState(): () => boolean {
  const mountedRef = useRef<boolean>(false);
  const get = useCallback(() => mountedRef.current, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  return get;
}

/**
 * Returns the value from the previous render.
 * Returns undefined on the first render.
 *
 * @example
 * const count = useCount();
 * const prevCount = usePrevious(count);
 * // On first render: prevCount is undefined
 * // After count changes: prevCount is the old value
 */
export function usePrevious<T>(state: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);

  useEffect(() => {
    ref.current = state;
  });

  return ref.current;
}

const UNSET = Symbol("unset");

/**
 * Runs an effect when a value changes, with idempotency guarantees.
 * Unlike useEffect with [value], this:
 * - Won't run twice for the same value (handles React strict mode)
 * - Updates the "last seen" value synchronously before running the effect
 * - Runs on first mount (when value first becomes available)
 *
 * @example
 * const ralphCount = ralph?.ralphCount ?? 0;
 *
 * useEffectOnValueChange(ralphCount, () => {
 *   // Runs once when ralphCount changes, idempotent
 *   executeTask();
 * });
 */
export function useEffectOnValueChange<T>(
  value: T,
  effect: () => void | (() => void),
  deps: DependencyList = []
): void {
  const lastValueRef = useRef<T | typeof UNSET>(UNSET);

  useEffect(() => {
    if (lastValueRef.current !== UNSET && Object.is(lastValueRef.current, value)) {
      return;
    }
    lastValueRef.current = value;
    return effect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ...deps]);
}

```

## `src/reconciler/index.ts`

```typescript
/**
 * Smithers Reconciler - Custom React renderer for AI orchestration
 *
 * This module exports everything needed to render React components
 * to SmithersNode trees.
 */

// Root creation and mounting
export { createSmithersRoot } from "./root.js";
export type { SmithersRoot } from "./root.js";

// Low-level renderer methods (for testing without JSX)
export { rendererMethods } from "./methods.js";

// React reconciler instance and host config
export { SmithersReconciler, rendererMethods as hostConfigMethods } from "./host-config.js";

// Serialization
export { serialize } from "./serialize.js";

// Types
export type {
  SmithersNode,
  ExecutionState,
  ExecuteOptions,
  ExecutionResult,
  DebugOptions,
  DebugEvent,
} from "./types.js";

// Re-export React hooks for convenience
export {
  useState,
  useEffect,
  useContext,
  useMemo,
  useCallback,
  useRef,
  useReducer,
  createContext,
} from "react";

// Custom hooks
export {
  useEffectOnce,
  useMount,
  useUnmount,
  useFirstMountState,
  useMountedState,
} from "./hooks.js";

```

## `src/reconciler/methods.ts`

```typescript
import type { SmithersNode } from './types.js'

/**
 * Renderer configuration methods.
 * Exported separately for direct testing without JSX.
 * This file has NO React dependencies - it's framework-agnostic.
 */
export const rendererMethods = {
  createElement(type: string): SmithersNode {
    return {
      type,
      props: {},
      children: [],
      parent: null,
    }
  },

  createTextNode(text: string): SmithersNode {
    return {
      type: 'TEXT',
      props: { value: text },
      children: [],
      parent: null,
    }
  },

  replaceText(node: SmithersNode, text: string): void {
    node.props['value'] = text
  },

  setProperty(node: SmithersNode, name: string, value: unknown): void {
    if (name === 'children') {
      // Children are handled by insertNode, not setProperty
      return
    }
    if (name === 'key') {
      // Key is stored on the node itself for the Ralph Wiggum loop
      node.key = value as string | number
      return
    }
    // All other props go into props object
    node.props[name] = value
  },

  insertNode(parent: SmithersNode, node: SmithersNode, anchor?: SmithersNode): void {
    node.parent = parent
    if (anchor) {
      const idx = parent.children.indexOf(anchor)
      if (idx !== -1) {
        parent.children.splice(idx, 0, node)
        return
      }
    }
    parent.children.push(node)
  },

  removeNode(parent: SmithersNode, node: SmithersNode): void {
    const idx = parent.children.indexOf(node)
    if (idx >= 0) {
      parent.children.splice(idx, 1)
    }
    node.parent = null
  },

  isTextNode(node: SmithersNode): boolean {
    return node.type === 'TEXT'
  },

  getParentNode(node: SmithersNode): SmithersNode | undefined {
    return node.parent ?? undefined
  },

  getFirstChild(node: SmithersNode): SmithersNode | undefined {
    return node.children[0]
  },

  getNextSibling(node: SmithersNode): SmithersNode | undefined {
    if (!node.parent) return undefined
    const idx = node.parent.children.indexOf(node)
    if (idx === -1) return undefined
    return node.parent.children[idx + 1]
  },
}

export type { SmithersNode }

```

## `src/reconciler/host-config.ts`

```typescript
import Reconciler from 'react-reconciler'
import type { SmithersNode } from './types.js'
import { rendererMethods } from './methods.js'

// Re-export rendererMethods for backwards compatibility
export { rendererMethods }

type Props = Record<string, unknown>
type Container = SmithersNode
type Instance = SmithersNode
type TextInstance = SmithersNode
type PublicInstance = SmithersNode
type HostContext = object
type UpdatePayload = Props

/**
 * React Reconciler host configuration for SmithersNode trees.
 * This maps React's reconciliation operations to our SmithersNode structure.
 *
 * Note: Using type assertion because react-reconciler types don't fully match
 * the actual API requirements for React 19.
 */
const hostConfig = {
  // Core configuration
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  isPrimaryRenderer: true,

  // Timing
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1 as const,

  // Context
  getRootHostContext(): HostContext {
    return {}
  },

  getChildHostContext(parentHostContext: HostContext): HostContext {
    return parentHostContext
  },

  // Instance creation
  createInstance(type: string, props: Props): Instance {
    const node = rendererMethods.createElement(type)

    // Apply all props
    for (const [key, value] of Object.entries(props)) {
      if (key !== 'children') {
        rendererMethods.setProperty(node, key, value)
      }
    }

    return node
  },

  createTextInstance(text: string): TextInstance {
    return rendererMethods.createTextNode(text)
  },

  // Tree manipulation (mutation mode)
  appendChild(parent: Container, child: Instance | TextInstance): void {
    rendererMethods.insertNode(parent, child)
  },

  appendInitialChild(parent: Instance, child: Instance | TextInstance): void {
    rendererMethods.insertNode(parent, child)
  },

  appendChildToContainer(container: Container, child: Instance | TextInstance): void {
    rendererMethods.insertNode(container, child)
  },

  insertBefore(
    parent: Container,
    child: Instance | TextInstance,
    beforeChild: Instance | TextInstance
  ): void {
    rendererMethods.insertNode(parent, child, beforeChild)
  },

  insertInContainerBefore(
    container: Container,
    child: Instance | TextInstance,
    beforeChild: Instance | TextInstance
  ): void {
    rendererMethods.insertNode(container, child, beforeChild)
  },

  removeChild(parent: Container, child: Instance | TextInstance): void {
    rendererMethods.removeNode(parent, child)
  },

  removeChildFromContainer(container: Container, child: Instance | TextInstance): void {
    rendererMethods.removeNode(container, child)
  },

  // Updates
  prepareUpdate(
    _instance: Instance,
    _type: string,
    oldProps: Props,
    newProps: Props
  ): UpdatePayload | null {
    // Check if props have changed
    const updatePayload: Props = {}
    let hasChanges = false

    for (const key of Object.keys(newProps)) {
      if (key === 'children') continue
      if (oldProps[key] !== newProps[key]) {
        updatePayload[key] = newProps[key]
        hasChanges = true
      }
    }

    // Check for removed props
    for (const key of Object.keys(oldProps)) {
      if (key === 'children') continue
      if (!(key in newProps)) {
        updatePayload[key] = undefined
        hasChanges = true
      }
    }

    return hasChanges ? updatePayload : null
  },

  commitUpdate(
    instance: Instance,
    updatePayload: UpdatePayload,
    _type: string,
    _oldProps: Props,
    _newProps: Props
  ): void {
    for (const [key, value] of Object.entries(updatePayload)) {
      if (value === undefined) {
        delete instance.props[key]
      } else {
        rendererMethods.setProperty(instance, key, value)
      }
    }
  },

  commitTextUpdate(
    textInstance: TextInstance,
    _oldText: string,
    newText: string
  ): void {
    rendererMethods.replaceText(textInstance, newText)
  },

  // Finalization
  finalizeInitialChildren(): boolean {
    return false
  },

  prepareForCommit(): Record<string, unknown> | null {
    return null
  },

  resetAfterCommit(): void {
    // No-op
  },

  // Required methods
  getPublicInstance(instance: Instance): PublicInstance {
    return instance
  },

  shouldSetTextContent(): boolean {
    return false
  },

  clearContainer(container: Container): void {
    container.children = []
  },

  // Event handling (not used for Smithers)
  preparePortalMount(): void {
    // No-op
  },

  // Detach/attach (for offscreen trees)
  detachDeletedInstance(): void {
    // No-op
  },

  // Required for newer React versions
  getCurrentEventPriority(): number {
    return 16 // DefaultEventPriority (DiscreteEventPriority = 1, ContinuousEventPriority = 4, DefaultEventPriority = 16)
  },

  getInstanceFromNode(): null {
    return null
  },

  beforeActiveInstanceBlur(): void {
    // No-op
  },

  afterActiveInstanceBlur(): void {
    // No-op
  },

  prepareScopeUpdate(): void {
    // No-op
  },

  getInstanceFromScope(): null {
    return null
  },

  setCurrentUpdatePriority(): void {
    // No-op
  },

  getCurrentUpdatePriority(): number {
    return 16
  },

  resolveUpdatePriority(): number {
    return 16
  },

  // For microtasks (React 18+)
  supportsMicrotasks: true,
  scheduleMicrotask:
    typeof queueMicrotask === 'function'
      ? queueMicrotask
      : (callback: () => void) => Promise.resolve().then(callback),

  // For hiding/unhiding instances (Suspense boundaries)
  hideInstance(): void {
    // No-op
  },

  hideTextInstance(): void {
    // No-op
  },

  unhideInstance(): void {
    // No-op
  },

  unhideTextInstance(): void {
    // No-op
  },

  // Resources (React 19+)
  NotPendingTransition: null,
  resetFormInstance(): void {
    // No-op
  },
  requestPostPaintCallback(): void {
    // No-op
  },
  shouldAttemptEagerTransition(): boolean {
    return false
  },
  maySuspendCommit(): boolean {
    return false
  },
  preloadInstance(): boolean {
    return true
  },
  startSuspendingCommit(): void {
    // No-op
  },
  suspendInstance(): void {
    // No-op
  },
  waitForCommitToBeReady(): null {
    return null
  },
}

/**
 * Create the React Reconciler instance
 */
export const SmithersReconciler = Reconciler(hostConfig)

// Enable concurrent features
SmithersReconciler.injectIntoDevTools({
  findFiberByHostInstance: () => null,
  bundleType: process.env.NODE_ENV === 'development' ? 1 : 0,
  version: '19.0.0',
  rendererPackageName: 'smithers-react-renderer',
})

export type { SmithersNode }

```

## `src/reconciler/types.ts`

```typescript
/**
 * Core type definitions for Smithers reconciler.
 * These types define the SmithersNode tree structure that the reconciler creates.
 *
 * Key architectural principle: Components execute themselves via onMount,
 * not via external orchestrators. State changes (via React signals) trigger
 * re-renders, which trigger re-execution. This is the "Ralph Wiggum loop"
 * pattern - change the key prop to force unmount/remount.
 */

export interface SmithersNode {
  /** Node type: 'claude', 'phase', 'step', 'TEXT', etc. */
  type: string
  /** Props passed to the component */
  props: Record<string, unknown>
  /** Child nodes */
  children: SmithersNode[]
  /** Reference to parent node (null for root) */
  parent: SmithersNode | null
  /**
   * Unique key for reconciliation.
   * CRITICAL for the "Ralph Wiggum loop" - changing this forces unmount/remount,
   * which triggers re-execution of onMount handlers.
   */
  key?: string | number
  /** Runtime execution state */
  _execution?: ExecutionState
  /** Validation warnings (e.g., known component inside unknown element) */
  warnings?: string[]
}

export interface ExecutionState {
  status: 'pending' | 'running' | 'complete' | 'error'
  result?: unknown
  error?: Error
  contentHash?: string
}

export interface ExecuteOptions {
  maxFrames?: number
  timeout?: number
  verbose?: boolean
  mockMode?: boolean
  debug?: DebugOptions
}

export interface ExecutionResult {
  output: unknown
  frames: number
  totalDuration: number
}

export interface DebugOptions {
  enabled?: boolean
  onEvent?: (event: DebugEvent) => void
}

export interface DebugEvent {
  type: string
  timestamp?: number
  [key: string]: unknown
}

```

## `src/reconciler/README.md`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/reconciler/root.ts`

```typescript
import type { ReactNode } from 'react'
import { SmithersReconciler } from './host-config.js'
import type { SmithersNode } from './types.js'
import { serialize } from './serialize.js'
import { createOrchestrationPromise } from '../components/Ralph.jsx'

// Type for the fiber root container
type FiberRoot = ReturnType<typeof SmithersReconciler.createContainer>

/**
 * Smithers root for mounting React components.
 */
export interface SmithersRoot {
  /**
   * Mount the app and wait for orchestration to complete.
   * Returns a Promise that resolves when Ralph signals completion.
   */
  mount(App: () => ReactNode | Promise<ReactNode>): Promise<void>
  getTree(): SmithersNode
  dispose(): void
  /**
   * Serialize the tree to XML for display/approval.
   * This is crucial for showing users the agent plan before execution.
   */
  toXML(): string
}

/**
 * Create a Smithers root for rendering React components to SmithersNode trees.
 */
export function createSmithersRoot(): SmithersRoot {
  const rootNode: SmithersNode = {
    type: 'ROOT',
    props: {},
    children: [],
    parent: null,
  }

  let fiberRoot: FiberRoot | null = null

  return {
    async mount(App: () => ReactNode | Promise<ReactNode>): Promise<void> {
      // Clean up previous render
      if (fiberRoot) {
        SmithersReconciler.updateContainer(null, fiberRoot, null, () => {})
        rootNode.children = []
      }

      // Create a promise that Ralph will resolve when orchestration completes
      const completionPromise = createOrchestrationPromise()

      // Check if App returns a Promise
      const result = App()

      let element: ReactNode

      if (result && typeof (result as any).then === 'function') {
        // App is async - we need to await the JSX first
        element = await (result as Promise<ReactNode>)
      } else {
        // App is sync
        element = result as ReactNode
      }

      // Create the fiber root container
      // createContainer signature: (containerInfo, tag, hydrate, hydrationCallbacks, isStrictMode, concurrentUpdatesByDefaultOverride, identifierPrefix, transitionCallbacks)
      fiberRoot = SmithersReconciler.createContainer(
        rootNode, // container
        0, // LegacyRoot tag (ConcurrentRoot = 1)
        null, // hydrationCallbacks
        false, // isStrictMode
        null, // concurrentUpdatesByDefaultOverride
        '', // identifierPrefix
        (error: Error) => console.error('Smithers recoverable error:', error), // onRecoverableError
        null // transitionCallbacks
      )

      // Render the app
      SmithersReconciler.updateContainer(element, fiberRoot, null, () => {})

      // Flush the initial render synchronously
      SmithersReconciler.flushSync(() => {})

      // Wait for orchestration to complete (Ralph will signal this)
      await completionPromise
    },

    getTree(): SmithersNode {
      return rootNode
    },

    dispose(): void {
      if (fiberRoot) {
        SmithersReconciler.updateContainer(null, fiberRoot, null, () => {})
        fiberRoot = null
      }
      rootNode.children = []
    },

    toXML(): string {
      return serialize(rootNode)
    },
  }
}

```

## `src/reconciler/serialize.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/hooks/useHuman.ts`

```typescript
import { useState, useCallback, useRef, useEffect } from 'react'
import { useSmithers } from '../components/SmithersProvider.js'
import type { HumanInteraction } from '../db/human.js'
import { useQueryOne } from '../reactive-sqlite/index.js'

export interface AskOptions {
  options?: string[]
}

export interface UseHumanResult {
  /**
   * Request input from a human.
   * Resolves when the human approves/rejects/responds.
   */
  ask: <T = any>(prompt: string, options?: AskOptions) => Promise<T>

  /**
   * Current interaction status
   */
  status: 'idle' | 'pending' | 'resolved'

  /**
   * The current request ID (if any)
   */
  requestId: string | null
}

/**
 * Hook to pause execution and request human input.
 *
 * @example
 * ```tsx
 * const { ask } = useHuman()
 *
 * async function deploy() {
 *   const approved = await ask<boolean>('Deploy to production?', {
 *     options: ['Yes', 'No']
 *   })
 *   if (approved) {
 *     // ...
 *   }
 * }
 * ```
 */
export function useHuman(): UseHumanResult {
  const { db } = useSmithers()
  const [requestId, setRequestId] = useState<string | null>(null)

  // Track the promise resolver so we can call it when DB updates
  const resolveRef = useRef<((value: any) => void) | null>(null)

  // Reactive subscription to the current request
  // This will re-render whenever the request row changes
  const { data: request } = useQueryOne<HumanInteraction>(
    db.db, // Pass ReactiveDatabase
    requestId
      ? `SELECT * FROM human_interactions WHERE id = ?`
      : `SELECT 1 WHERE 0`, // No-op query if no ID
    requestId ? [requestId] : []
  )

  // Resolve promise when request status changes
  useEffect(() => {
    if (request && request.status !== 'pending' && resolveRef.current) {
      let response = null
      try {
        response = request.response ? JSON.parse(request.response as unknown as string) : null
      } catch {
        response = request.response
      }

      const resolve = resolveRef.current
      resolveRef.current = null // Clear first to prevent double-resolve
      resolve(response)
    }
  }, [request])

  const ask = useCallback(async <T = any>(prompt: string, options?: AskOptions) => {
    return new Promise<T>((resolve) => {
      // 1. Store resolver
      resolveRef.current = resolve as (value: any) => void

      // 2. Create request in DB
      const id = db.human.request(
        options?.options ? 'select' : 'confirmation',
        prompt,
        options?.options
      )

      // 3. Set ID to start subscription
      setRequestId(id)
    })
  }, [db])

  return {
    ask,
    status: requestId ? (request?.status === 'pending' ? 'pending' : 'resolved') : 'idle',
    requestId
  }
}

```

## `src/hooks/index.ts`

```typescript
// Smithers hooks
export { useRalphCount } from './useRalphCount.js'
export * from './useHuman.js'

```

## `src/hooks/useRalphCount.ts`

```typescript
// useRalphCount - Reactive hook for getting the current Ralph iteration count
// This hook subscribes to the database for reactive updates when ralphCount changes

import { useSmithers } from '../components/SmithersProvider.js'
import { useQueryValue } from '../reactive-sqlite/index.js'

/**
 * Hook to get the current Ralph iteration count reactively.
 * Subscribes to the database so components re-render when ralphCount changes.
 *
 * @returns The current ralph iteration count (0-indexed)
 */
export function useRalphCount(): number {
  const { reactiveDb } = useSmithers()
  const { data } = useQueryValue<number>(
    reactiveDb,
    "SELECT CAST(value AS INTEGER) as count FROM state WHERE key = 'ralphCount'"
  )
  return data ?? 0
}

```

## `src/utils/structured-output.ts`

```typescript
// Structured Output Utilities
// Re-exports from ./structured-output/ for backward compatibility

export {
  // Types
  type StructuredOutputConfig,
  type ParseResult,
  // Zod to JSON Schema conversion
  zodToJsonSchema,
  convertZodType,
  schemaToPromptDescription,
  // Validation and parsing
  extractJson,
  parseStructuredOutput,
  // Prompt generation
  generateStructuredOutputPrompt,
  generateRetryPrompt,
} from './structured-output/index.js'

```

## `src/utils/vcs.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/utils/structured-output.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/utils/vcs.ts`

```typescript
// VCS utilities for git and jj operations
// Re-exports from vcs/ folder for backward compatibility

export * from './vcs/index.js'

```

## `src/utils/mcp-config.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/utils/mcp-config.ts`

```typescript
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

export interface MCPToolConfig {
  type: 'sqlite' | 'filesystem' | 'github' | 'custom'
  config: Record<string, any>
  instructions?: string
}

export interface ExtractedMCPConfig {
  configs: MCPToolConfig[]
  cleanPrompt: string
  toolInstructions: string
}

/**
 * Extract MCP tool configurations from serialized children string.
 * Parses <mcp-tool> elements and returns configs + clean prompt.
 */
export function extractMCPConfigs(childrenString: string): ExtractedMCPConfig {
  const configs: MCPToolConfig[] = []
  const toolInstructions: string[] = []

  // Regex to match <mcp-tool type="..." config="...">...</mcp-tool>
  const mcpToolRegex = /<mcp-tool\s+type="([^"]+)"\s+config="([^"]+)"[^>]*>([\s\S]*?)<\/mcp-tool>/g

  let cleanPrompt = childrenString
  let match: RegExpExecArray | null

  while ((match = mcpToolRegex.exec(childrenString)) !== null) {
    const [fullMatch, type, configJson, instructions] = match

    try {
      if (!type || !configJson) throw new Error('Missing type or config');
      const config = JSON.parse(configJson.replace(/&quot;/g, '"'))
      const safeInstructions = instructions ? instructions.trim() : '';

      configs.push({
        type: type as MCPToolConfig['type'],
        config,
        instructions: safeInstructions,
      })

      if (safeInstructions) {
        toolInstructions.push(`[${type.toUpperCase()} DATABASE: ${config['path']}]\n${safeInstructions}`)
      }
    } catch (e) {
      console.warn(`Failed to parse MCP tool config: ${e}`)
    }

    // Remove the mcp-tool element from the prompt
    cleanPrompt = cleanPrompt.replace(fullMatch, '')
  }

  // Clean up extra whitespace
  cleanPrompt = cleanPrompt.trim()

  return {
    configs,
    cleanPrompt,
    toolInstructions: toolInstructions.join('\n\n'),
  }
}

/**
 * Generate MCP server configuration for extracted tools.
 */
export function generateMCPServerConfig(configs: MCPToolConfig[]): Record<string, any> {
  const mcpConfig: Record<string, any> = {
    mcpServers: {},
  }

  for (const tool of configs) {
    switch (tool.type) {
      case 'sqlite':
        mcpConfig['mcpServers']['sqlite'] = {
          command: 'bunx',
          args: [
            '-y',
            '@anthropic/mcp-server-sqlite',
            '--db-path',
            tool.config['path'],
            ...(tool.config['readOnly'] ? ['--read-only'] : []),
          ],
        }
        break

      // Future: Add more MCP server types
      case 'filesystem':
      case 'github':
      case 'custom':
        // Placeholder for future implementations
        break
    }
  }

  return mcpConfig
}

/**
 * Write MCP config to a temporary file and return the path.
 */
export async function writeMCPConfigFile(config: Record<string, any>): Promise<string> {
  const tmpDir = os.tmpdir()
  const configPath = path.join(tmpDir, `smithers-mcp-${Date.now()}.json`)
  await fs.writeFile(configPath, JSON.stringify(config, null, 2))
  return configPath
}

```

## `src/db/steps.ts`

```typescript
// Step tracking module for Smithers DB

import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import type { Step } from './types.js'
import { uuid, now } from './utils.js'

export interface StepsModule {
  start: (name?: string) => string
  complete: (id: string, vcsInfo?: { snapshot_before?: string; snapshot_after?: string; commit_created?: string }) => void
  fail: (id: string) => void
  current: () => Step | null
  list: (phaseId: string) => Step[]
  getByExecution: (executionId: string) => Step[]
}

export interface StepsModuleContext {
  rdb: ReactiveDatabase
  getCurrentExecutionId: () => string | null
  getCurrentPhaseId: () => string | null
  getCurrentStepId: () => string | null
  setCurrentStepId: (id: string | null) => void
}

export function createStepsModule(ctx: StepsModuleContext): StepsModule {
  const { rdb, getCurrentExecutionId, getCurrentPhaseId, getCurrentStepId, setCurrentStepId } = ctx

  const steps: StepsModule = {
    start: (name?: string): string => {
      const currentExecutionId = getCurrentExecutionId()
      const currentPhaseId = getCurrentPhaseId()
      if (!currentExecutionId) throw new Error('No active execution')
      const id = uuid()
      rdb.run(
        `INSERT INTO steps (id, execution_id, phase_id, name, status, started_at, created_at)
         VALUES (?, ?, ?, ?, 'running', ?, ?)`,
        [id, currentExecutionId, currentPhaseId, name ?? null, now(), now()]
      )
      setCurrentStepId(id)
      return id
    },

    complete: (id: string, vcsInfo?: { snapshot_before?: string; snapshot_after?: string; commit_created?: string }) => {
      const startRow = rdb.queryOne<{ started_at: string }>('SELECT started_at FROM steps WHERE id = ?', [id])
      const durationMs = startRow ? Date.now() - new Date(startRow.started_at).getTime() : null
      rdb.run(
        `UPDATE steps SET status = 'completed', completed_at = ?, duration_ms = ?, snapshot_before = ?, snapshot_after = ?, commit_created = ? WHERE id = ?`,
        [now(), durationMs, vcsInfo?.snapshot_before ?? null, vcsInfo?.snapshot_after ?? null, vcsInfo?.commit_created ?? null, id]
      )
      if (getCurrentStepId() === id) setCurrentStepId(null)
    },

    fail: (id: string) => {
      rdb.run(`UPDATE steps SET status = 'failed', completed_at = ? WHERE id = ?`, [now(), id])
      if (getCurrentStepId() === id) setCurrentStepId(null)
    },

    current: (): Step | null => {
      const currentStepId = getCurrentStepId()
      if (!currentStepId) return null
      return rdb.queryOne('SELECT * FROM steps WHERE id = ?', [currentStepId])
    },

    list: (phaseId: string): Step[] => {
      return rdb.query('SELECT * FROM steps WHERE phase_id = ? ORDER BY created_at', [phaseId])
    },

    getByExecution: (executionId: string): Step[] => {
      return rdb.query('SELECT * FROM steps WHERE execution_id = ? ORDER BY created_at', [executionId])
    },
  }

  return steps
}

```

## `src/db/tasks.ts`

```typescript
// Task tracking module for Ralph iteration management
// Replaces React state-based task tracking with database-backed tracking

import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import { uuid, now } from './utils.js'

export interface Task {
  id: string
  execution_id: string
  iteration: number
  component_type: string
  component_name: string | null
  status: 'running' | 'completed' | 'failed'
  started_at: string
  completed_at: string | null
  duration_ms: number | null
}

export interface TasksModule {
  /**
   * Start a new task and return its ID.
   * Replaces registerTask() in RalphContext.
   */
  start: (componentType: string, componentName?: string) => string

  /**
   * Complete a task by ID.
   * Replaces completeTask() in RalphContext.
   */
  complete: (id: string) => void

  /**
   * Mark a task as failed.
   */
  fail: (id: string) => void

  /**
   * Get count of running tasks for a specific iteration.
   */
  getRunningCount: (iteration: number) => number

  /**
   * Get count of all tasks for a specific iteration.
   */
  getTotalCount: (iteration: number) => number

  /**
   * Get all tasks for the current execution.
   */
  list: () => Task[]

  /**
   * Get current iteration from the state table.
   */
  getCurrentIteration: () => number
}

export interface TasksModuleContext {
  rdb: ReactiveDatabase
  getCurrentExecutionId: () => string | null
}

export function createTasksModule(ctx: TasksModuleContext): TasksModule {
  const { rdb, getCurrentExecutionId } = ctx

  const tasks: TasksModule = {
    start: (componentType: string, componentName?: string): string => {
      const executionId = getCurrentExecutionId()
      if (!executionId) throw new Error('No active execution')

      // Get current iteration from state
      const iteration = tasks.getCurrentIteration()

      const id = uuid()
      rdb.run(
        `INSERT INTO tasks (id, execution_id, iteration, component_type, component_name, status, started_at)
         VALUES (?, ?, ?, ?, ?, 'running', ?)`,
        [id, executionId, iteration, componentType, componentName ?? null, now()]
      )
      return id
    },

    complete: (id: string) => {
      const startRow = rdb.queryOne<{ started_at: string }>('SELECT started_at FROM tasks WHERE id = ?', [id])
      const durationMs = startRow ? Date.now() - new Date(startRow.started_at).getTime() : null
      rdb.run(
        `UPDATE tasks SET status = 'completed', completed_at = ?, duration_ms = ? WHERE id = ?`,
        [now(), durationMs, id]
      )
    },

    fail: (id: string) => {
      const startRow = rdb.queryOne<{ started_at: string }>('SELECT started_at FROM tasks WHERE id = ?', [id])
      const durationMs = startRow ? Date.now() - new Date(startRow.started_at).getTime() : null
      rdb.run(
        `UPDATE tasks SET status = 'failed', completed_at = ?, duration_ms = ? WHERE id = ?`,
        [now(), durationMs, id]
      )
    },

    getRunningCount: (iteration: number): number => {
      const executionId = getCurrentExecutionId()
      if (!executionId) return 0

      const result = rdb.queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM tasks WHERE execution_id = ? AND iteration = ? AND status = 'running'`,
        [executionId, iteration]
      )
      return result?.count ?? 0
    },

    getTotalCount: (iteration: number): number => {
      const executionId = getCurrentExecutionId()
      if (!executionId) return 0

      const result = rdb.queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM tasks WHERE execution_id = ? AND iteration = ?`,
        [executionId, iteration]
      )
      return result?.count ?? 0
    },

    list: (): Task[] => {
      const executionId = getCurrentExecutionId()
      if (!executionId) return []

      return rdb.query<Task>(
        'SELECT * FROM tasks WHERE execution_id = ? ORDER BY started_at',
        [executionId]
      )
    },

    getCurrentIteration: (): number => {
      const result = rdb.queryOne<{ value: string }>(
        "SELECT value FROM state WHERE key = 'ralphCount'"
      )
      return result ? parseInt(result.value, 10) : 0
    },
  }

  return tasks
}

```

## `src/db/execution.ts`

```typescript
// Execution tracking module for Smithers DB

import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import type { Execution } from './types.js'
import { uuid, now, parseJson } from './utils.js'

export interface ExecutionModule {
  start: (name: string, filePath: string, config?: Record<string, any>) => string
  complete: (id: string, result?: Record<string, any>) => void
  fail: (id: string, error: string) => void
  cancel: (id: string) => void
  current: () => Execution | null
  get: (id: string) => Execution | null
  list: (limit?: number) => Execution[]
  findIncomplete: () => Execution | null
}

export interface ExecutionModuleContext {
  rdb: ReactiveDatabase
  getCurrentExecutionId: () => string | null
  setCurrentExecutionId: (id: string | null) => void
}

// Helper to map row to typed object with JSON parsing
const mapExecution = (row: any): Execution | null => {
  if (!row) return null
  return {
    ...row,
    config: parseJson(row.config, {}),
    result: parseJson(row.result, undefined),
  }
}

export function createExecutionModule(ctx: ExecutionModuleContext): ExecutionModule {
  const { rdb, getCurrentExecutionId, setCurrentExecutionId } = ctx

  const execution: ExecutionModule = {
    start: (name: string, filePath: string, config?: Record<string, any>): string => {
      const id = uuid()
      rdb.run(
        `INSERT INTO executions (id, name, file_path, status, config, started_at, created_at)
         VALUES (?, ?, ?, 'running', ?, ?, ?)`,
        [id, name, filePath, JSON.stringify(config ?? {}), now(), now()]
      )
      setCurrentExecutionId(id)
      return id
    },

    complete: (id: string, result?: Record<string, any>) => {
      rdb.run(
        `UPDATE executions SET status = 'completed', result = ?, completed_at = ? WHERE id = ?`,
        [result ? JSON.stringify(result) : null, now(), id]
      )
      if (getCurrentExecutionId() === id) setCurrentExecutionId(null)
    },

    fail: (id: string, error: string) => {
      rdb.run(
        `UPDATE executions SET status = 'failed', error = ?, completed_at = ? WHERE id = ?`,
        [error, now(), id]
      )
      if (getCurrentExecutionId() === id) setCurrentExecutionId(null)
    },

    cancel: (id: string) => {
      rdb.run(
        `UPDATE executions SET status = 'cancelled', completed_at = ? WHERE id = ?`,
        [now(), id]
      )
      if (getCurrentExecutionId() === id) setCurrentExecutionId(null)
    },

    current: (): Execution | null => {
      const currentId = getCurrentExecutionId()
      if (!currentId) return null
      return mapExecution(rdb.queryOne('SELECT * FROM executions WHERE id = ?', [currentId]))
    },

    get: (id: string): Execution | null => {
      return mapExecution(rdb.queryOne('SELECT * FROM executions WHERE id = ?', [id]))
    },

    list: (limit: number = 20): Execution[] => {
      return rdb.query<any>('SELECT * FROM executions ORDER BY created_at DESC LIMIT ?', [limit])
        .map(mapExecution)
        .filter((e): e is Execution => e !== null)
    },

    findIncomplete: (): Execution | null => {
      return mapExecution(rdb.queryOne(
        "SELECT * FROM executions WHERE status IN ('pending', 'running') ORDER BY created_at DESC LIMIT 1"
      ))
    },
  }

  return execution
}

```

## `src/db/query.ts`

```typescript
// Raw query access module for Smithers DB

import type { ReactiveDatabase } from '../reactive-sqlite/index.js'

export type QueryFunction = <T>(sql: string, params?: any[]) => T[]

export interface QueryModuleContext {
  rdb: ReactiveDatabase
}

export function createQueryModule(ctx: QueryModuleContext): QueryFunction {
  const { rdb } = ctx

  return <T>(sql: string, params?: any[]): T[] => {
    return rdb.query<T>(sql, params ?? [])
  }
}

```

## `src/db/index.ts`

```typescript
// Smithers Database - SQLite-based state management
// Single source of truth for all orchestration state

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { ReactiveDatabase } from '../reactive-sqlite/index.js'
// Types are re-exported from './types.js' at the bottom of this file

// Import modules
import { createStateModule, type StateModule } from './state.js'
import { createMemoriesModule, type MemoriesModule } from './memories.js'
import { createExecutionModule, type ExecutionModule } from './execution.js'
import { createPhasesModule, type PhasesModule } from './phases.js'
import { createAgentsModule, type AgentsModule } from './agents.js'
import { createStepsModule, type StepsModule } from './steps.js'
import { createTasksModule, type TasksModule } from './tasks.js'
import { createToolsModule, type ToolsModule } from './tools.js'
import { createArtifactsModule, type ArtifactsModule } from './artifacts.js'
import { createHumanModule, type HumanModule } from './human.js'
import { createVcsModule, type VcsModule } from './vcs.js'
import { createQueryModule, type QueryFunction } from './query.js'

export interface SmithersDB {
  /**
   * Raw ReactiveDatabase instance (for advanced usage)
   */
  db: ReactiveDatabase

  /**
   * State management (replaces Zustand)
   */
  state: StateModule

  /**
   * Memory operations
   */
  memories: MemoriesModule

  /**
   * Execution tracking
   */
  execution: ExecutionModule

  /**
   * Phase tracking
   */
  phases: PhasesModule

  /**
   * Agent tracking
   */
  agents: AgentsModule

  /**
   * Step tracking
   */
  steps: StepsModule

  /**
   * Task tracking (for Ralph iteration management)
   */
  tasks: TasksModule

  /**
   * Tool call tracking
   */
  tools: ToolsModule

  /**
   * Artifact tracking
   */
  artifacts: ArtifactsModule

  /**
   * Human interaction tracking
   */
  human: HumanModule

  /**
   * VCS tracking
   */
  vcs: VcsModule

  /**
   * Raw query access
   */
  query: QueryFunction

  /**
   * Close the database connection
   */
  close: () => void
}

export interface SmithersDBOptions {
  path?: string
  reset?: boolean
}

/**
 * Run database migrations for existing databases.
 * This ensures new columns are added to tables that were created before schema updates.
 */
function runMigrations(rdb: ReactiveDatabase): void {
  // Migration: Add log_path column to agents table if it doesn't exist
  const agentsColumns = rdb.query<{ name: string }>('PRAGMA table_info(agents)')
  const hasLogPath = agentsColumns.some((col) => col.name === 'log_path')
  if (!hasLogPath) {
    rdb.exec('ALTER TABLE agents ADD COLUMN log_path TEXT')
  }
}

/**
 * Create a Smithers database instance
 */
export function createSmithersDB(options: SmithersDBOptions = {}): SmithersDB {
  // Determine database path
  const dbPath = options.path ?? ':memory:'

  // Create ReactiveDatabase
  const rdb = new ReactiveDatabase(dbPath)

  // Initialize schema
  let schemaPath: string
  try {
    const currentFileUrl = import.meta.url
    if (currentFileUrl.startsWith('file://')) {
      const currentDir = path.dirname(fileURLToPath(currentFileUrl))
      schemaPath = path.join(currentDir, 'schema.sql')
    } else {
      schemaPath = path.resolve(process.cwd(), 'src/db/schema.sql')
    }
  } catch {
    schemaPath = path.resolve(process.cwd(), 'src/db/schema.sql')
  }

  // Reset if requested
  if (options.reset) {
    const tables = ['tasks', 'steps', 'reviews', 'snapshots', 'commits', 'reports', 'artifacts',
                    'transitions', 'state', 'tool_calls', 'agents', 'phases', 'executions', 'memories']
    for (const table of tables) {
      try { rdb.exec(`DROP TABLE IF EXISTS ${table}`) } catch {}
    }
  }

  // Execute schema
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8')
  rdb.exec(schemaSql)

  // Run migrations for existing databases
  runMigrations(rdb)

  // Track current execution context
  let currentExecutionId: string | null = null
  let currentPhaseId: string | null = null
  let currentAgentId: string | null = null
  let currentStepId: string | null = null

  // Context getters and setters for modules
  const getCurrentExecutionId = () => currentExecutionId
  const setCurrentExecutionId = (id: string | null) => { currentExecutionId = id }
  const getCurrentPhaseId = () => currentPhaseId
  const setCurrentPhaseId = (id: string | null) => { currentPhaseId = id }
  const getCurrentAgentId = () => currentAgentId
  const setCurrentAgentId = (id: string | null) => { currentAgentId = id }
  const getCurrentStepId = () => currentStepId
  const setCurrentStepId = (id: string | null) => { currentStepId = id }

  // Create all modules
  const state = createStateModule({ rdb, getCurrentExecutionId })
  const memories = createMemoriesModule({ rdb, getCurrentExecutionId })
  const execution = createExecutionModule({ rdb, getCurrentExecutionId, setCurrentExecutionId })
  const phases = createPhasesModule({ rdb, getCurrentExecutionId, getCurrentPhaseId, setCurrentPhaseId })
  const agents = createAgentsModule({ rdb, getCurrentExecutionId, getCurrentPhaseId, getCurrentAgentId, setCurrentAgentId })
  const steps = createStepsModule({ rdb, getCurrentExecutionId, getCurrentPhaseId, getCurrentStepId, setCurrentStepId })
  const tasks = createTasksModule({ rdb, getCurrentExecutionId })
  const tools = createToolsModule({ rdb, getCurrentExecutionId })
  const artifacts = createArtifactsModule({ rdb, getCurrentExecutionId })
  const human = createHumanModule({ rdb, getCurrentExecutionId })
  const vcs = createVcsModule({ rdb, getCurrentExecutionId })
  const query = createQueryModule({ rdb })

  const db: SmithersDB = {
    db: rdb,
    state,
    memories,
    execution,
    phases,
    agents,
    steps,
    tasks,
    tools,
    artifacts,
    human,
    vcs,
    query,
    close: () => {
      rdb.close()
    },
  }

  return db
}

// Re-export types
export * from './types.js'

// Re-export reactive-sqlite for direct use
export { ReactiveDatabase, useQuery, useMutation, useQueryOne, useQueryValue } from '../reactive-sqlite/index.js'

// Re-export module types for consumers who need them
export type { StateModule } from './state.js'
export type { MemoriesModule } from './memories.js'
export type { ExecutionModule } from './execution.js'
export type { PhasesModule } from './phases.js'
export type { AgentsModule } from './agents.js'
export type { StepsModule } from './steps.js'
export type { TasksModule } from './tasks.js'
export type { ToolsModule } from './tools.js'
export type { ArtifactsModule } from './artifacts.js'
export type { HumanModule } from './human.js'
export type { VcsModule } from './vcs.js'
export type { QueryFunction } from './query.js'

```

## `src/db/tools.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/db/memories.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/db/tools.ts`

```typescript
// Tool call tracking module for Smithers DB

import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import type { ToolCall } from './types.js'
import { uuid, now, parseJson } from './utils.js'

export interface ToolsModule {
  start: (agentId: string, toolName: string, input: Record<string, any>) => string
  complete: (id: string, output: string, summary?: string) => void
  fail: (id: string, error: string) => void
  list: (agentId: string) => ToolCall[]
  getOutput: (id: string) => string | null
}

export interface ToolsModuleContext {
  rdb: ReactiveDatabase
  getCurrentExecutionId: () => string | null
}

// Helper to map row to typed object with JSON parsing
const mapToolCall = (row: any): ToolCall | null => {
  if (!row) return null
  return {
    ...row,
    input: parseJson(row.input, {}),
  }
}

export function createToolsModule(ctx: ToolsModuleContext): ToolsModule {
  const { rdb, getCurrentExecutionId } = ctx

  const tools: ToolsModule = {
    start: (agentId: string, toolName: string, input: Record<string, any>): string => {
      const currentExecutionId = getCurrentExecutionId()
      if (!currentExecutionId) throw new Error('No active execution')
      const id = uuid()
      rdb.run(
        `INSERT INTO tool_calls (id, agent_id, execution_id, tool_name, input, status, started_at, created_at)
         VALUES (?, ?, ?, ?, ?, 'running', ?, ?)`,
        [id, agentId, currentExecutionId, toolName, JSON.stringify(input), now(), now()]
      )
      rdb.run('UPDATE executions SET total_tool_calls = total_tool_calls + 1 WHERE id = ?', [currentExecutionId])
      rdb.run('UPDATE agents SET tool_calls_count = tool_calls_count + 1 WHERE id = ?', [agentId])
      return id
    },

    complete: (id: string, output: string, summary?: string) => {
      const startRow = rdb.queryOne<{ started_at: string }>('SELECT started_at FROM tool_calls WHERE id = ?', [id])
      const durationMs = startRow ? Date.now() - new Date(startRow.started_at).getTime() : null
      const outputSize = Buffer.byteLength(output, 'utf8')

      if (outputSize < 1024) {
        rdb.run(
          `UPDATE tool_calls SET status = 'completed', output_inline = ?, output_summary = ?, output_size_bytes = ?, completed_at = ?, duration_ms = ? WHERE id = ?`,
          [output, summary ?? null, outputSize, now(), durationMs, id]
        )
      } else {
        rdb.run(
          `UPDATE tool_calls SET status = 'completed', output_summary = ?, output_size_bytes = ?, completed_at = ?, duration_ms = ? WHERE id = ?`,
          [summary ?? output.slice(0, 200), outputSize, now(), durationMs, id]
        )
      }
    },

    fail: (id: string, error: string) => {
      rdb.run(`UPDATE tool_calls SET status = 'failed', error = ?, completed_at = ? WHERE id = ?`, [error, now(), id])
    },

    list: (agentId: string): ToolCall[] => {
      return rdb.query<any>('SELECT * FROM tool_calls WHERE agent_id = ? ORDER BY created_at', [agentId])
        .map(mapToolCall)
        .filter((t): t is ToolCall => t !== null)
    },

    getOutput: (id: string): string | null => {
      const row = rdb.queryOne<{ output_inline: string | null }>('SELECT output_inline FROM tool_calls WHERE id = ?', [id])
      return row?.output_inline ?? null
    },
  }

  return tools
}

```

## `src/db/state.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/db/vcs.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/db/tasks.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/db/execution.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/db/steps.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/db/types.ts`

```typescript
// Type definitions for Smithers DB

export interface Memory {
  id: string
  category: 'fact' | 'learning' | 'preference' | 'context' | 'skill'
  scope: 'global' | 'project' | 'session'
  key: string
  content: string
  confidence: number
  source?: string
  source_execution_id?: string
  created_at: Date
  updated_at: Date
  accessed_at: Date
  expires_at?: Date
}

export interface MemoryInput {
  category: Memory['category']
  key: string
  content: string
  scope?: Memory['scope']
  confidence?: number
  source?: string
  expires_at?: Date
}

export interface Execution {
  id: string
  name?: string
  file_path: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  config: Record<string, any>
  result?: Record<string, any>
  error?: string
  started_at?: Date
  completed_at?: Date
  created_at: Date
  total_iterations: number
  total_agents: number
  total_tool_calls: number
  total_tokens_used: number
}

export interface Phase {
  id: string
  execution_id: string
  name: string
  iteration: number
  status: 'pending' | 'running' | 'completed' | 'skipped' | 'failed'
  started_at?: Date
  completed_at?: Date
  created_at: Date
  duration_ms?: number
  agents_count: number
}

export interface Agent {
  id: string
  execution_id: string
  phase_id?: string
  model: string
  system_prompt?: string
  prompt: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  result?: string
  result_structured?: Record<string, any>
  log_path?: string
  error?: string
  started_at?: Date
  completed_at?: Date
  created_at: Date
  duration_ms?: number
  tokens_input?: number
  tokens_output?: number
  tool_calls_count: number
}

export interface ToolCall {
  id: string
  agent_id: string
  execution_id: string
  tool_name: string
  input: Record<string, any>
  output_inline?: string
  output_path?: string
  output_git_hash?: string
  output_summary?: string
  output_size_bytes?: number
  status: 'pending' | 'running' | 'completed' | 'failed'
  error?: string
  started_at?: Date
  completed_at?: Date
  created_at: Date
  duration_ms?: number
}

export interface StateEntry {
  key: string
  value: any
  updated_at: Date
}

export interface Transition {
  id: string
  execution_id?: string
  key: string
  old_value?: any
  new_value: any
  trigger?: string
  trigger_agent_id?: string
  created_at: Date
}

export interface Artifact {
  id: string
  execution_id: string
  agent_id?: string
  name: string
  type: 'file' | 'code' | 'document' | 'image' | 'data'
  file_path: string
  git_hash?: string
  git_commit?: string
  summary?: string
  line_count?: number
  byte_size?: number
  metadata: Record<string, any>
  created_at: Date
}

// ============================================================================
// VCS and Reporting Tables
// ============================================================================

export interface Report {
  id: string
  execution_id: string
  agent_id?: string
  type: 'progress' | 'finding' | 'warning' | 'error' | 'metric' | 'decision'
  title: string
  content: string
  data?: Record<string, any>
  severity: 'info' | 'warning' | 'critical'
  created_at: Date
}

export interface Commit {
  id: string
  execution_id: string
  agent_id?: string
  vcs_type: 'git' | 'jj'
  commit_hash: string
  change_id?: string
  message: string
  author?: string
  files_changed?: string[]
  insertions?: number
  deletions?: number
  smithers_metadata?: Record<string, any>
  created_at: Date
}

export interface Snapshot {
  id: string
  execution_id: string
  change_id: string
  commit_hash?: string
  description?: string
  files_modified?: string[]
  files_added?: string[]
  files_deleted?: string[]
  has_conflicts: boolean
  created_at: Date
}

export interface Review {
  id: string
  execution_id: string
  agent_id?: string
  target_type: 'commit' | 'diff' | 'pr' | 'files'
  target_ref?: string
  approved: boolean
  summary: string
  issues: ReviewIssue[]
  approvals?: ReviewApproval[]
  reviewer_model?: string
  blocking: boolean
  posted_to_github: boolean
  posted_to_git_notes: boolean
  created_at: Date
}

export interface ReviewIssue {
  severity: 'critical' | 'major' | 'minor' | 'suggestion'
  file?: string
  line?: number
  message: string
  suggestion?: string
}

export interface ReviewApproval {
  aspect: string
  reason: string
}

export interface Step {
  id: string
  execution_id: string
  phase_id?: string
  name?: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  started_at?: Date
  completed_at?: Date
  created_at: Date
  duration_ms?: number
  snapshot_before?: string
  snapshot_after?: string
  commit_created?: string
}

export interface Task {
  id: string
  execution_id: string
  iteration: number
  component_type: string
  component_name: string | null
  status: 'running' | 'completed' | 'failed'
  started_at: string
  completed_at: string | null
  duration_ms: number | null
}

```

## `src/db/human.ts`

```typescript
// Human interaction module
// Handles requests for human input/confirmation

import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import { uuid, now } from './utils.js'

export interface HumanInteraction {
  id: string
  execution_id: string
  type: string
  prompt: string
  options: string[] | null
  status: 'pending' | 'approved' | 'rejected' | 'timeout'
  response: any | null
  created_at: string
  resolved_at: string | null
}

export interface HumanModule {
  /**
   * Request human interaction
   */
  request: (type: string, prompt: string, options?: string[]) => string

  /**
   * Resolve a request (called by external harness)
   */
  resolve: (id: string, status: 'approved' | 'rejected', response?: unknown) => void

  /**
   * Get a request by ID
   */
  get: (id: string) => HumanInteraction | null

  /**
   * List pending requests
   */
  listPending: () => HumanInteraction[]
}

export interface HumanModuleContext {
  rdb: ReactiveDatabase
  getCurrentExecutionId: () => string | null
}

export function createHumanModule(ctx: HumanModuleContext): HumanModule {
  const { rdb, getCurrentExecutionId } = ctx

  return {
    request: (type: string, prompt: string, options: string[] = []): string => {
      const executionId = getCurrentExecutionId()
      if (!executionId) throw new Error('No active execution')

      const id = uuid()
      rdb.run(
        `INSERT INTO human_interactions (id, execution_id, type, prompt, options, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
        [id, executionId, type, prompt, JSON.stringify(options), now()]
      )
      return id
    },

    resolve: (id: string, status: 'approved' | 'rejected', response: unknown = null) => {
      rdb.run(
        `UPDATE human_interactions
         SET status = ?, response = ?, resolved_at = ?
         WHERE id = ?`,
        [status, JSON.stringify(response), now(), id]
      )
    },

    get: (id: string): HumanInteraction | null => {
      const row = rdb.queryOne<any>('SELECT * FROM human_interactions WHERE id = ?', [id])
      if (!row) return null
      return {
        ...row,
        options: row.options ? JSON.parse(row.options) : null,
        response: row.response ? JSON.parse(row.response) : null
      }
    },

    listPending: (): HumanInteraction[] => {
       const executionId = getCurrentExecutionId()
       if (!executionId) return []
       const rows = rdb.query<any>(
         "SELECT * FROM human_interactions WHERE execution_id = ? AND status = 'pending'",
         [executionId]
       )
       return rows.map(row => ({
         ...row,
          options: row.options ? JSON.parse(row.options) : null,
          response: row.response ? JSON.parse(row.response) : null
       }))
    }
  }
}

```

## `src/db/agents.ts`

```typescript
// Agent tracking module for Smithers DB

import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import type { Agent } from './types.js'
import { uuid, now, parseJson } from './utils.js'

export interface AgentsModule {
  start: (prompt: string, model?: string, systemPrompt?: string, logPath?: string) => string
  complete: (id: string, result: string, structuredResult?: Record<string, any>, tokens?: { input: number; output: number }) => void
  fail: (id: string, error: string) => void
  current: () => Agent | null
  list: (executionId: string) => Agent[]
}

export interface AgentsModuleContext {
  rdb: ReactiveDatabase
  getCurrentExecutionId: () => string | null
  getCurrentPhaseId: () => string | null
  getCurrentAgentId: () => string | null
  setCurrentAgentId: (id: string | null) => void
}

// Helper to map row to typed object with JSON parsing
const mapAgent = (row: any): Agent | null => {
  if (!row) return null
  return {
    ...row,
    result_structured: parseJson(row.result_structured, undefined),
  }
}

export function createAgentsModule(ctx: AgentsModuleContext): AgentsModule {
  const { rdb, getCurrentExecutionId, getCurrentPhaseId, getCurrentAgentId, setCurrentAgentId } = ctx

  const agents: AgentsModule = {
    start: (prompt: string, model: string = 'sonnet', systemPrompt?: string, logPath?: string): string => {
      const currentExecutionId = getCurrentExecutionId()
      const currentPhaseId = getCurrentPhaseId()
      if (!currentExecutionId) throw new Error('No active execution')
      const id = uuid()
      rdb.run(
        `INSERT INTO agents (id, execution_id, phase_id, model, system_prompt, prompt, status, started_at, created_at, log_path)
         VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?, ?)`,
        [id, currentExecutionId, currentPhaseId, model, systemPrompt ?? null, prompt, now(), now(), logPath ?? null]
      )
      rdb.run('UPDATE executions SET total_agents = total_agents + 1 WHERE id = ?', [currentExecutionId])
      setCurrentAgentId(id)
      return id
    },

    complete: (id: string, result: string, structuredResult?: Record<string, any>, tokens?: { input: number; output: number }) => {
      const startRow = rdb.queryOne<{ started_at: string; execution_id: string }>('SELECT started_at, execution_id FROM agents WHERE id = ?', [id])
      const durationMs = startRow ? Date.now() - new Date(startRow.started_at).getTime() : null
      rdb.run(
        `UPDATE agents SET status = 'completed', result = ?, result_structured = ?, tokens_input = ?, tokens_output = ?, completed_at = ?, duration_ms = ? WHERE id = ?`,
        [result, structuredResult ? JSON.stringify(structuredResult) : null, tokens?.input ?? null, tokens?.output ?? null, now(), durationMs, id]
      )
      if (tokens && startRow) {
        rdb.run('UPDATE executions SET total_tokens_used = total_tokens_used + ? WHERE id = ?',
          [(tokens.input ?? 0) + (tokens.output ?? 0), startRow.execution_id])
      }
      if (getCurrentAgentId() === id) setCurrentAgentId(null)
    },

    fail: (id: string, error: string) => {
      rdb.run(`UPDATE agents SET status = 'failed', error = ?, completed_at = ? WHERE id = ?`, [error, now(), id])
      if (getCurrentAgentId() === id) setCurrentAgentId(null)
    },

    current: (): Agent | null => {
      const currentAgentId = getCurrentAgentId()
      if (!currentAgentId) return null
      return mapAgent(rdb.queryOne('SELECT * FROM agents WHERE id = ?', [currentAgentId]))
    },

    list: (executionId: string): Agent[] => {
      return rdb.query<any>('SELECT * FROM agents WHERE execution_id = ? ORDER BY created_at', [executionId])
        .map(mapAgent)
        .filter((a): a is Agent => a !== null)
    },
  }

  return agents
}

```

## `src/db/phases.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/db/phases.ts`

```typescript
// Phase tracking module for Smithers DB

import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import type { Phase } from './types.js'
import { uuid, now } from './utils.js'

export interface PhasesModule {
  start: (name: string, iteration?: number) => string
  complete: (id: string) => void
  fail: (id: string) => void
  current: () => Phase | null
  list: (executionId: string) => Phase[]
}

export interface PhasesModuleContext {
  rdb: ReactiveDatabase
  getCurrentExecutionId: () => string | null
  getCurrentPhaseId: () => string | null
  setCurrentPhaseId: (id: string | null) => void
}

export function createPhasesModule(ctx: PhasesModuleContext): PhasesModule {
  const { rdb, getCurrentExecutionId, getCurrentPhaseId, setCurrentPhaseId } = ctx

  const phases: PhasesModule = {
    start: (name: string, iteration: number = 0): string => {
      const currentExecutionId = getCurrentExecutionId()
      if (!currentExecutionId) throw new Error('No active execution')
      const id = uuid()
      rdb.run(
        `INSERT INTO phases (id, execution_id, name, iteration, status, started_at, created_at)
         VALUES (?, ?, ?, ?, 'running', ?, ?)`,
        [id, currentExecutionId, name, iteration, now(), now()]
      )
      setCurrentPhaseId(id)
      return id
    },

    complete: (id: string) => {
      const startRow = rdb.queryOne<{ started_at: string }>('SELECT started_at FROM phases WHERE id = ?', [id])
      const durationMs = startRow ? Date.now() - new Date(startRow.started_at).getTime() : null
      rdb.run(
        `UPDATE phases SET status = 'completed', completed_at = ?, duration_ms = ? WHERE id = ?`,
        [now(), durationMs, id]
      )
      if (getCurrentPhaseId() === id) setCurrentPhaseId(null)
    },

    fail: (id: string) => {
      rdb.run(`UPDATE phases SET status = 'failed', completed_at = ? WHERE id = ?`, [now(), id])
      if (getCurrentPhaseId() === id) setCurrentPhaseId(null)
    },

    current: (): Phase | null => {
      const currentPhaseId = getCurrentPhaseId()
      if (!currentPhaseId) return null
      return rdb.queryOne('SELECT * FROM phases WHERE id = ?', [currentPhaseId])
    },

    list: (executionId: string): Phase[] => {
      return rdb.query('SELECT * FROM phases WHERE execution_id = ? ORDER BY created_at', [executionId])
    },
  }

  return phases
}

```

## `src/db/utils.ts`

```typescript
// Shared utilities for Smithers DB modules

// Helper to generate UUIDs
export const uuid = () => crypto.randomUUID()

// Helper to get current ISO timestamp
export const now = () => new Date().toISOString()

// Helper to safely parse JSON
export const parseJson = <T>(str: string | null | undefined, defaultValue: T): T => {
  if (!str) return defaultValue
  try {
    return JSON.parse(str)
  } catch {
    return defaultValue
  }
}

```

## `src/db/vcs.ts`

```typescript
// VCS/commit/snapshot/review tracking module for Smithers DB

import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import type { Commit, Snapshot, Review, Report } from './types.js'
import { uuid, now, parseJson } from './utils.js'

export interface VcsModule {
  logCommit: (commit: {
    vcs_type: 'git' | 'jj'
    commit_hash: string
    change_id?: string
    message: string
    author?: string
    files_changed?: string[]
    insertions?: number
    deletions?: number
    smithers_metadata?: Record<string, any>
    agent_id?: string
  }) => string
  getCommits: (limit?: number) => Commit[]
  getCommit: (hash: string, vcsType?: 'git' | 'jj') => Commit | null
  logSnapshot: (snapshot: {
    change_id: string
    commit_hash?: string
    description?: string
    files_modified?: string[]
    files_added?: string[]
    files_deleted?: string[]
    has_conflicts?: boolean
  }) => string
  getSnapshots: (limit?: number) => Snapshot[]
  logReview: (review: {
    target_type: 'commit' | 'diff' | 'pr' | 'files'
    target_ref?: string
    approved: boolean
    summary: string
    issues: any[]
    approvals?: any[]
    reviewer_model?: string
    blocking?: boolean
    agent_id?: string
  }) => string
  updateReview: (id: string, updates: { posted_to_github?: boolean; posted_to_git_notes?: boolean }) => void
  getReviews: (limit?: number) => Review[]
  getBlockingReviews: () => Review[]
  addReport: (report: {
    type: 'progress' | 'finding' | 'warning' | 'error' | 'metric' | 'decision'
    title: string
    content: string
    data?: Record<string, any>
    severity?: 'info' | 'warning' | 'critical'
    agent_id?: string
  }) => string
  getReports: (type?: Report['type'], limit?: number) => Report[]
  getCriticalReports: () => Report[]
}

export interface VcsModuleContext {
  rdb: ReactiveDatabase
  getCurrentExecutionId: () => string | null
}

// Helper mappers
const mapCommit = (row: any): Commit | null => {
  if (!row) return null
  return {
    ...row,
    files_changed: parseJson(row.files_changed, undefined),
    smithers_metadata: parseJson(row.smithers_metadata, undefined),
  }
}

const mapSnapshot = (row: any): Snapshot | null => {
  if (!row) return null
  return {
    ...row,
    files_modified: parseJson(row.files_modified, undefined),
    files_added: parseJson(row.files_added, undefined),
    files_deleted: parseJson(row.files_deleted, undefined),
    has_conflicts: Boolean(row.has_conflicts),
  }
}

const mapReview = (row: any): Review | null => {
  if (!row) return null
  return {
    ...row,
    approved: Boolean(row.approved),
    issues: parseJson(row.issues, []),
    approvals: parseJson(row.approvals, undefined),
    blocking: Boolean(row.blocking),
    posted_to_github: Boolean(row.posted_to_github),
    posted_to_git_notes: Boolean(row.posted_to_git_notes),
  }
}

const mapReport = (row: any): Report | null => {
  if (!row) return null
  return {
    ...row,
    data: parseJson(row.data, undefined),
  }
}

export function createVcsModule(ctx: VcsModuleContext): VcsModule {
  const { rdb, getCurrentExecutionId } = ctx

  const vcs: VcsModule = {
    logCommit: (commit): string => {
      const currentExecutionId = getCurrentExecutionId()
      if (!currentExecutionId) throw new Error('No active execution')
      const id = uuid()
      rdb.run(
        `INSERT OR REPLACE INTO commits (id, execution_id, agent_id, vcs_type, commit_hash, change_id, message, author, files_changed, insertions, deletions, smithers_metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, currentExecutionId, commit.agent_id ?? null, commit.vcs_type, commit.commit_hash,
         commit.change_id ?? null, commit.message, commit.author ?? null,
         commit.files_changed ? JSON.stringify(commit.files_changed) : null,
         commit.insertions ?? null, commit.deletions ?? null,
         commit.smithers_metadata ? JSON.stringify(commit.smithers_metadata) : null, now()]
      )
      return id
    },

    getCommits: (limit: number = 50): Commit[] => {
      const currentExecutionId = getCurrentExecutionId()
      if (!currentExecutionId) return []
      return rdb.query<any>('SELECT * FROM commits WHERE execution_id = ? ORDER BY created_at DESC LIMIT ?', [currentExecutionId, limit])
        .map(mapCommit)
        .filter((c): c is Commit => c !== null)
    },

    getCommit: (hash: string, vcsType?: 'git' | 'jj'): Commit | null => {
      if (vcsType) {
        return mapCommit(rdb.queryOne('SELECT * FROM commits WHERE commit_hash = ? AND vcs_type = ?', [hash, vcsType]))
      }
      return mapCommit(rdb.queryOne('SELECT * FROM commits WHERE commit_hash = ?', [hash]))
    },

    logSnapshot: (snapshot): string => {
      const currentExecutionId = getCurrentExecutionId()
      if (!currentExecutionId) throw new Error('No active execution')
      const id = uuid()
      rdb.run(
        `INSERT INTO snapshots (id, execution_id, change_id, commit_hash, description, files_modified, files_added, files_deleted, has_conflicts, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, currentExecutionId, snapshot.change_id, snapshot.commit_hash ?? null,
         snapshot.description ?? null,
         snapshot.files_modified ? JSON.stringify(snapshot.files_modified) : null,
         snapshot.files_added ? JSON.stringify(snapshot.files_added) : null,
         snapshot.files_deleted ? JSON.stringify(snapshot.files_deleted) : null,
         snapshot.has_conflicts ? 1 : 0, now()]
      )
      return id
    },

    getSnapshots: (limit: number = 50): Snapshot[] => {
      const currentExecutionId = getCurrentExecutionId()
      if (!currentExecutionId) return []
      return rdb.query<any>('SELECT * FROM snapshots WHERE execution_id = ? ORDER BY created_at DESC LIMIT ?', [currentExecutionId, limit])
        .map(mapSnapshot)
        .filter((s): s is Snapshot => s !== null)
    },

    logReview: (review): string => {
      const currentExecutionId = getCurrentExecutionId()
      if (!currentExecutionId) throw new Error('No active execution')
      const id = uuid()
      rdb.run(
        `INSERT INTO reviews (id, execution_id, agent_id, target_type, target_ref, approved, summary, issues, approvals, reviewer_model, blocking, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, currentExecutionId, review.agent_id ?? null, review.target_type,
         review.target_ref ?? null, review.approved ? 1 : 0, review.summary,
         JSON.stringify(review.issues), review.approvals ? JSON.stringify(review.approvals) : null,
         review.reviewer_model ?? null, review.blocking ? 1 : 0, now()]
      )
      return id
    },

    updateReview: (id: string, updates: { posted_to_github?: boolean; posted_to_git_notes?: boolean }) => {
      const sets: string[] = []
      const params: any[] = []
      if (updates.posted_to_github !== undefined) { sets.push('posted_to_github = ?'); params.push(updates.posted_to_github ? 1 : 0) }
      if (updates.posted_to_git_notes !== undefined) { sets.push('posted_to_git_notes = ?'); params.push(updates.posted_to_git_notes ? 1 : 0) }
      if (sets.length > 0) {
        params.push(id)
        rdb.run(`UPDATE reviews SET ${sets.join(', ')} WHERE id = ?`, params)
      }
    },

    getReviews: (limit: number = 50): Review[] => {
      const currentExecutionId = getCurrentExecutionId()
      if (!currentExecutionId) return []
      return rdb.query<any>('SELECT * FROM reviews WHERE execution_id = ? ORDER BY created_at DESC LIMIT ?', [currentExecutionId, limit])
        .map(mapReview)
        .filter((r): r is Review => r !== null)
    },

    getBlockingReviews: (): Review[] => {
      const currentExecutionId = getCurrentExecutionId()
      if (!currentExecutionId) return []
      return rdb.query<any>('SELECT * FROM reviews WHERE execution_id = ? AND blocking = 1 AND approved = 0', [currentExecutionId])
        .map(mapReview)
        .filter((r): r is Review => r !== null)
    },

    addReport: (report): string => {
      const currentExecutionId = getCurrentExecutionId()
      if (!currentExecutionId) throw new Error('No active execution')
      const id = uuid()
      rdb.run(
        `INSERT INTO reports (id, execution_id, agent_id, type, title, content, data, severity, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, currentExecutionId, report.agent_id ?? null, report.type, report.title, report.content,
         report.data ? JSON.stringify(report.data) : null, report.severity ?? 'info', now()]
      )
      return id
    },

    getReports: (type?: Report['type'], limit: number = 100): Report[] => {
      const currentExecutionId = getCurrentExecutionId()
      if (!currentExecutionId) return []
      let sql = 'SELECT * FROM reports WHERE execution_id = ?'
      const params: any[] = [currentExecutionId]
      if (type) { sql += ' AND type = ?'; params.push(type) }
      sql += ' ORDER BY created_at DESC LIMIT ?'
      params.push(limit)
      return rdb.query<any>(sql, params)
        .map(mapReport)
        .filter((r): r is Report => r !== null)
    },

    getCriticalReports: (): Report[] => {
      const currentExecutionId = getCurrentExecutionId()
      if (!currentExecutionId) return []
      return rdb.query<any>(
        "SELECT * FROM reports WHERE execution_id = ? AND severity = 'critical' ORDER BY created_at DESC",
        [currentExecutionId]
      )
        .map(mapReport)
        .filter((r): r is Report => r !== null)
    },
  }

  return vcs
}

```

## `src/db/memories.ts`

```typescript
// Memory CRUD operations module for Smithers DB

import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import type { Memory, MemoryInput } from './types.js'
import { uuid, now } from './utils.js'

export interface MemoriesModule {
  add: (memory: MemoryInput) => string
  get: (category: string, key: string, scope?: string) => Memory | null
  list: (category?: string, scope?: string, limit?: number) => Memory[]
  search: (query: string, category?: string, limit?: number) => Memory[]
  update: (id: string, updates: Partial<Pick<Memory, 'content' | 'confidence' | 'expires_at'>>) => void
  delete: (id: string) => void
  addFact: (key: string, content: string, source?: string) => string
  addLearning: (key: string, content: string, source?: string) => string
  addPreference: (key: string, content: string, scope?: 'global' | 'project' | 'session') => string
  stats: () => { total: number; byCategory: Record<string, number>; byScope: Record<string, number> }
}

export interface MemoriesModuleContext {
  rdb: ReactiveDatabase
  getCurrentExecutionId: () => string | null
}

export function createMemoriesModule(ctx: MemoriesModuleContext): MemoriesModule {
  const { rdb, getCurrentExecutionId } = ctx

  const memories: MemoriesModule = {
    add: (memory: MemoryInput): string => {
      const id = uuid()
      rdb.run(
        `INSERT INTO memories (id, category, scope, key, content, confidence, source, source_execution_id, created_at, updated_at, accessed_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, memory.category, memory.scope ?? 'global', memory.key, memory.content,
         memory.confidence ?? 1.0, memory.source ?? null, getCurrentExecutionId(),
         now(), now(), now(), memory.expires_at?.toISOString() ?? null]
      )
      return id
    },

    get: (category: string, key: string, scope?: string): Memory | null => {
      const row = rdb.queryOne<Memory>(
        `SELECT * FROM memories WHERE category = ? AND key = ? AND (scope = ? OR ? IS NULL)`,
        [category, key, scope ?? null, scope ?? null]
      )
      if (row) {
        rdb.run('UPDATE memories SET accessed_at = ? WHERE id = ?', [now(), row.id])
      }
      return row
    },

    list: (category?: string, scope?: string, limit: number = 100): Memory[] => {
      let sql = 'SELECT * FROM memories WHERE 1=1'
      const params: any[] = []
      if (category) { sql += ' AND category = ?'; params.push(category) }
      if (scope) { sql += ' AND scope = ?'; params.push(scope) }
      sql += ' ORDER BY created_at DESC LIMIT ?'
      params.push(limit)
      return rdb.query<Memory>(sql, params)
    },

    search: (query: string, category?: string, limit: number = 20): Memory[] => {
      let sql = 'SELECT * FROM memories WHERE content LIKE ?'
      const params: any[] = [`%${query}%`]
      if (category) { sql += ' AND category = ?'; params.push(category) }
      sql += ' ORDER BY created_at DESC LIMIT ?'
      params.push(limit)
      return rdb.query<Memory>(sql, params)
    },

    update: (id: string, updates: any) => {
      const sets: string[] = ['updated_at = ?']
      const params: any[] = [now()]
      if (updates.content !== undefined) { sets.push('content = ?'); params.push(updates.content) }
      if (updates.confidence !== undefined) { sets.push('confidence = ?'); params.push(updates.confidence) }
      if (updates.expires_at !== undefined) { sets.push('expires_at = ?'); params.push(updates.expires_at?.toISOString() ?? null) }
      params.push(id)
      rdb.run(`UPDATE memories SET ${sets.join(', ')} WHERE id = ?`, params)
    },

    delete: (id: string) => {
      rdb.run('DELETE FROM memories WHERE id = ?', [id])
    },

    addFact: (key: string, content: string, source?: string): string => {
      return memories.add({ category: 'fact', key, content, ...(source ? { source } : {}) })
    },

    addLearning: (key: string, content: string, source?: string): string => {
      return memories.add({ category: 'learning', key, content, ...(source ? { source } : {}) })
    },

    addPreference: (key: string, content: string, scope?: 'global' | 'project' | 'session'): string => {
      return memories.add({ category: 'preference', key, content, ...(scope ? { scope } : {}) })
    },

    stats: () => {
      const total = rdb.queryValue<number>('SELECT COUNT(*) FROM memories') ?? 0
      const byCategory: Record<string, number> = {}
      const byCategoryRows = rdb.query<{ category: string; count: number }>(
        'SELECT category, COUNT(*) as count FROM memories GROUP BY category'
      )
      for (const row of byCategoryRows) byCategory[row.category] = row.count

      const byScope: Record<string, number> = {}
      const byScopeRows = rdb.query<{ scope: string; count: number }>(
        'SELECT scope, COUNT(*) as count FROM memories GROUP BY scope'
      )
      for (const row of byScopeRows) byScope[row.scope] = row.count

      return { total, byCategory, byScope }
    },
  }

  return memories
}

```

## `src/db/schema.sql`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/db/artifacts.ts`

```typescript
// Artifact tracking module for Smithers DB

import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import type { Artifact } from './types.js'
import { uuid, now, parseJson } from './utils.js'

export interface ArtifactsModule {
  add: (name: string, type: Artifact['type'], filePath: string, agentId?: string, metadata?: Record<string, any>) => string
  list: (executionId: string) => Artifact[]
}

export interface ArtifactsModuleContext {
  rdb: ReactiveDatabase
  getCurrentExecutionId: () => string | null
}

// Helper to map row to typed object with JSON parsing
const mapArtifact = (row: any): Artifact | null => {
  if (!row) return null
  return {
    ...row,
    metadata: parseJson(row.metadata, {}),
  }
}

export function createArtifactsModule(ctx: ArtifactsModuleContext): ArtifactsModule {
  const { rdb, getCurrentExecutionId } = ctx

  const artifacts: ArtifactsModule = {
    add: (name: string, type: Artifact['type'], filePath: string, agentId?: string, metadata?: Record<string, any>): string => {
      const currentExecutionId = getCurrentExecutionId()
      if (!currentExecutionId) throw new Error('No active execution')
      const id = uuid()
      rdb.run(
        `INSERT INTO artifacts (id, execution_id, agent_id, name, type, file_path, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, currentExecutionId, agentId ?? null, name, type, filePath, JSON.stringify(metadata ?? {}), now()]
      )
      return id
    },

    list: (executionId: string): Artifact[] => {
      return rdb.query<any>('SELECT * FROM artifacts WHERE execution_id = ? ORDER BY created_at', [executionId])
        .map(mapArtifact)
        .filter((a): a is Artifact => a !== null)
    },
  }

  return artifacts
}

```

## `src/db/agents.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/db/state.ts`

```typescript
// State management module for Smithers DB

import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import { uuid, now, parseJson } from './utils.js'

export interface StateModule {
  get: <T>(key: string) => T | null
  set: <T>(key: string, value: T, trigger?: string) => void
  setMany: (updates: Record<string, any>, trigger?: string) => void
  getAll: () => Record<string, any>
  reset: () => void
  history: (key?: string, limit?: number) => any[]
}

export interface StateModuleContext {
  rdb: ReactiveDatabase
  getCurrentExecutionId: () => string | null
}

export function createStateModule(ctx: StateModuleContext): StateModule {
  const { rdb, getCurrentExecutionId } = ctx

  const state: StateModule = {
    get: <T>(key: string): T | null => {
      const row = rdb.queryOne<{ value: string }>('SELECT value FROM state WHERE key = ?', [key])
      return row ? parseJson<T>(row.value, null as T) : null
    },

    set: <T>(key: string, value: T, trigger?: string) => {
      const oldValue = state.get(key)
      const jsonValue = JSON.stringify(value)
      rdb.run(
        'INSERT INTO state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?',
        [key, jsonValue, now(), jsonValue, now()]
      )
      // Log transition
      const currentExecutionId = getCurrentExecutionId()
      if (currentExecutionId) {
        rdb.run(
          'INSERT INTO transitions (id, execution_id, key, old_value, new_value, trigger, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [uuid(), currentExecutionId, key, JSON.stringify(oldValue), jsonValue, trigger ?? null, now()]
        )
      }
    },

    setMany: (updates: Record<string, any>, trigger?: string) => {
      for (const [key, value] of Object.entries(updates)) {
        state.set(key, value, trigger)
      }
    },

    getAll: (): Record<string, any> => {
      const rows = rdb.query<{ key: string; value: string }>('SELECT key, value FROM state')
      const result: Record<string, any> = {}
      for (const row of rows) {
        result[row.key] = parseJson(row.value, null)
      }
      return result
    },

    reset: () => {
      rdb.run('DELETE FROM state')
      rdb.run("INSERT INTO state (key, value) VALUES ('phase', '\"initial\"'), ('iteration', '0'), ('data', 'null')")
    },

    history: (key?: string, limit: number = 100): any[] => {
      if (key) {
        return rdb.query(
          'SELECT * FROM transitions WHERE key = ? ORDER BY created_at DESC LIMIT ?',
          [key, limit]
        )
      }
      return rdb.query(
        'SELECT * FROM transitions ORDER BY created_at DESC LIMIT ?',
        [limit]
      )
    },
  }

  return state
}

```

## `src/components/ClaudeApi.tsx`

```typescript
import type { ReactNode } from 'react'

export interface ClaudeApiProps {
  children?: ReactNode
  model?: string
  maxTurns?: number
  tools?: string[]
  systemPrompt?: string
  onFinished?: (result: unknown) => void
  onError?: (error: Error) => void
  [key: string]: unknown
}

/**
 * ClaudeApi component - alternative executor using the Anthropic API directly.
 *
 * Unlike the standard Claude component which uses Claude Code CLI,
 * ClaudeApi uses the Anthropic SDK directly for API calls.
 *
 * @example
 * ```tsx
 * <ClaudeApi model="claude-sonnet-4">
 *   Generate a haiku about programming
 * </ClaudeApi>
 * ```
 */
export function ClaudeApi(props: ClaudeApiProps): ReactNode {
  return (
    <claude-api model={props.model}>
      {props.children}
    </claude-api>
  )
}

```

## `src/components/Ralph.test.tsx`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/components/Phase.tsx`

```typescript
// Phase component with automatic SQLite-backed state management
// Phases are always rendered in output, but only active phase renders children

import { useState, useRef, useEffect, type ReactNode } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { usePhaseRegistry, usePhaseIndex } from './PhaseRegistry.js'
import { StepRegistryProvider } from './Step.js'
import { useMount } from '../reconciler/hooks.js'

export interface PhaseProps {
  /**
   * Phase name (must be unique within the orchestration)
   */
  name: string

  /**
   * Children components - only rendered when phase is active
   */
  children: ReactNode

  /**
   * Skip this phase if condition returns true.
   * Takes precedence over automatic state management.
   */
  skipIf?: () => boolean

  /**
   * Callback when phase starts (becomes active)
   */
  onStart?: () => void

  /**
   * Callback when phase completes
   */
  onComplete?: () => void
}

/**
 * Phase component with automatic state management
 *
 * All phases are always rendered in the plan output (visible structure),
 * but only the active phase renders its children (executes work).
 *
 * Phases execute sequentially by default - when one completes, the next begins.
 *
 * @example
 * ```tsx
 * <Ralph maxIterations={3}>
 *   <Phase name="Research">
 *     <Claude>Research best practices...</Claude>
 *   </Phase>
 *   <Phase name="Implementation">
 *     <Claude>Implement the solution...</Claude>
 *   </Phase>
 *   <Phase name="Review">
 *     <Claude>Review the implementation...</Claude>
 *   </Phase>
 * </Ralph>
 * ```
 */
export function Phase(props: PhaseProps): ReactNode {
  const { db, ralphCount } = useSmithers()
  const registry = usePhaseRegistry()
  const myIndex = usePhaseIndex(props.name)

  const [, setPhaseId] = useState<string | null>(null)
  const phaseIdRef = useRef<string | null>(null)
  const hasStartedRef = useRef(false)
  const hasCompletedRef = useRef(false)

  // Track previous active state to detect completion
  const wasActiveRef = useRef(false)

  // Determine phase status
  const isSkipped = props.skipIf?.() ?? false
  const isActive = !isSkipped && registry.isPhaseActive(myIndex)
  const isCompleted = !isSkipped && registry.isPhaseCompleted(myIndex)

  // Compute status string for output
  const status: 'pending' | 'active' | 'completed' | 'skipped' = isSkipped
    ? 'skipped'
    : isActive
      ? 'active'
      : isCompleted
        ? 'completed'
        : 'pending'

  // Handle skipped phases on mount
  useMount(() => {
    if (isSkipped) {
      // Log skipped phase to database
      const id = db.phases.start(props.name, ralphCount)
      db.db.run(
        `UPDATE phases SET status = 'skipped', completed_at = datetime('now') WHERE id = ?`,
        [id]
      )
      console.log(`[Phase] Skipped: ${props.name}`)

      // Advance to next phase immediately
      registry.advancePhase()
    }
  })

  // Handle phase activation - triggers when isActive changes to true
  // Using useEffect instead of useMount so it triggers when a pre-mounted
  // pending phase becomes active (not just on initial mount)
  useEffect(() => {
    if (isSkipped) return

    if (isActive && !hasStartedRef.current) {
      hasStartedRef.current = true
      wasActiveRef.current = true

      // Start phase in database
      const id = db.phases.start(props.name, ralphCount)
      setPhaseId(id)
      phaseIdRef.current = id

      console.log(`[Phase] Started: ${props.name} (iteration ${ralphCount})`)
      props.onStart?.()
    }
  }, [isActive, isSkipped, props.name, ralphCount, db, props.onStart])

  // Handle phase completion - triggers when isActive changes from true to false
  // Using useEffect instead of useUnmount because Phase components stay mounted
  // (they always render in output), so we detect completion via state change
  useEffect(() => {
    // Detect transition from active to completed (wasActive && !isActive && isCompleted)
    if (wasActiveRef.current && !isActive && isCompleted) {
      const id = phaseIdRef.current
      if (id && !hasCompletedRef.current && hasStartedRef.current) {
        hasCompletedRef.current = true

        db.phases.complete(id)
        console.log(`[Phase] Completed: ${props.name}`)

        props.onComplete?.()
      }
    }
  }, [isActive, isCompleted, db, props.name, props.onComplete])

  // Always render the phase element (visible in plan output)
  // Only render children when active (executes work)
  // Wrap children in StepRegistryProvider to enforce sequential step execution
  return (
    <phase name={props.name} status={status}>
      {isActive && (
        <StepRegistryProvider phaseId={props.name}>
          {props.children}
        </StepRegistryProvider>
      )}
    </phase>
  )
}

```

## `src/components/Step.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/components/SmithersProvider.tsx`

```typescript
// SmithersProvider - Unified context provider for Smithers orchestration
// Consolidates SmithersProvider, RalphContext, and DatabaseProvider into one
// Gives all child components access to database, executionId, Ralph loop, and global controls

import { createContext, useContext, useState, useMemo, useEffect, useRef, type ReactNode } from 'react'
import type { SmithersDB } from '../db/index.js'
import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import { DatabaseProvider } from '../reactive-sqlite/hooks/context.js'
import { useQueryValue } from '../reactive-sqlite/index.js'
import { PhaseRegistryProvider } from './PhaseRegistry.js'

// ============================================================================
// GLOBAL STORE (for universal renderer compatibility)
// ============================================================================

// Module-level store for context value - used as fallback when
// React's Context API doesn't work in universal renderer mode
let globalSmithersContext: SmithersContextValue | null = null

// ============================================================================
// ORCHESTRATION COMPLETION SIGNALS
// ============================================================================

// Global completion tracking for the root to await
let _orchestrationResolve: (() => void) | null = null
let _orchestrationReject: ((err: Error) => void) | null = null

/**
 * Create a promise that resolves when orchestration completes.
 * Called by createSmithersRoot before mounting.
 */
export function createOrchestrationPromise(): Promise<void> {
  return new Promise((resolve, reject) => {
    _orchestrationResolve = resolve
    _orchestrationReject = reject
  })
}

/**
 * Signal that orchestration is complete (called internally)
 */
export function signalOrchestrationComplete(): void {
  if (_orchestrationResolve) {
    _orchestrationResolve()
    _orchestrationResolve = null
    _orchestrationReject = null
  }
}

/**
 * Signal that orchestration failed (called internally)
 */
export function signalOrchestrationError(err: Error): void {
  if (_orchestrationReject) {
    _orchestrationReject(err)
    _orchestrationResolve = null
    _orchestrationReject = null
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface SmithersConfig {
  /**
   * Maximum number of iterations for Ralph loops
   */
  maxIterations?: number

  /**
   * Default model to use for agents
   */
  defaultModel?: string

  /**
   * Global timeout in milliseconds
   */
  globalTimeout?: number

  /**
   * Enable verbose logging
   */
  verbose?: boolean

  /**
   * Additional configuration
   */
  [key: string]: any
}

/**
 * Ralph context type for backwards compatibility
 * @deprecated Use db.tasks.start() and db.tasks.complete() instead
 */
export interface RalphContextType {
  /** @deprecated Use db.tasks.start() instead */
  registerTask: () => void
  /** @deprecated Use db.tasks.complete() instead */
  completeTask: () => void
  ralphCount: number
  db: ReactiveDatabase | null
}

export interface SmithersContextValue {
  /**
   * Database instance (SmithersDB wrapper)
   */
  db: SmithersDB

  /**
   * Current execution ID
   */
  executionId: string

  /**
   * Configuration
   */
  config: SmithersConfig

  /**
   * Request orchestration stop
   */
  requestStop: (reason: string) => void

  /**
   * Request rebase operation
   */
  requestRebase: (reason: string) => void

  /**
   * Check if stop has been requested
   */
  isStopRequested: () => boolean

  /**
   * Check if rebase has been requested
   */
  isRebaseRequested: () => boolean

  // ---- Ralph loop fields ----

  /**
   * @deprecated Use db.tasks.start() instead. This is a no-op.
   */
  registerTask: () => void

  /**
   * @deprecated Use db.tasks.complete() instead. This is a no-op.
   */
  completeTask: () => void

  /**
   * Current Ralph iteration count
   */
  ralphCount: number

  /**
   * Raw ReactiveDatabase instance (for useQuery hooks)
   */
  reactiveDb: ReactiveDatabase
}

// ============================================================================
// CONTEXT
// ============================================================================

const SmithersContext = createContext<SmithersContextValue | undefined>(undefined)

/**
 * Hook to access Smithers context
 *
 * Uses React's Context API, but falls back to module-level store
 * for universal renderer compatibility where context propagation
 * may not work as expected.
 */
export function useSmithers() {
  // Try React's Context first
  const ctx = useContext(SmithersContext)
  if (ctx) {
    return ctx
  }

  // Fall back to global store for universal renderer
  if (globalSmithersContext) {
    return globalSmithersContext
  }

  throw new Error('useSmithers must be used within SmithersProvider')
}

// ============================================================================
// PROVIDER
// ============================================================================

export interface SmithersProviderProps {
  /**
   * Database instance
   */
  db: SmithersDB

  /**
   * Execution ID from db.execution.start()
   */
  executionId: string

  /**
   * Optional configuration
   */
  config?: SmithersConfig

  /**
   * Maximum number of Ralph iterations (default: 100)
   */
  maxIterations?: number

  /**
   * Callback fired on each Ralph iteration
   */
  onIteration?: (iteration: number) => void

  /**
   * Callback fired when orchestration completes
   */
  onComplete?: () => void

  /**
   * Children components
   */
  children: ReactNode
}

/**
 * SmithersProvider - Unified root context provider
 *
 * Consolidates SmithersProvider, RalphContext, and DatabaseProvider into one.
 * Task tracking is now fully database-backed via the tasks table.
 *
 * Usage:
 * ```tsx
 * const db = await createSmithersDB({ path: '.smithers/data' })
 * const executionId = await db.execution.start('My Orchestration', './main.tsx')
 *
 * <SmithersProvider db={db} executionId={executionId} maxIterations={10}>
 *   <Orchestration>
 *     <Claude>Do something</Claude>
 *   </Orchestration>
 * </SmithersProvider>
 * ```
 */
export function SmithersProvider(props: SmithersProviderProps): ReactNode {
  // Global stop/rebase signals
  const [stopRequested, setStopRequested] = useState(false)
  const [rebaseRequested, setRebaseRequested] = useState(false)

  const maxIterations = props.maxIterations ?? props.config?.maxIterations ?? 100
  const reactiveDb = props.db.db

  // Read ralphCount from database reactively
  const { data: dbRalphCount } = useQueryValue<number>(
    reactiveDb,
    "SELECT CAST(value AS INTEGER) as count FROM state WHERE key = 'ralphCount'"
  )

  // Local state fallback when DB query returns null
  const [localRalphCount, setLocalRalphCount] = useState(0)

  // Use DB value if available, otherwise local state
  const ralphCount = dbRalphCount ?? localRalphCount

  // Read running task count from database reactively
  const { data: runningTaskCount } = useQueryValue<number>(
    reactiveDb,
    `SELECT COUNT(*) as count FROM tasks WHERE execution_id = ? AND iteration = ? AND status = 'running'`,
    [props.executionId, ralphCount]
  )

  // Read total task count for this iteration (to know if tasks have started)
  const { data: totalTaskCount } = useQueryValue<number>(
    reactiveDb,
    `SELECT COUNT(*) as count FROM tasks WHERE execution_id = ? AND iteration = ?`,
    [props.executionId, ralphCount]
  )

  // Derive state from DB queries
  const pendingTasks = runningTaskCount ?? 0
  const hasStartedTasks = (totalTaskCount ?? 0) > 0

  // Track if we've already completed to avoid double-completion
  const hasCompletedRef = useRef(false)

  // Initialize ralphCount in DB if needed
  useEffect(() => {
    if (dbRalphCount === null) {
      reactiveDb.run(
        "INSERT OR IGNORE INTO state (key, value, updated_at) VALUES ('ralphCount', '0', datetime('now'))"
      )
    }
  }, [reactiveDb, dbRalphCount])

  // Increment ralphCount in DB
  const incrementRalphCount = useMemo(() => () => {
    const nextCount = ralphCount + 1
    reactiveDb.run(
      "UPDATE state SET value = ?, updated_at = datetime('now') WHERE key = 'ralphCount'",
      [String(nextCount)]
    )
    setLocalRalphCount(nextCount)
    return nextCount
  }, [reactiveDb, ralphCount])

  // Deprecated no-op functions for backwards compatibility
  const registerTask = useMemo(() => () => {
    console.warn('[SmithersProvider] registerTask is deprecated. Use db.tasks.start() instead.')
  }, [])

  const completeTask = useMemo(() => () => {
    console.warn('[SmithersProvider] completeTask is deprecated. Use db.tasks.complete() instead.')
  }, [])

  // Ralph iteration monitoring effect - now uses DB-backed state
  useEffect(() => {
    console.log('[SmithersProvider] Ralph effect fired! ralphCount:', ralphCount, 'pendingTasks:', pendingTasks, 'hasStartedTasks:', hasStartedTasks)

    let checkInterval: NodeJS.Timeout | null = null
    let stableCount = 0 // Count consecutive stable checks (no tasks running)

    checkInterval = setInterval(() => {
      // Re-check values from database (reactive queries will have updated)
      const currentPendingTasks = pendingTasks
      const currentHasStartedTasks = hasStartedTasks

      // If tasks are running, reset stable counter
      if (currentPendingTasks > 0) {
        stableCount = 0
        return
      }

      // If no tasks have ever started and we've waited a bit, complete
      if (!currentHasStartedTasks) {
        stableCount++
        // Wait 500ms (50 checks) before declaring no work to do
        if (stableCount > 50 && !hasCompletedRef.current) {
          hasCompletedRef.current = true
          if (checkInterval) clearInterval(checkInterval)
          signalOrchestrationComplete()
          props.onComplete?.()
        }
        return
      }

      // Tasks have completed - check if we should continue or finish
      stableCount++

      // Wait at least 100ms (10 checks) for any new tasks to register
      if (stableCount < 10) {
        return
      }

      // All tasks complete
      if (ralphCount >= maxIterations - 1) {
        // Max iterations reached
        if (!hasCompletedRef.current) {
          hasCompletedRef.current = true
          if (checkInterval) clearInterval(checkInterval)
          signalOrchestrationComplete()
          props.onComplete?.()
        }
        return
      }

      // Trigger next iteration by incrementing ralphCount
      const nextIteration = incrementRalphCount()
      stableCount = 0

      if (props.onIteration) {
        props.onIteration(nextIteration)
      }
    }, 10) // Check every 10ms

    // Cleanup on unmount
    return () => {
      if (checkInterval) clearInterval(checkInterval)
    }
  }, [pendingTasks, hasStartedTasks, ralphCount, maxIterations, props, incrementRalphCount])

  const value: SmithersContextValue = useMemo(() => ({
    db: props.db,
    executionId: props.executionId,
    config: props.config ?? {},

    requestStop: (reason: string) => {
      setStopRequested(true)

      // Log to database state
      props.db.state.set('stop_requested', {
        reason,
        timestamp: Date.now(),
        executionId: props.executionId,
      })

      console.log(`[Smithers] Stop requested: ${reason}`)
    },

    requestRebase: (reason: string) => {
      setRebaseRequested(true)

      // Log to database state
      props.db.state.set('rebase_requested', {
        reason,
        timestamp: Date.now(),
        executionId: props.executionId,
      })

      console.log(`[Smithers] Rebase requested: ${reason}`)
    },

    isStopRequested: () => stopRequested,
    isRebaseRequested: () => rebaseRequested,

    // Ralph fields (registerTask/completeTask are deprecated no-ops)
    registerTask,
    completeTask,
    ralphCount,
    reactiveDb,
  }), [props.db, props.executionId, props.config, stopRequested, rebaseRequested, registerTask, completeTask, ralphCount, reactiveDb])

  // Set global store BEFORE any children are evaluated
  // This is critical for universal renderer compatibility where
  // React's Context API may not propagate properly
  globalSmithersContext = value

  return (
    <SmithersContext.Provider value={value}>
      <DatabaseProvider db={reactiveDb}>
        <PhaseRegistryProvider>
          {props.children}
        </PhaseRegistryProvider>
      </DatabaseProvider>
    </SmithersContext.Provider>
  )
}

/**
 * Hook for backwards-compatible Ralph context access
 * Returns the same interface as the original RalphContext
 * @deprecated Use useSmithers() and db.tasks instead
 */
export function useRalph(): RalphContextType {
  const ctx = useSmithers()
  return {
    registerTask: ctx.registerTask,
    completeTask: ctx.completeTask,
    ralphCount: ctx.ralphCount,
    db: ctx.reactiveDb,
  }
}

```

## `src/components/PhaseRegistry.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/components/Orchestration.tsx`

```typescript
// Orchestration - Top-level orchestration component
// Handles global timeouts, stop conditions, CI/CD integration, and cleanup

import { useRef, type ReactNode } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { jjSnapshot } from '../utils/vcs.js'
import { useMount, useUnmount } from '../reconciler/hooks.js'

// ============================================================================
// TYPES
// ============================================================================

export interface GlobalStopCondition {
  type: 'total_tokens' | 'total_agents' | 'total_time' | 'report_severity' | 'ci_failure' | 'custom'
  value?: number | string
  fn?: (context: OrchestrationContext) => boolean | Promise<boolean>
  message?: string
}

export interface OrchestrationContext {
  executionId: string
  totalTokens: number
  totalAgents: number
  totalToolCalls: number
  elapsedTimeMs: number
}

export interface OrchestrationResult {
  executionId: string
  status: 'completed' | 'stopped' | 'failed' | 'cancelled'
  totalAgents: number
  totalToolCalls: number
  totalTokens: number
  durationMs: number
}

export interface OrchestrationProps {
  /**
   * Children components
   */
  children: ReactNode

  /**
   * Global timeout in milliseconds
   */
  globalTimeout?: number

  /**
   * Global stop conditions
   */
  stopConditions?: GlobalStopCondition[]

  /**
   * Create JJ snapshot before starting
   */
  snapshotBeforeStart?: boolean

  /**
   * Callback when orchestration completes
   */
  onComplete?: (result: OrchestrationResult) => void

  /**
   * Callback when an error occurs
   */
  onError?: (error: Error) => void

  /**
   * Callback when stop is requested
   */
  onStopRequested?: (reason: string) => void

  /**
   * Cleanup on complete (close DB, etc.)
   */
  cleanupOnComplete?: boolean
}

/**
 * Orchestration component
 *
 * Usage:
 * ```tsx
 * <Orchestration
 *   globalTimeout={1800000}
 *   snapshotBeforeStart
 *   stopConditions={[
 *     { type: 'total_tokens', value: 500000, message: 'Token budget exceeded' }
 *   ]}
 * >
 *   <Ralph maxIterations={10}>
 *     ...
 *   </Ralph>
 * </Orchestration>
 * ```
 */
export function Orchestration(props: OrchestrationProps): ReactNode {
  const { db, executionId, requestStop, isStopRequested } = useSmithers()

  const startTimeRef = useRef(Date.now())
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const checkIntervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useMount(() => {
    const startTime = startTimeRef.current

    ;(async () => {
      try {
        // Create snapshot if requested
        if (props.snapshotBeforeStart) {
          try {
            const { changeId, description } = await jjSnapshot('Before orchestration start')
            await db.vcs.logSnapshot({
              change_id: changeId,
              description,
            })
            console.log(`[Orchestration] Created initial snapshot: ${changeId}`)
          } catch (error) {
            // JJ might not be available, that's okay
            console.warn('[Orchestration] Could not create JJ snapshot:', error)
          }
        }

        // Set up global timeout
        if (props.globalTimeout) {
          timeoutIdRef.current = setTimeout(() => {
            if (!isStopRequested()) {
              const message = `Global timeout of ${props.globalTimeout}ms exceeded`
              requestStop(message)
              props.onStopRequested?.(message)
            }
          }, props.globalTimeout)
        }

        // Set up stop condition checking
        if (props.stopConditions && props.stopConditions.length > 0) {
          checkIntervalIdRef.current = setInterval(async () => {
            if (isStopRequested()) {
              if (checkIntervalIdRef.current) clearInterval(checkIntervalIdRef.current)
              return
            }

            const execution = await db.execution.current()
            if (!execution) return

            const context: OrchestrationContext = {
              executionId,
              totalTokens: execution.total_tokens_used,
              totalAgents: execution.total_agents,
              totalToolCalls: execution.total_tool_calls,
              elapsedTimeMs: Date.now() - startTime,
            }

            for (const condition of props.stopConditions!) {
              let shouldStop = false
              let message = condition.message ?? 'Stop condition met'

              switch (condition.type) {
                case 'total_tokens':
                  shouldStop = context.totalTokens >= (condition.value as number)
                  message = message || `Token limit ${condition.value} exceeded`
                  break

                case 'total_agents':
                  shouldStop = context.totalAgents >= (condition.value as number)
                  message = message || `Agent limit ${condition.value} exceeded`
                  break

                case 'total_time':
                  shouldStop = context.elapsedTimeMs >= (condition.value as number)
                  message = message || `Time limit ${condition.value}ms exceeded`
                  break

                case 'report_severity':
                  const criticalReports = await db.vcs.getCriticalReports()
                  shouldStop = criticalReports.length > 0
                  message = message || `Critical report(s) found: ${criticalReports.length}`
                  break

                case 'custom':
                  if (condition.fn) {
                    shouldStop = await condition.fn(context)
                  }
                  break
              }

              if (shouldStop) {
                console.log(`[Orchestration] Stop condition met: ${message}`)
                requestStop(message)
                props.onStopRequested?.(message)

                if (checkIntervalIdRef.current) clearInterval(checkIntervalIdRef.current)
                break
              }
            }
          }, 1000) // Check every second
        }
      } catch (error) {
        console.error('[Orchestration] Setup error:', error)
        props.onError?.(error as Error)
      }
    })()
  })

  useUnmount(() => {
    // Clear timers
    if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current)
    if (checkIntervalIdRef.current) clearInterval(checkIntervalIdRef.current)

    // Generate completion result
    ;(async () => {
      try {
        const execution = await db.execution.current()
        if (!execution) return

        const result: OrchestrationResult = {
          executionId,
          status: isStopRequested() ? 'stopped' : 'completed',
          totalAgents: execution.total_agents,
          totalToolCalls: execution.total_tool_calls,
          totalTokens: execution.total_tokens_used,
          durationMs: Date.now() - startTimeRef.current,
        }

        props.onComplete?.(result)

        // Cleanup if requested
        if (props.cleanupOnComplete) {
          await db.close()
        }
      } catch (error) {
        console.error('[Orchestration] Cleanup error:', error)
        props.onError?.(error as Error)
      }
    })()
  })

  return <orchestration execution-id={executionId}>{props.children}</orchestration>
}

```

## `src/components/index.ts`

```typescript
/**
 * JSX components for Smithers
 */

// Core agent components
export { Claude, type ClaudeProps, type AgentResult, executeClaudeCLI } from './Claude.js'
export { ClaudeApi, type ClaudeApiProps } from './ClaudeApi.js'

// Ralph - Loop controller (backwards compatibility)
export { Ralph, type RalphProps, RalphContext } from './Ralph.js'

// Phase and Step - Workflow structure
export { Phase, type PhaseProps } from './Phase.js'
export { Step, type StepProps } from './Step.js'

// Parallel execution wrapper
export { Parallel, type ParallelProps } from './Parallel.js'

// Phase registry for automatic phase state management
export {
  PhaseRegistryProvider,
  usePhaseRegistry,
  usePhaseIndex,
  type PhaseRegistryContextValue,
  type PhaseRegistryProviderProps
} from './PhaseRegistry.js'

// Step registry for sequential step execution within phases
export {
  StepRegistryProvider,
  useStepRegistry,
  useStepIndex,
  type StepRegistryProviderProps
} from './Step.js'

// Basic workflow components
export { Stop, type StopProps } from './Stop.js'
export { Subagent, type SubagentProps } from './Subagent.js'
export { Persona, type PersonaProps } from './Persona.js'
export { Constraints, type ConstraintsProps } from './Constraints.js'
export { Task, type TaskProps } from './Task.js'
export { Human, type HumanProps } from './Human.js'

// Smithers Provider and Orchestration (database-integrated)
export {
  SmithersProvider,
  useSmithers,
  useRalph,
  createOrchestrationPromise,
  signalOrchestrationComplete,
  signalOrchestrationError,
} from './SmithersProvider.js'
export type { SmithersConfig, SmithersContextValue, SmithersProviderProps, RalphContextType } from './SmithersProvider.js'

export { Orchestration } from './Orchestration.js'
export type { OrchestrationProps, GlobalStopCondition, OrchestrationContext, OrchestrationResult } from './Orchestration.js'

// Smithers subagent component
export { Smithers, executeSmithers } from './Smithers.js'
export type { SmithersProps, SmithersResult } from './Smithers.js'

// Agent types
export * from './agents/types.js'

// Git VCS components
export * from './Git/index.js'

// MCP Tool components
export * from './MCP/index.js'

// Review component
export { Review, type ReviewProps, type ReviewTarget, type ReviewResult, type ReviewIssue } from './Review.js'

```

## `src/components/Ralph.tsx`

```typescript
import { createContext, type ReactNode } from 'react'
import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import { useSmithers, type RalphContextType } from './SmithersProvider.js'
import { PhaseRegistryProvider } from './PhaseRegistry.js'

// Re-export RalphContextType for backwards compatibility
export type { RalphContextType } from './SmithersProvider.js'

/**
 * Ralph context - DEPRECATED
 *
 * Use useSmithers() and db.tasks.start()/complete() instead:
 *
 * Before:
 * ```tsx
 * const ralph = useContext(RalphContext)
 * ralph?.registerTask()
 * // ... do work ...
 * ralph?.completeTask()
 * ```
 *
 * After:
 * ```tsx
 * const { db } = useSmithers()
 * const taskId = db.tasks.start('component-type', 'component-name')
 * try {
 *   // ... do work ...
 * } finally {
 *   db.tasks.complete(taskId)
 * }
 * ```
 *
 * For ralphCount, use useRalphCount() hook instead.
 *
 * @deprecated Use useSmithers() and db.tasks instead
 */
export const RalphContext = createContext<RalphContextType | undefined>(undefined)

// Re-export orchestration signals from SmithersProvider
export {
  createOrchestrationPromise,
  signalOrchestrationComplete,
  signalOrchestrationError,
} from './SmithersProvider.js'

export interface RalphProps {
  maxIterations?: number
  onIteration?: (iteration: number) => void
  onComplete?: () => void
  children?: ReactNode
  /**
   * @deprecated Database is now provided via SmithersProvider
   */
  db?: ReactiveDatabase
}

/**
 * Ralph component - DEPRECATED backwards compatibility wrapper
 *
 * The Ralph loop is now managed by SmithersProvider directly, and task
 * tracking is now database-backed via the tasks table.
 *
 * This component exists for:
 * 1. Backwards compatibility with existing code using <Ralph>
 * 2. Providing RalphContext for components using useContext(RalphContext)
 * 3. Rendering the <ralph> custom element for XML serialization
 *
 * New code should use SmithersProvider directly without Ralph:
 * ```tsx
 * <SmithersProvider db={db} executionId={id} maxIterations={10}>
 *   <Orchestration>
 *     <Claude>...</Claude>
 *   </Orchestration>
 * </SmithersProvider>
 * ```
 *
 * Task tracking in components should use db.tasks:
 * ```tsx
 * const { db } = useSmithers()
 * const ralphCount = useRalphCount()
 * const taskId = db.tasks.start('component-type')
 * try { ... } finally { db.tasks.complete(taskId) }
 * ```
 *
 * @deprecated Use SmithersProvider directly with db.tasks for task tracking
 */
export function Ralph(props: RalphProps): ReactNode {
  // Get context from SmithersProvider
  const smithers = useSmithers()

  // Build RalphContext value from SmithersProvider
  // Note: registerTask/completeTask are deprecated no-ops
  const contextValue: RalphContextType = {
    registerTask: smithers.registerTask,
    completeTask: smithers.completeTask,
    ralphCount: smithers.ralphCount,
    db: smithers.reactiveDb,
  }

  // Note: maxIterations, onIteration, onComplete from props are ignored here
  // since they should be passed to SmithersProvider instead.
  // This component is primarily for backwards compatibility.

  return (
    <RalphContext.Provider value={contextValue}>
      <PhaseRegistryProvider>
        <ralph
          iteration={smithers.ralphCount}
          maxIterations={props.maxIterations ?? smithers.config.maxIterations ?? 100}
        >
          {props.children}
        </ralph>
      </PhaseRegistryProvider>
    </RalphContext.Provider>
  )
}

```

## `src/components/Parallel.tsx`

```typescript
// Parallel - Execute children concurrently
// When placed inside a Phase, all child Steps/Claude components execute simultaneously

import type { ReactNode } from 'react'
import { StepRegistryProvider } from './Step.js'

export interface ParallelProps {
  /**
   * Children to execute in parallel
   */
  children: ReactNode
}

/**
 * Parallel execution wrapper
 *
 * By default, Steps within a Phase execute sequentially.
 * Wrap them in Parallel to execute concurrently.
 *
 * @example
 * ```tsx
 * <Phase name="Build">
 *   <Parallel>
 *     <Step name="Frontend"><Claude>Build frontend...</Claude></Step>
 *     <Step name="Backend"><Claude>Build backend...</Claude></Step>
 *   </Parallel>
 * </Phase>
 * ```
 */
export function Parallel(props: ParallelProps): ReactNode {
  // Wrap children in StepRegistryProvider with isParallel to enable concurrent execution
  // The <parallel> intrinsic element marks this in the output tree
  return (
    <parallel>
      <StepRegistryProvider isParallel>
        {props.children}
      </StepRegistryProvider>
    </parallel>
  )
}

```

## `src/components/SmithersProvider.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/components/components.test.tsx`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/components/Human.tsx`

```typescript
import type { ReactNode } from 'react'

export interface HumanProps {
  message?: string
  onApprove?: () => void
  onReject?: () => void
  children?: ReactNode
  [key: string]: unknown
}

/**
 * Human component - pauses execution for human interaction.
 *
 * When the execution loop encounters a Human node, it pauses
 * and waits for human approval/rejection before continuing.
 *
 * @example
 * ```tsx
 * <Human
 *   message="Approve deployment?"
 *   onApprove={() => setApproved(true)}
 *   onReject={() => setRejected(true)}
 * >
 *   About to deploy to production
 * </Human>
 * ```
 */
export function Human(props: HumanProps): ReactNode {
  return (
    <human message={props.message}>
      {props.children}
    </human>
  )
}

```

## `src/components/PhaseRegistry.tsx`

```typescript
// PhaseRegistry - Manages sequential phase execution via SQLite state

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { useQueryValue } from '../reactive-sqlite/index.js'
import { useMount } from '../reconciler/hooks.js'

export interface PhaseRegistryContextValue {
  // Registration - returns the index assigned to this phase
  registerPhase: (name: string) => number

  // Current active phase index (from SQLite)
  currentPhaseIndex: number

  // Advance to next phase
  advancePhase: () => void

  // Check if a phase at given index is active
  isPhaseActive: (index: number) => boolean

  // Check if a phase at given index is completed
  isPhaseCompleted: (index: number) => boolean

  // Get total registered phases
  totalPhases: number
}

const PhaseRegistryContext = createContext<PhaseRegistryContextValue | undefined>(undefined)

export function usePhaseRegistry(): PhaseRegistryContextValue {
  const ctx = useContext(PhaseRegistryContext)
  if (!ctx) {
    throw new Error('usePhaseRegistry must be used within PhaseRegistryProvider')
  }
  return ctx
}

// Hook for phases to get their index during registration
export function usePhaseIndex(name: string): number {
  const registry = usePhaseRegistry()
  const [index] = useState(() => registry.registerPhase(name))
  return index
}

export interface PhaseRegistryProviderProps {
  children: ReactNode
}

export function PhaseRegistryProvider(props: PhaseRegistryProviderProps): ReactNode {
  const { db, reactiveDb } = useSmithers()

  // Track registered phases in order
  const [phases, setPhases] = useState<string[]>([])

  // Read currentPhaseIndex from SQLite reactively
  const { data: dbPhaseIndex } = useQueryValue<number>(
    reactiveDb,
    "SELECT CAST(value AS INTEGER) as idx FROM state WHERE key = 'currentPhaseIndex'"
  )

  const currentPhaseIndex = dbPhaseIndex ?? 0

  // Initialize currentPhaseIndex in DB if not present
  useMount(() => {
    db.state.set('currentPhaseIndex', 0, 'phase_registry_init')
  })

  // Register a phase and return its index
  const registerPhase = useCallback((name: string): number => {
    let index = -1
    setPhases(prev => {
      // Check if already registered
      const existingIndex = prev.indexOf(name)
      if (existingIndex >= 0) {
        index = existingIndex
        return prev
      }
      // Add new phase
      index = prev.length
      return [...prev, name]
    })
    return index >= 0 ? index : phases.length
  }, [phases.length])

  // Advance to next phase
  const advancePhase = useCallback(() => {
    const nextIndex = currentPhaseIndex + 1
    if (nextIndex < phases.length) {
      db.state.set('currentPhaseIndex', nextIndex, 'phase_advance')
    }
  }, [db, currentPhaseIndex, phases.length])

  // Check if phase is active
  const isPhaseActive = useCallback((index: number): boolean => {
    return index === currentPhaseIndex
  }, [currentPhaseIndex])

  // Check if phase is completed
  const isPhaseCompleted = useCallback((index: number): boolean => {
    return index < currentPhaseIndex
  }, [currentPhaseIndex])

  const value = useMemo((): PhaseRegistryContextValue => ({
    registerPhase,
    currentPhaseIndex,
    advancePhase,
    isPhaseActive,
    isPhaseCompleted,
    totalPhases: phases.length,
  }), [registerPhase, currentPhaseIndex, advancePhase, isPhaseActive, isPhaseCompleted, phases.length])

  return (
    <PhaseRegistryContext.Provider value={value}>
      {props.children}
    </PhaseRegistryContext.Provider>
  )
}

```

## `src/components/Step.tsx`

```typescript
// Step component with automatic sequential execution within phases
// Steps execute one after another unless wrapped in <Parallel>

import { createContext, useContext, useState, useRef, useCallback, useMemo, type ReactNode } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { jjSnapshot, jjCommit } from '../utils/vcs.js'
import { useMount, useUnmount } from '../reconciler/hooks.js'
import { useQueryValue } from '../reactive-sqlite/index.js'

// ============================================================================
// STEP REGISTRY CONTEXT (for sequential execution within a phase)
// ============================================================================

interface StepRegistryContextValue {
  registerStep: (name: string) => number
  currentStepIndex: number
  advanceStep: () => void
  isStepActive: (index: number) => boolean
  isStepCompleted: (index: number) => boolean
  isParallel: boolean
}

const StepRegistryContext = createContext<StepRegistryContextValue | undefined>(undefined)

export function useStepRegistry(): StepRegistryContextValue | undefined {
  return useContext(StepRegistryContext)
}

export function useStepIndex(name: string | undefined): number {
  const registry = useStepRegistry()
  const [index] = useState(() => {
    if (!registry) return 0
    return registry.registerStep(name ?? 'unnamed')
  })
  return index
}

// ============================================================================
// STEP REGISTRY PROVIDER (automatically wraps Phase children)
// ============================================================================

export interface StepRegistryProviderProps {
  children: ReactNode
  phaseId?: string
  isParallel?: boolean
}

export function StepRegistryProvider(props: StepRegistryProviderProps): ReactNode {
  const { db, reactiveDb } = useSmithers()
  const stateKey = `stepIndex_${props.phaseId ?? 'default'}`

  // Track registered steps using ref for synchronous updates during render
  // This avoids race conditions when multiple Step components mount simultaneously
  const stepsRef = useRef<string[]>([])

  // Read current step index from SQLite (for sequential mode)
  const { data: dbStepIndex } = useQueryValue<number>(
    reactiveDb,
    `SELECT CAST(value AS INTEGER) as idx FROM state WHERE key = ?`,
    [stateKey]
  )

  const currentStepIndex = props.isParallel ? -1 : (dbStepIndex ?? 0)

  // Initialize step index in DB
  useMount(() => {
    if (!props.isParallel) {
      const existing = db.state.get<number>(stateKey)
      if (existing === null) {
        db.state.set(stateKey, 0, 'step_registry_init')
      }
    }
  })

  const registerStep = useCallback((name: string): number => {
    const existingIndex = stepsRef.current.indexOf(name)
    if (existingIndex >= 0) {
      return existingIndex
    }
    const index = stepsRef.current.length
    stepsRef.current.push(name)
    return index
  }, []) // No dependencies needed - ref is mutable

  const advanceStep = useCallback(() => {
    if (props.isParallel) return
    const nextIndex = currentStepIndex + 1
    if (nextIndex < stepsRef.current.length) {
      db.state.set(stateKey, nextIndex, 'step_advance')
    }
  }, [db, stateKey, currentStepIndex, props.isParallel])

  const isStepActive = useCallback((index: number): boolean => {
    if (props.isParallel) return true // All steps active in parallel mode
    return index === currentStepIndex
  }, [currentStepIndex, props.isParallel])

  const isStepCompleted = useCallback((index: number): boolean => {
    if (props.isParallel) return false
    return index < currentStepIndex
  }, [currentStepIndex, props.isParallel])

  const value = useMemo((): StepRegistryContextValue => ({
    registerStep,
    currentStepIndex,
    advanceStep,
    isStepActive,
    isStepCompleted,
    isParallel: props.isParallel ?? false,
  }), [registerStep, currentStepIndex, advanceStep, isStepActive, isStepCompleted, props.isParallel])

  return (
    <StepRegistryContext.Provider value={value}>
      {props.children}
    </StepRegistryContext.Provider>
  )
}

// ============================================================================
// STEP COMPONENT
// ============================================================================

export interface StepProps {
  /**
   * Step name
   */
  name?: string

  /**
   * Children components
   */
  children: ReactNode

  /**
   * Create JJ snapshot before executing
   */
  snapshotBefore?: boolean

  /**
   * Create JJ snapshot after executing
   */
  snapshotAfter?: boolean

  /**
   * Create JJ commit after executing
   */
  commitAfter?: boolean

  /**
   * Commit message (if commitAfter is true)
   */
  commitMessage?: string

  /**
   * Callback when step starts
   */
  onStart?: () => void

  /**
   * Callback when step completes
   */
  onComplete?: () => void
}

/**
 * Step component with automatic sequential execution
 *
 * Steps within a Phase execute sequentially by default.
 * Wrap in <Parallel> for concurrent execution.
 *
 * @example
 * ```tsx
 * <Phase name="Build">
 *   <Step name="Write code">
 *     <Claude>Write the implementation</Claude>
 *   </Step>
 *   <Step name="Write tests">
 *     <Claude>Write tests for the implementation</Claude>
 *   </Step>
 * </Phase>
 * ```
 */
export function Step(props: StepProps): ReactNode {
  const { db } = useSmithers()
  const registry = useStepRegistry()
  const myIndex = useStepIndex(props.name)

  const [, setStepId] = useState<string | null>(null)
  const [, setStatus] = useState<'pending' | 'active' | 'completed' | 'failed'>('pending')
  const stepIdRef = useRef<string | null>(null)
  const taskIdRef = useRef<string | null>(null)
  const hasStartedRef = useRef(false)
  const hasCompletedRef = useRef(false)
  const snapshotBeforeIdRef = useRef<string | undefined>(undefined)
  const snapshotAfterIdRef = useRef<string | undefined>(undefined)
  const commitHashRef = useRef<string | undefined>(undefined)

  // Determine if this step should be active
  // If no registry (not inside a Phase), always active
  const isActive = registry ? registry.isStepActive(myIndex) : true
  const isCompleted = registry ? registry.isStepCompleted(myIndex) : false
  const status = isActive ? 'active' : isCompleted ? 'completed' : 'pending'

  useMount(() => {
    if (!isActive || hasStartedRef.current) return
    hasStartedRef.current = true

    ;(async () => {
      // Register task with database
      taskIdRef.current = db.tasks.start('step', props.name)

      try {
        // Snapshot before if requested
        if (props.snapshotBefore) {
          try {
            const { changeId } = await jjSnapshot(`Before step: ${props.name ?? 'unnamed'}`)
            snapshotBeforeIdRef.current = changeId
            console.log(`[Step] Created snapshot before: ${changeId}`)
          } catch (error) {
            console.warn('[Step] Could not create snapshot before:', error)
          }
        }

        // Start step in database
        const id = db.steps.start(props.name)
        setStepId(id)
        stepIdRef.current = id
        setStatus('active')

        console.log(`[Step] Started: ${props.name ?? 'unnamed'}`)

        props.onStart?.()
      } catch (error) {
        console.error(`[Step] Error starting step:`, error)
        setStatus('failed')

        if (stepIdRef.current) {
          db.steps.fail(stepIdRef.current)
        }

        if (taskIdRef.current) {
          db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  })

  useUnmount(() => {
    if (!hasStartedRef.current || hasCompletedRef.current) return
    hasCompletedRef.current = true

    ;(async () => {
      const id = stepIdRef.current
      if (!id) return

      try {
        // Snapshot after if requested
        if (props.snapshotAfter) {
          try {
            const { changeId } = await jjSnapshot(`After step: ${props.name ?? 'unnamed'}`)
            snapshotAfterIdRef.current = changeId
            console.log(`[Step] Created snapshot after: ${changeId}`)
          } catch (error) {
            console.warn('[Step] Could not create snapshot after:', error)
          }
        }

        // Commit if requested
        if (props.commitAfter) {
          try {
            const message = props.commitMessage ?? `Step: ${props.name ?? 'unnamed'}`
            const result = await jjCommit(message)
            commitHashRef.current = result.commitHash

            console.log(`[Step] Created commit: ${commitHashRef.current}`)

            db.vcs.logCommit({
              vcs_type: 'jj',
              commit_hash: result.commitHash,
              change_id: result.changeId,
              message,
            })
          } catch (error) {
            console.warn('[Step] Could not create commit:', error)
          }
        }

        // Complete step in database
        db.steps.complete(id, {
          ...(snapshotBeforeIdRef.current ? { snapshot_before: snapshotBeforeIdRef.current } : {}),
          ...(snapshotAfterIdRef.current ? { snapshot_after: snapshotAfterIdRef.current } : {}),
          ...(commitHashRef.current ? { commit_created: commitHashRef.current } : {}),
        })

        setStatus('completed')
        console.log(`[Step] Completed: ${props.name ?? 'unnamed'}`)

        props.onComplete?.()

        // Advance to next step
        registry?.advanceStep()
      } catch (error) {
        console.error(`[Step] Error completing step:`, error)
        db.steps.fail(id)
        setStatus('failed')
      } finally {
        if (taskIdRef.current) {
          db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  })

  // Always render the step element, only render children when active
  return (
    <step {...(props.name ? { name: props.name } : {})} status={status}>
      {isActive && props.children}
    </step>
  )
}

```

## `src/components/Constraints.tsx`

```typescript
import type { ReactNode } from 'react'

export interface ConstraintsProps {
  children?: ReactNode
  [key: string]: unknown
}

/**
 * Constraints component - defines constraints for Claude's responses.
 *
 * Constraints are added to the prompt to guide Claude's behavior.
 *
 * @example
 * ```tsx
 * <Claude>
 *   <Constraints>
 *     - Keep responses concise
 *     - Focus on security
 *     - Cite sources
 *   </Constraints>
 *   Analyze this code
 * </Claude>
 * ```
 */
export function Constraints(props: ConstraintsProps): ReactNode {
  return (
    <constraints>
      {props.children}
    </constraints>
  )
}

```

## `src/components/Review.test.tsx`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/components/Review.tsx`

```typescript
// Re-export from Review folder for backward compatibility
export type { ReviewTarget, ReviewIssue, ReviewResult, ReviewProps } from './Review/types.js'
export { Review } from './Review/Review.js'

```

## `src/components/Persona.tsx`

```typescript
import type { ReactNode } from 'react'

export interface PersonaProps {
  role?: string
  children?: ReactNode
  [key: string]: unknown
}

/**
 * Persona component - defines a persona/role for Claude.
 *
 * Personas are typically rendered as part of the system message
 * when executing a Claude component.
 *
 * @example
 * ```tsx
 * <Claude>
 *   <Persona role="security expert">
 *     You specialize in application security and code review.
 *   </Persona>
 *   Review this code for vulnerabilities.
 * </Claude>
 * ```
 */
export function Persona(props: PersonaProps): ReactNode {
  return (
    <persona {...(props.role ? { role: props.role } : {})}>
      {props.children}
    </persona>
  )
}

```

## `src/components/Smithers.tsx`

```typescript
// Smithers Subagent Component
// Launches a new Smithers instance to plan and execute a task

import { useState, useRef, type ReactNode } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { useRalphCount } from '../hooks/useRalphCount.js'
import { executeSmithers, type SmithersResult } from './agents/SmithersCLI.js'
import type { ClaudeModel } from './agents/types.js'
import { useMountedState, useEffectOnValueChange } from '../reconciler/hooks.js'

// ============================================================================
// Types
// ============================================================================

export interface SmithersProps {
  /**
   * Task description (as children)
   */
  children: ReactNode

  /**
   * Model to use for planning the script
   * @default 'sonnet'
   */
  plannerModel?: ClaudeModel

  /**
   * Model to use within the generated script for Claude agents
   * @default 'sonnet'
   */
  executionModel?: ClaudeModel

  /**
   * Maximum turns for the planning phase
   * @default 5
   */
  maxPlanningTurns?: number

  /**
   * Timeout in milliseconds for the entire execution
   * @default 600000 (10 minutes)
   */
  timeout?: number

  /**
   * Additional context to provide to the planner
   */
  context?: string

  /**
   * Working directory for script execution
   */
  cwd?: string

  /**
   * Keep the generated script after execution
   * @default false
   */
  keepScript?: boolean

  /**
   * Custom path for the generated script (implies keepScript)
   */
  scriptPath?: string

  /**
   * Enable database reporting for this subagent
   * @default true
   */
  reportingEnabled?: boolean

  /**
   * Called when the subagent finishes successfully
   */
  onFinished?: (result: SmithersResult) => void

  /**
   * Called when the subagent encounters an error
   */
  onError?: (error: Error) => void

  /**
   * Called for progress updates
   */
  onProgress?: (message: string) => void

  /**
   * Called when the script is generated (before execution)
   */
  onScriptGenerated?: (script: string, path: string) => void
}

// ============================================================================
// Component
// ============================================================================

/**
 * Smithers Subagent Component
 *
 * Launches a new Smithers instance to plan and execute a complex task.
 * Uses Claude to generate a Smithers script based on the task description,
 * then executes that script as a subprocess.
 *
 * @example
 * ```tsx
 * <Smithers
 *   plannerModel="opus"
 *   executionModel="sonnet"
 *   onFinished={(result) => console.log('Task completed:', result.output)}
 * >
 *   Create a new API endpoint for user authentication.
 *   The endpoint should:
 *   1. Accept POST requests with email and password
 *   2. Validate credentials against the database
 *   3. Return a JWT token on success
 *   4. Include proper error handling and tests
 * </Smithers>
 * ```
 */
export function Smithers(props: SmithersProps): ReactNode {
  const { db, executionId } = useSmithers()
  const ralphCount = useRalphCount()

  const [status, setStatus] = useState<'pending' | 'planning' | 'executing' | 'complete' | 'error'>('pending')
  const [result, setResult] = useState<SmithersResult | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [subagentId, setSubagentId] = useState<string | null>(null)

  const taskIdRef = useRef<string | null>(null)
  const isMounted = useMountedState()

  // Execute once per ralphCount change (idempotent, handles React strict mode)
  useEffectOnValueChange(ralphCount, () => {
    // Fire-and-forget async IIFE
    ;(async () => {
      // Register task with database
      taskIdRef.current = db.tasks.start('smithers', props.plannerModel ?? 'sonnet')

      let currentSubagentId: string | null = null

      try {
        if (isMounted()) setStatus('planning')

        // Extract task from children
        const task = String(props.children)

        // Log subagent start to database
        if (props.reportingEnabled !== false) {
          currentSubagentId = await db.agents.start(
            `[Smithers Subagent] ${task.slice(0, 100)}...`,
            props.plannerModel ?? 'sonnet',
            'Smithers subagent planning and execution'
          )
          if (isMounted()) setSubagentId(currentSubagentId)
        }

        props.onProgress?.('Starting Smithers subagent...')

        // Execute the subagent
        if (isMounted()) setStatus('executing')
        const smithersResult = await executeSmithers({
          task,
          ...(props.plannerModel !== undefined ? { plannerModel: props.plannerModel } : {}),
          ...(props.executionModel !== undefined ? { executionModel: props.executionModel } : {}),
          ...(props.maxPlanningTurns !== undefined ? { maxPlanningTurns: props.maxPlanningTurns } : {}),
          ...(props.timeout !== undefined ? { timeout: props.timeout } : {}),
          ...(props.context !== undefined ? { context: props.context } : {}),
          ...(props.cwd !== undefined ? { cwd: props.cwd } : {}),
          keepScript: props.keepScript || !!props.scriptPath,
          ...(props.scriptPath !== undefined ? { scriptPath: props.scriptPath } : {}),
          ...(props.onProgress !== undefined ? { onProgress: props.onProgress } : {}),
          ...(props.onScriptGenerated !== undefined ? { onScriptGenerated: props.onScriptGenerated } : {}),
        })

        // Check for errors
        if (smithersResult.stopReason === 'error') {
          throw new Error(smithersResult.output || 'Smithers subagent execution failed')
        }

        // Log completion to database
        if (props.reportingEnabled !== false && currentSubagentId) {
          await db.agents.complete(
            currentSubagentId,
            smithersResult.output,
            { script: smithersResult.script, scriptPath: smithersResult.scriptPath },
            smithersResult.tokensUsed
          )
        }

        // Add report
        if (props.reportingEnabled !== false) {
          await db.vcs.addReport({
            type: 'progress',
            title: 'Smithers subagent completed',
            content: smithersResult.output.slice(0, 500),
            data: {
              tokensUsed: smithersResult.tokensUsed,
              scriptPath: smithersResult.scriptPath,
              durationMs: smithersResult.durationMs,
            },
            ...(currentSubagentId ? { agent_id: currentSubagentId } : {}),
          })
        }

        if (isMounted()) {
          setResult(smithersResult)
          setStatus('complete')
          props.onFinished?.(smithersResult)
        }

      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err))
        if (isMounted()) {
          setError(errorObj)
          setStatus('error')
        }

        // Log failure to database
        if (props.reportingEnabled !== false && currentSubagentId) {
          await db.agents.fail(currentSubagentId, errorObj.message)
        }

        // Add error report
        if (props.reportingEnabled !== false) {
          await db.vcs.addReport({
            type: 'error',
            title: 'Smithers subagent failed',
            content: errorObj.message,
            severity: 'warning',
            ...(currentSubagentId ? { agent_id: currentSubagentId } : {}),
          })
        }

        props.onError?.(errorObj)
      } finally {
        // Complete task
        if (taskIdRef.current) {
          db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  })

  // Render custom element for XML serialization
  return (
    <smithers-subagent
      status={status}
      {...(subagentId ? { 'subagent-id': subagentId } : {})}
      {...(executionId ? { 'execution-id': executionId } : {})}
      planner-model={props.plannerModel ?? 'sonnet'}
      execution-model={props.executionModel ?? 'sonnet'}
      {...(result?.scriptPath ? { 'script-path': result.scriptPath } : {})}
      {...(result?.output ? { output: result.output.slice(0, 200) } : {})}
      {...(error?.message ? { error: error.message } : {})}
      {...(result?.tokensUsed?.input !== undefined ? { 'tokens-input': result.tokensUsed.input } : {})}
      {...(result?.tokensUsed?.output !== undefined ? { 'tokens-output': result.tokensUsed.output } : {})}
      {...(result?.durationMs !== undefined ? { 'duration-ms': result.durationMs } : {})}
    >
      {props.children}
    </smithers-subagent>
  )
}

// ============================================================================
// Exports
// ============================================================================

export type { SmithersResult }
export { executeSmithers } from './agents/SmithersCLI.js'

```

## `src/components/Claude.tsx`

```typescript
// Enhanced Claude component for Smithers orchestrator
// Uses SmithersProvider context for database logging and ClaudeCodeCLI for execution

import { useState, useRef, type ReactNode } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { useRalphCount } from '../hooks/useRalphCount.js'
import { executeClaudeCLI } from './agents/ClaudeCodeCLI.js'
import { extractMCPConfigs, generateMCPServerConfig, writeMCPConfigFile } from '../utils/mcp-config.js'
import type { ClaudeProps, AgentResult } from './agents/types.js'
import { useMountedState, useEffectOnValueChange } from '../reconciler/hooks.js'
import { LogWriter } from '../monitor/log-writer.js'
import { uuid } from '../db/utils.js'
import { MessageParser, truncateToLastLines, type TailLogEntry } from './agents/claude-cli/message-parser.js'

// ============================================================================
// CLAUDE COMPONENT
// ============================================================================

/**
 * Enhanced Claude component with database logging and CLI execution.
 *
 * CRITICAL PATTERN: This component is BOTH declaration AND execution.
 * Instead of relying on remounting via key, it reacts to ralphCount
 * changes from Ralph and explicitly restarts execution.
 *
 * React pattern: Use useEffect with ralphCount dependency:
 *   useEffect(() => {
 *     (async () => { ... })()
 *   }, [ralphCount])
 *
 * Usage:
 * ```tsx
 * <Claude
 *   model="sonnet"
 *   maxTurns={5}
 *   reportingEnabled
 *   onFinished={(result) => console.log('Done:', result)}
 * >
 *   Implement a feature that does X
 * </Claude>
 * ```
 */
// Default throttle interval for tail log updates (ms)
const DEFAULT_TAIL_LOG_THROTTLE_MS = 100

export function Claude(props: ClaudeProps): ReactNode {
  const { db, executionId, isStopRequested } = useSmithers()
  const ralphCount = useRalphCount()

  const [status, setStatus] = useState<'pending' | 'running' | 'complete' | 'error'>('pending')
  const [result, setResult] = useState<AgentResult | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [agentId, setAgentId] = useState<string | null>(null)
  const [tailLog, setTailLog] = useState<TailLogEntry[]>([])

  // Track task ID for this component
  const taskIdRef = useRef<string | null>(null)
  // Limit stored entries in MessageParser to prevent unbounded growth
  const maxEntries = props.tailLogCount ?? 10
  const messageParserRef = useRef<MessageParser>(new MessageParser(maxEntries * 2))
  const isMounted = useMountedState()

  // Throttle refs for tail log updates to reduce re-renders
  const lastTailLogUpdateRef = useRef<number>(0)
  const pendingTailLogUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Execute once per ralphCount change (idempotent, handles React strict mode)
  useEffectOnValueChange(ralphCount, () => {
    // Fire-and-forget async IIFE
    ;(async () => {
      // Register task with database
      taskIdRef.current = db.tasks.start('claude', props.model ?? 'sonnet')

      // Check if stop has been requested globally
      if (isStopRequested()) {
        db.tasks.complete(taskIdRef.current)
        return
      }

      let currentAgentId: string | null = null
      let retryCount = 0
      const maxRetries = props.maxRetries ?? 3

      // Initialize LogWriter
      const logWriter = new LogWriter(undefined, executionId ?? undefined)
      const logFilename = `agent-${uuid()}.log`
      let logPath: string | undefined

      try {
        setStatus('running')

        // Extract prompt from children
        const childrenString = String(props.children)

        // Check for MCP tool components
        const { configs: mcpConfigs, cleanPrompt, toolInstructions } = extractMCPConfigs(childrenString)

        // Build final prompt with tool instructions
        let prompt = cleanPrompt
        if (toolInstructions) {
          prompt = `${toolInstructions}\n\n---\n\n${cleanPrompt}`
        }

        // Generate MCP config file if needed
        let mcpConfigPath = props.mcpConfig
        if (mcpConfigs.length > 0) {
          const mcpConfig = generateMCPServerConfig(mcpConfigs)
          mcpConfigPath = await writeMCPConfigFile(mcpConfig)
        }

        // Log agent start to database if reporting is enabled
        if (props.reportingEnabled !== false) {
          // Initialize log file
          logPath = logWriter.appendLog(logFilename, '')
          
          currentAgentId = await db.agents.start(
            prompt,
            props.model ?? 'sonnet',
            props.systemPrompt,
            logPath
          )
          setAgentId(currentAgentId)
        }

        // Report progress
        props.onProgress?.(`Starting Claude agent with model: ${props.model ?? 'sonnet'}`)

        // Execute with retry logic
        let agentResult: AgentResult | null = null
        let lastError: Error | null = null

        while (retryCount <= maxRetries) {
          try {
            // Execute via Claude CLI
            agentResult = await executeClaudeCLI({
              prompt,
              ...(props.model !== undefined ? { model: props.model } : {}),
              ...(props.permissionMode !== undefined ? { permissionMode: props.permissionMode } : {}),
              ...(props.maxTurns !== undefined ? { maxTurns: props.maxTurns } : {}),
              ...(props.systemPrompt !== undefined ? { systemPrompt: props.systemPrompt } : {}),
              ...(props.outputFormat !== undefined ? { outputFormat: props.outputFormat } : {}),
              ...(mcpConfigPath !== undefined ? { mcpConfig: mcpConfigPath } : {}),
              ...(props.allowedTools !== undefined ? { allowedTools: props.allowedTools } : {}),
              ...(props.disallowedTools !== undefined ? { disallowedTools: props.disallowedTools } : {}),
              ...(props.timeout !== undefined ? { timeout: props.timeout } : {}),
              ...(props.stopConditions !== undefined ? { stopConditions: props.stopConditions } : {}),
              ...(props.continueConversation !== undefined ? { continue: props.continueConversation } : {}),
              ...(props.resumeSession !== undefined ? { resume: props.resumeSession } : {}),
              ...(props.onToolCall !== undefined ? { onToolCall: props.onToolCall } : {}),
              ...(props.schema !== undefined ? { schema: props.schema } : {}),
              ...(props.schemaRetries !== undefined ? { schemaRetries: props.schemaRetries } : {}),
              onProgress: (chunk) => {
                // Stream to log file
                if (logFilename) {
                  logWriter.appendLog(logFilename, chunk)
                }

                // Parse for tail log
                messageParserRef.current.parseChunk(chunk)

                // Throttle tail log updates to reduce re-renders
                const now = Date.now()
                const timeSinceLastUpdate = now - lastTailLogUpdateRef.current

                if (timeSinceLastUpdate >= DEFAULT_TAIL_LOG_THROTTLE_MS) {
                  // Enough time has passed, update immediately
                  lastTailLogUpdateRef.current = now
                  if (isMounted()) {
                    setTailLog(messageParserRef.current.getLatestEntries(maxEntries))
                  }
                } else if (!pendingTailLogUpdateRef.current) {
                  // Schedule an update for later
                  pendingTailLogUpdateRef.current = setTimeout(() => {
                    pendingTailLogUpdateRef.current = null
                    lastTailLogUpdateRef.current = Date.now()
                    if (isMounted()) {
                      setTailLog(messageParserRef.current.getLatestEntries(maxEntries))
                    }
                  }, DEFAULT_TAIL_LOG_THROTTLE_MS - timeSinceLastUpdate)
                }

                // Call original onProgress
                props.onProgress?.(chunk)
              },
            })

            // Check for execution errors
            if (agentResult.stopReason === 'error') {
              throw new Error(agentResult.output || 'Claude CLI execution failed')
            }

            // Validate result if validator provided
            if (props.validate) {
              const isValid = await props.validate(agentResult)
              if (!isValid) {
                if (props.retryOnValidationFailure && retryCount < maxRetries) {
                  retryCount++
                  props.onProgress?.(`Validation failed, retrying (${retryCount}/${maxRetries})...`)
                  continue
                }
                throw new Error('Validation failed')
              }
            }

            // Success - break out of retry loop
            break
          } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err))

            if (retryCount < maxRetries) {
              retryCount++
              props.onProgress?.(`Error occurred, retrying (${retryCount}/${maxRetries})...`)
              await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount)) // Exponential backoff
            } else {
              throw lastError
            }
          }
        }

        if (!agentResult) {
          throw lastError ?? new Error('No result from Claude CLI')
        }

        // Flush message parser to capture any remaining content
        messageParserRef.current.flush()
        // Cancel any pending throttled update
        if (pendingTailLogUpdateRef.current) {
          clearTimeout(pendingTailLogUpdateRef.current)
          pendingTailLogUpdateRef.current = null
        }
        setTailLog(messageParserRef.current.getLatestEntries(maxEntries))

        // Log completion to database
        if (props.reportingEnabled !== false && currentAgentId) {
          await db.agents.complete(
            currentAgentId,
            agentResult.output,
            agentResult.structured,
            agentResult.tokensUsed
          )
        }

        // Add report if there's notable output
        if (props.reportingEnabled !== false && agentResult.output) {
          const reportData = {
            type: 'progress' as const,
            title: `Claude ${props.model ?? 'sonnet'} completed`,
            content: agentResult.output.slice(0, 500), // First 500 chars
            data: {
              tokensUsed: agentResult.tokensUsed,
              turnsUsed: agentResult.turnsUsed,
              durationMs: agentResult.durationMs,
            },
          }
          if (currentAgentId) {
            await db.vcs.addReport({
              ...reportData,
              agent_id: currentAgentId,
            })
          } else {
            await db.vcs.addReport(reportData)
          }
        }

        if (isMounted()) {
          setResult(agentResult)
          setStatus('complete')
          props.onFinished?.(agentResult)
        }
      } catch (err) {
        if (isMounted()) {
          const errorObj = err instanceof Error ? err : new Error(String(err))
          setError(errorObj)
          setStatus('error')

          // Log failure to database
          if (props.reportingEnabled !== false && currentAgentId) {
            await db.agents.fail(currentAgentId, errorObj.message)
          }

          // Add error report
          if (props.reportingEnabled !== false) {
            const errorData = {
              type: 'error' as const,
              title: `Claude ${props.model ?? 'sonnet'} failed`,
              content: errorObj.message,
              severity: 'warning' as const,
            }
            if (currentAgentId) {
              await db.vcs.addReport({
                ...errorData,
                agent_id: currentAgentId,
              })
            } else {
              await db.vcs.addReport(errorData)
            }
          }

          props.onError?.(errorObj)
        }
      } finally {
        // Flush log stream to ensure all writes complete before exit
        await logWriter.flushStream(logFilename)
        // Always complete task
        if (taskIdRef.current) {
          db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  })

  // Render custom element for XML serialization
  const maxLines = props.tailLogLines ?? 10
  const displayEntries = status === 'complete'
    ? tailLog.slice(-1)
    : tailLog.slice(-maxEntries)

  return (
    <claude
      status={status}
      agent-id={agentId}
      execution-id={executionId}
      model={props.model ?? 'sonnet'}
      {...(error?.message ? { error: error.message } : {})}
      {...(result?.tokensUsed?.input !== undefined ? { 'tokens-input': result.tokensUsed.input } : {})}
      {...(result?.tokensUsed?.output !== undefined ? { 'tokens-output': result.tokensUsed.output } : {})}
      {...(result?.turnsUsed !== undefined ? { 'turns-used': result.turnsUsed } : {})}
      {...(result?.durationMs !== undefined ? { 'duration-ms': result.durationMs } : {})}
    >
      {displayEntries.length > 0 && (
        <messages count={displayEntries.length}>
          {displayEntries.map(entry =>
            entry.type === 'message' ? (
              <message key={entry.index} index={entry.index}>
                {truncateToLastLines(entry.content, maxLines)}
              </message>
            ) : (
              <tool-call key={entry.index} name={entry.toolName} index={entry.index}>
                {truncateToLastLines(entry.content, maxLines)}
              </tool-call>
            )
          )}
        </messages>
      )}
      {props.children}
    </claude>
  )
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { ClaudeProps, AgentResult }
export { executeClaudeCLI } from './agents/ClaudeCodeCLI.js'

```

## `src/components/Subagent.tsx`

```typescript
import type { ReactNode } from 'react'

export interface SubagentProps {
  name?: string
  parallel?: boolean
  children?: ReactNode
  [key: string]: unknown
}

/**
 * Subagent component - wraps child components in a named execution boundary.
 *
 * Subagents provide:
 * - Named execution scopes for better debugging
 * - Optional parallel execution when parallel=true
 * - Grouping of related Claude calls
 *
 * @example
 * ```tsx
 * <Subagent name="researcher" parallel={true}>
 *   <Claude>Research topic A</Claude>
 *   <Claude>Research topic B</Claude>
 * </Subagent>
 * ```
 */
export function Subagent(props: SubagentProps): ReactNode {
  return (
    <subagent name={props.name} parallel={props.parallel}>
      {props.children}
    </subagent>
  )
}

```

## `src/components/Task.tsx`

```typescript
import type { ReactNode } from 'react'

export interface TaskProps {
  done?: boolean
  children?: ReactNode
  [key: string]: unknown
}

/**
 * Task component - represents a trackable task.
 *
 * Tasks can be marked as done/not done to track progress.
 *
 * @example
 * ```tsx
 * <Phase name="work">
 *   <Task done={false}>Research topic</Task>
 *   <Task done={true}>Write outline</Task>
 *   <Task done={false}>Write draft</Task>
 * </Phase>
 * ```
 */
export function Task(props: TaskProps): ReactNode {
  return (
    <task done={props.done}>
      {props.children}
    </task>
  )
}

```

## `src/components/Stop.tsx`

```typescript
import type { ReactNode } from 'react'

export interface StopProps {
  reason?: string
  children?: ReactNode
  [key: string]: unknown
}

/**
 * Stop component - signals that execution should halt.
 *
 * When the Ralph Wiggum loop encounters a Stop node in the tree,
 * it stops iterating and returns the current result.
 *
 * @example
 * ```tsx
 * <Claude onFinished={() => setDone(true)}>
 *   Do work
 * </Claude>
 * {done && <Stop reason="Work complete" />}
 * ```
 */
export function Stop(props: StopProps): ReactNode {
  return (
    <smithers-stop reason={props.reason}>
      {props.children}
    </smithers-stop>
  )
}

```

## `src/components/Claude.test.tsx`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/components/Parallel.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/core/index.ts`

```typescript
/**
 * Core execution engine - framework-agnostic
 */

export { executePlan } from './execute.js'

// Re-export from reconciler for backwards compatibility
export { serialize } from '../reconciler/serialize.js'

export type {
  SmithersNode,
  ExecutionState,
  ExecuteOptions,
  ExecutionResult,
  DebugOptions,
  DebugEvent,
} from '../reconciler/types.js'

```

## `src/tools/ReportTool.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/tools/index.ts`

```typescript
// Tools module - exports all tool-related functionality

export {
  // Types
  type JSONSchema,
  type ToolContext,
  type Tool,
  type MCPServer,
  type ToolSpec,
  type BuiltinToolName,

  // Registry
  BUILTIN_TOOLS,
  isBuiltinTool,
  getToolInfo,

  // Helpers
  isCustomTool,
  isMCPServer,
  isToolName,
  parseToolSpecs,
  buildToolFlags,
} from './registry.jsx'

export { createReportTool, getReportToolDescription } from './ReportTool.jsx'

```

## `src/tools/registry.ts`

```typescript
// Tools registry - built-in and custom tool support

import type { SmithersDB } from '../db/index.js'

// ============================================================================
// TYPES
// ============================================================================

export interface JSONSchema {
  type: string
  properties?: Record<string, JSONSchema>
  required?: string[]
  description?: string
  enum?: string[]
  items?: JSONSchema
  [key: string]: any
}

export interface ToolContext {
  db: SmithersDB
  agentId: string
  executionId: string
}

export interface Tool {
  name: string
  description: string
  inputSchema: JSONSchema
  execute: (input: any, context: ToolContext) => Promise<any>
}

export interface MCPServer {
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
}

// ============================================================================
// BUILT-IN TOOLS REGISTRY
// ============================================================================

/**
 * Registry of built-in tools available in different CLIs
 */
export const BUILTIN_TOOLS = {
  // Claude Code built-in tools
  Read: { cli: 'claude', builtin: true, description: 'Read file contents' },
  Edit: { cli: 'claude', builtin: true, description: 'Edit file contents' },
  Write: { cli: 'claude', builtin: true, description: 'Write new files' },
  Bash: { cli: 'claude', builtin: true, description: 'Execute shell commands' },
  Glob: { cli: 'claude', builtin: true, description: 'Find files by pattern' },
  Grep: { cli: 'claude', builtin: true, description: 'Search file contents' },
  Task: { cli: 'claude', builtin: true, description: 'Launch subagent tasks' },
  WebFetch: { cli: 'claude', builtin: true, description: 'Fetch web content' },
  WebSearch: { cli: 'claude', builtin: true, description: 'Search the web' },
  TodoWrite: { cli: 'claude', builtin: true, description: 'Manage todo lists' },

  // Smithers-specific tools
  Report: { cli: 'smithers', builtin: true, description: 'Report progress to orchestration' },
  Memory: { cli: 'smithers', builtin: true, description: 'Store/retrieve long-term memory' },
  Snapshot: { cli: 'smithers', builtin: true, description: 'Create VCS snapshot' },
} as const

export type BuiltinToolName = keyof typeof BUILTIN_TOOLS

/**
 * Check if a tool name is a built-in tool
 */
export function isBuiltinTool(name: string): name is BuiltinToolName {
  return name in BUILTIN_TOOLS
}

/**
 * Get tool information
 */
export function getToolInfo(name: string): (typeof BUILTIN_TOOLS)[BuiltinToolName] | null {
  if (isBuiltinTool(name)) {
    return BUILTIN_TOOLS[name]
  }
  return null
}

// ============================================================================
// TOOL SPECIFICATION HELPERS
// ============================================================================

export type ToolSpec = string | Tool | MCPServer

/**
 * Check if a tool spec is a custom Tool object
 */
export function isCustomTool(spec: ToolSpec): spec is Tool {
  return typeof spec === 'object' && 'execute' in spec
}

/**
 * Check if a tool spec is an MCP Server
 */
export function isMCPServer(spec: ToolSpec): spec is MCPServer {
  return typeof spec === 'object' && 'command' in spec && !('execute' in spec)
}

/**
 * Check if a tool spec is a built-in tool name
 */
export function isToolName(spec: ToolSpec): spec is string {
  return typeof spec === 'string'
}

/**
 * Parse tool specifications into categorized lists
 */
export function parseToolSpecs(specs: ToolSpec[]): {
  builtinTools: string[]
  customTools: Tool[]
  mcpServers: MCPServer[]
} {
  const builtinTools: string[] = []
  const customTools: Tool[] = []
  const mcpServers: MCPServer[] = []

  for (const spec of specs) {
    if (isToolName(spec)) {
      builtinTools.push(spec)
    } else if (isCustomTool(spec)) {
      customTools.push(spec)
    } else if (isMCPServer(spec)) {
      mcpServers.push(spec)
    }
  }

  return { builtinTools, customTools, mcpServers }
}

/**
 * Build CLI tool flags from tool specs
 */
export function buildToolFlags(specs: ToolSpec[]): string[] {
  const { builtinTools } = parseToolSpecs(specs)
  const flags: string[] = []

  // Add --allowedTools flag for built-in tools
  if (builtinTools.length > 0) {
    flags.push('--allowedTools', builtinTools.join(','))
  }

  return flags
}

```

## `src/tools/registry.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/tools/ReportTool.ts`

```typescript
// Report Tool - Allows agents to write structured reports to the database

import type { Tool, ToolContext, JSONSchema } from './registry.jsx'

/**
 * Report tool input schema
 */
const reportInputSchema: JSONSchema = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: ['progress', 'finding', 'warning', 'error', 'metric', 'decision'],
      description: 'Type of report',
    },
    title: {
      type: 'string',
      description: 'Brief title for the report',
    },
    content: {
      type: 'string',
      description: 'Detailed content of the report',
    },
    data: {
      type: 'object',
      description: 'Optional structured data to include',
    },
    severity: {
      type: 'string',
      enum: ['info', 'warning', 'critical'],
      description: 'Severity level (default: info)',
    },
  },
  required: ['type', 'title', 'content'],
}

/**
 * Create a Report tool instance for an agent
 *
 * The Report tool allows agents to communicate structured information
 * back to the orchestration system. Reports are stored in the database
 * and can trigger stop conditions if severity is critical.
 *
 * Usage in agent prompt:
 * ```
 * Use the Report tool to communicate important findings:
 * - progress: Report progress on the task
 * - finding: Document a discovery or observation
 * - warning: Flag a potential issue
 * - error: Report an error condition
 * - metric: Record a measurement or statistic
 * - decision: Document a decision made
 * ```
 */
export function createReportTool(context: ToolContext): Tool {
  return {
    name: 'Report',
    description: `Report progress, findings, or status to the orchestration system.
Use this to communicate important information back to the orchestrator.
Reports are stored in the database and visible to monitoring.

Types:
- progress: Report progress on the current task
- finding: Document an important discovery
- warning: Flag a potential issue (severity: warning)
- error: Report an error condition (severity: critical)
- metric: Record a measurement or statistic
- decision: Document a decision that was made

Severity levels:
- info: Informational (default)
- warning: Potential issue that needs attention
- critical: Serious issue that may stop orchestration`,

    inputSchema: reportInputSchema,

    execute: async (input: {
      type: 'progress' | 'finding' | 'warning' | 'error' | 'metric' | 'decision'
      title: string
      content: string
      data?: Record<string, any>
      severity?: 'info' | 'warning' | 'critical'
    }) => {
      // Default severity based on type
      let severity = input.severity
      if (!severity) {
        switch (input.type) {
          case 'error':
            severity = 'critical'
            break
          case 'warning':
            severity = 'warning'
            break
          default:
            severity = 'info'
        }
      }

      // Add report to database
      const reportData = {
        type: input.type,
        title: input.title,
        content: input.content,
        severity,
        agent_id: context.agentId,
      }
      const reportId = await context.db.vcs.addReport({
        ...reportData,
        ...(input.data && { data: input.data }),
      })

      console.log(`[Report] ${severity.toUpperCase()}: ${input.title}`)

      return {
        success: true,
        reportId,
        message: `Report logged successfully: ${input.title}`,
      }
    },
  }
}

/**
 * Generate the Report tool description for inclusion in system prompts
 */
export function getReportToolDescription(): string {
  return `
## Report Tool

You have access to a Report tool that lets you communicate important information
back to the orchestration system. Use it to:

- Report progress on your task
- Document findings and discoveries
- Flag warnings or errors
- Record metrics and decisions

Example usage:
\`\`\`json
{
  "type": "finding",
  "title": "Security vulnerability detected",
  "content": "Found SQL injection vulnerability in user input handling...",
  "severity": "critical",
  "data": {
    "file": "src/api/users.ts",
    "line": 42
  }
}
\`\`\`

Reports with severity "critical" may trigger orchestration to stop.
`.trim()
}

```

## `src/monitor/index.ts`

```typescript
// Monitor utilities for LLM-friendly output
export { OutputParser } from './output-parser.js'
export { StreamFormatter } from './stream-formatter.js'
export { LogWriter } from './log-writer.js'
export { summarizeWithHaiku } from './haiku-summarizer.js'

```

## `src/monitor/stream-formatter.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/monitor/output-parser.ts`

```typescript
export interface ParsedEvent {
  type: 'phase' | 'agent' | 'tool' | 'ralph' | 'error' | 'log' | 'unknown'
  timestamp: Date
  data: Record<string, any>
  raw: string
}

export class OutputParser {
  private buffer: string = ''

  /**
   * Parse a chunk of output and extract structured events
   */
  parseChunk(chunk: string): ParsedEvent[] {
    this.buffer += chunk
    const lines = this.buffer.split('\n')

    // Keep last incomplete line in buffer
    this.buffer = lines.pop() || ''

    return lines.map((line) => this.parseLine(line)).filter((e) => e !== null) as ParsedEvent[]
  }

  /**
   * Parse a single line and extract structured information
   */
  private parseLine(line: string): ParsedEvent | null {
    const timestamp = new Date()

    // Phase events
    if (line.includes('Phase:') || line.includes('PHASE:')) {
      const match = line.match(/Phase:\s*(.+?)(?:\s*-\s*(.+))?$/)
      if (match) {
        return {
          type: 'phase',
          timestamp,
          data: {
            name: match[1]!.trim(),
            status: match[2]?.trim() || 'STARTING',
          },
          raw: line,
        }
      }
    }

    // Agent events
    if (line.includes('Agent:') || line.includes('AGENT:') || line.includes('Claude')) {
      const match = line.match(/(?:Agent:|Claude)\s*(.+?)(?:\s*-\s*(.+))?$/)
      if (match) {
        return {
          type: 'agent',
          timestamp,
          data: {
            name: match[1]!.trim(),
            status: match[2]?.trim() || 'RUNNING',
          },
          raw: line,
        }
      }
    }

    // Tool call events
    if (line.includes('Tool:') || line.includes('TOOL:')) {
      const match = line.match(/Tool:\s*(.+?)(?:\s*-\s*(.+))?$/)
      if (match) {
        return {
          type: 'tool',
          timestamp,
          data: {
            name: match[1]!.trim(),
            details: match[2]?.trim() || '',
          },
          raw: line,
        }
      }
    }

    // Ralph iteration events
    if (line.includes('Iteration') || line.includes('ITERATION')) {
      const match = line.match(/Iteration\s*(\d+)/)
      if (match) {
        return {
          type: 'ralph',
          timestamp,
          data: {
            iteration: parseInt(match[1]!),
          },
          raw: line,
        }
      }
    }

    // Error events
    if (line.includes('Error:') || line.includes('ERROR:') || line.match(/^\s*at\s+/)) {
      return {
        type: 'error',
        timestamp,
        data: {
          message: line.trim(),
        },
        raw: line,
      }
    }

    // Generic log line
    if (line.trim()) {
      return {
        type: 'log',
        timestamp,
        data: {
          message: line.trim(),
        },
        raw: line,
      }
    }

    return null
  }

  /**
   * Get any remaining buffered data
   */
  flush(): ParsedEvent[] {
    if (!this.buffer.trim()) return []

    const event = this.parseLine(this.buffer)
    this.buffer = ''

    return event ? [event] : []
  }
}

```

## `src/monitor/log-writer.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/monitor/output-parser.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/monitor/stream-formatter.ts`

```typescript
import type { ParsedEvent } from './output-parser.jsx'

export interface FormatterStats {
  phasesCompleted: number
  agentsExecuted: number
  toolCalls: number
  errors: number
  startTime: Date
}

export class StreamFormatter {
  private stats: FormatterStats
  private lastEventType: string | null = null

  constructor() {
    this.stats = {
      phasesCompleted: 0,
      agentsExecuted: 0,
      toolCalls: 0,
      errors: 0,
      startTime: new Date(),
    }
  }

  formatHeader(file: string): string {
    const lines = [
      '╔══════════════════════════════════════════════════════════════════╗',
      '║                    SMITHERS MONITOR v1.0                         ║',
      `║                    File: ${file.padEnd(41)} ║`,
      `║                    Started: ${this.stats.startTime.toISOString().replace('T', ' ').substring(0, 19).padEnd(37)} ║`,
      '╚══════════════════════════════════════════════════════════════════╝',
      '',
    ]
    return lines.join('\n')
  }

  formatEvent(event: ParsedEvent, logPath?: string, summary?: string): string {
    const time = this.formatTime(event.timestamp)
    let output = ''

    switch (event.type) {
      case 'phase':
        if (event.data['status'] === 'COMPLETE') {
          this.stats.phasesCompleted++
        }
        output = this.formatPhase(time, event.data['name'], event.data['status'])
        break

      case 'agent':
        if (event.data['status'] === 'COMPLETE') {
          this.stats.agentsExecuted++
        }
        output = this.formatAgent(time, event.data['name'], event.data['status'])
        break

      case 'tool':
        this.stats.toolCalls++
        output = this.formatTool(time, event.data['name'], event.data['details'], logPath, summary)
        break

      case 'ralph':
        output = this.formatRalph(time, event.data['iteration'])
        break

      case 'error':
        this.stats.errors++
        output = this.formatError(time, event.data['message'], logPath)
        break

      case 'log':
        // Only show logs if they're different from last event
        if (this.lastEventType !== 'log') {
          output = this.formatLog(time, event.data['message'])
        }
        break

      default:
        output = this.formatLog(time, event.raw)
    }

    this.lastEventType = event.type
    return output
  }

  private formatPhase(time: string, name: string, status: string): string {
    const symbol = status === 'COMPLETE' ? '✓' : '◆'
    return `[${time}] ${symbol} PHASE: ${name}\n           Status: ${status}\n`
  }

  private formatAgent(time: string, name: string, status: string): string {
    const symbol = status === 'COMPLETE' ? '✓' : '●'
    return `[${time}] ${symbol} AGENT: ${name}\n           Status: ${status}\n`
  }

  private formatTool(
    time: string,
    name: string,
    details: string,
    logPath?: string,
    summary?: string
  ): string {
    let output = `[${time}] ⚡ TOOL CALL: ${name}\n`
    if (details) {
      output += `           ${details}\n`
    }
    if (summary) {
      output += `           ${'─'.repeat(60)}\n`
      output += `           SUMMARY: ${summary.replace(/\n/g, '\n           ')}\n`
      output += `           ${'─'.repeat(60)}\n`
    }
    if (logPath) {
      output += `           📄 Full output: ${logPath}\n`
    }
    return output + '\n'
  }

  private formatRalph(time: string, iteration: number): string {
    return `[${time}] ↻ RALPH: Iteration ${iteration} complete\n           Triggering remount...\n\n`
  }

  private formatError(time: string, message: string, logPath?: string): string {
    let output = `[${time}] ✗ ERROR: ${message}\n`
    if (logPath) {
      output += `           📄 Full error: ${logPath}\n`
    }
    return output + '\n'
  }

  private formatLog(_time: string, message: string): string {
    // Don't show timestamp for regular logs to reduce noise
    return `           ${message}\n`
  }

  formatSummary(duration: number, logDir: string): string {
    const lines = [
      '',
      '╔══════════════════════════════════════════════════════════════════╗',
      '║                         EXECUTION SUMMARY                        ║',
      '╠══════════════════════════════════════════════════════════════════╣',
      `║  Duration: ${this.formatDuration(duration).padEnd(56)} ║`,
      `║  Phases completed: ${String(this.stats.phasesCompleted).padEnd(47)} ║`,
      `║  Agents executed: ${String(this.stats.agentsExecuted).padEnd(48)} ║`,
      `║  Tool calls: ${String(this.stats.toolCalls).padEnd(53)} ║`,
      `║  Errors: ${String(this.stats.errors).padEnd(57)} ║`,
      `║  Log directory: ${logDir.padEnd(50)} ║`,
      '╚══════════════════════════════════════════════════════════════════╝',
      '',
    ]
    return lines.join('\n')
  }

  private formatTime(date: Date): string {
    return date.toTimeString().substring(0, 8)
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }

  getStats(): FormatterStats {
    return { ...this.stats }
  }
}

```

## `src/monitor/haiku-summarizer.ts`

```typescript
import Anthropic from '@anthropic-ai/sdk'

export interface SummaryResult {
  summary: string
  fullPath: string
}

export type SummaryType = 'read' | 'edit' | 'result' | 'error' | 'output'

const PROMPTS: Record<SummaryType, string> = {
  read: 'Summarize this file content in 2-3 sentences. Focus on: what the file does, key exports/functions, and its role in the codebase.',
  edit: 'Summarize this code diff in 2-3 sentences. Focus on: what changed, why it might have changed, and the impact.',
  result: 'Summarize this AI agent result in 2-3 sentences. Focus on: what was accomplished and key findings.',
  error: 'Summarize this error in 1-2 sentences. Focus on: the root cause and suggested fix.',
  output: 'Summarize this output in 2-3 sentences. Focus on: what happened and key information.',
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.substring(0, maxLength) + '...'
}

export async function summarizeWithHaiku(
  content: string,
  type: SummaryType,
  logPath: string,
  options: {
    threshold?: number
    apiKey?: string
  } = {}
): Promise<SummaryResult> {
  const threshold = options.threshold || parseInt(process.env['SMITHERS_SUMMARY_THRESHOLD'] || '50')
  const lineCount = content.split('\n').length

  // Don't summarize if below threshold
  if (lineCount < threshold) {
    return {
      summary: content,
      fullPath: logPath,
    }
  }

  const apiKey = options.apiKey || process.env['ANTHROPIC_API_KEY']

  if (!apiKey) {
    // Fallback: truncate instead of summarize
    return {
      summary: truncate(content, 500) + '\n[... truncated, see full output]',
      fullPath: logPath,
    }
  }

  try {
    const client = new Anthropic({ apiKey })

    const response = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 150,
      messages: [
        {
          role: 'user',
          content: `${PROMPTS[type]}\n\n---\n${content}`,
        },
      ],
    })

    const text = response.content[0]
    const summary = text && text.type === 'text' && 'text' in text ? text.text : content

    return {
      summary,
      fullPath: logPath,
    }
  } catch {
    // Fallback on error
    return {
      summary: truncate(content, 500) + '\n[... summarization failed, see full output]',
      fullPath: logPath,
    }
  }
}

```

## `src/monitor/log-writer.ts`

```typescript
import * as fs from 'fs'
import * as path from 'path'

export class LogWriter {
  private logDir: string
  private counter: number = 0
  private sessionId: string
  private streams: Map<string, fs.WriteStream> = new Map()

  constructor(logDir: string = '.smithers/logs', executionId?: string) {
    if (executionId) {
      this.logDir = path.resolve('.smithers/executions', executionId, 'logs')
    } else {
      this.logDir = path.resolve(logDir)
    }
    this.sessionId = new Date().toISOString().replace(/[:.]/g, '-')

    // Create logs directory if it doesn't exist
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true })
    }
  }

  writeLog(type: string, content: string, metadata?: Record<string, any>): string {
    this.counter++
    const filename = `${this.sessionId}-${String(this.counter).padStart(3, '0')}-${type}.txt`
    const filepath = path.join(this.logDir, filename)

    // Add metadata header
    let output = ''
    if (metadata) {
      output += '='.repeat(60) + '\n'
      output += 'METADATA\n'
      output += '='.repeat(60) + '\n'
      for (const [key, value] of Object.entries(metadata)) {
        output += `${key}: ${value}\n`
      }
      output += '\n'
      output += '='.repeat(60) + '\n'
      output += 'CONTENT\n'
      output += '='.repeat(60) + '\n'
    }

    output += content

    fs.writeFileSync(filepath, output, 'utf-8')

    return filepath
  }

  /**
   * Append content to a log file using a persistent WriteStream for efficiency.
   * Creates the file if it doesn't exist.
   * Returns the full path to the log file.
   */
  appendLog(filename: string, content: string): string {
    const filepath = path.join(this.logDir, filename)
    
    // Get or create a WriteStream for this file
    let stream = this.streams.get(filename)
    if (!stream) {
      stream = fs.createWriteStream(filepath, { flags: 'a', encoding: 'utf-8' })
      this.streams.set(filename, stream)
    }
    
    stream.write(content)
    return filepath
  }

  /**
   * Close a specific log stream. Call when done writing to a log file.
   */
  closeStream(filename: string): void {
    const stream = this.streams.get(filename)
    if (stream) {
      stream.end()
      this.streams.delete(filename)
    }
  }

  /**
   * Close all open streams. Call when done with the LogWriter.
   */
  closeAllStreams(): void {
    for (const [filename, stream] of this.streams) {
      stream.end()
      this.streams.delete(filename)
    }
  }

  /**
   * Flush and close all open streams, waiting for writes to complete.
   * Use this before process exit to ensure no logs are lost.
   */
  flushAllStreams(): Promise<void> {
    const promises: Promise<void>[] = []
    for (const [filename, stream] of this.streams) {
      promises.push(
        new Promise<void>((resolve, reject) => {
          stream.once('finish', resolve)
          stream.once('error', reject)
          stream.end()
        })
      )
      this.streams.delete(filename)
    }
    return Promise.all(promises).then(() => {})
  }

  /**
   * Flush and close a specific stream, waiting for writes to complete.
   */
  flushStream(filename: string): Promise<void> {
    const stream = this.streams.get(filename)
    if (!stream) {
      return Promise.resolve()
    }
    this.streams.delete(filename)
    return new Promise<void>((resolve, reject) => {
      stream.once('finish', resolve)
      stream.once('error', reject)
      stream.end()
    })
  }

  writeToolCall(toolName: string, input: any, output: string): string {
    const metadata = {
      tool: toolName,
      input: JSON.stringify(input, null, 2),
      timestamp: new Date().toISOString(),
    }
    return this.writeLog(`tool-${toolName.toLowerCase()}`, output, metadata)
  }

  writeAgentResult(agentName: string, result: string): string {
    const metadata = {
      agent: agentName,
      timestamp: new Date().toISOString(),
    }
    return this.writeLog('agent-result', result, metadata)
  }

  writeError(error: Error | string): string {
    const content = error instanceof Error ? error.stack || error.message : error
    const metadata = {
      timestamp: new Date().toISOString(),
    }
    return this.writeLog('error', content, metadata)
  }

  getLogDir(): string {
    return this.logDir
  }

  getSessionId(): string {
    return this.sessionId
  }
}

```

## `src/reactive-sqlite/row-tracking.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/reactive-sqlite/hooks.ts`

```typescript
/**
 * React hooks for reactive SQLite queries
 *
 * Re-exports from hooks folder for backward compatibility
 */

export { useQuery, useMutation, useQueryOne, useQueryValue } from './hooks/index.js'

```

## `src/reactive-sqlite/index.ts`

```typescript
/**
 * Reactive SQLite for React (Bun)
 *
 * A lightweight reactive wrapper around bun:sqlite with React hooks.
 *
 * @example
 * ```tsx
 * import { ReactiveDatabase, useQuery, useMutation } from './reactive-sqlite'
 *
 * const db = new ReactiveDatabase('mydb.sqlite')
 *
 * // Initialize schema
 * db.exec(`
 *   CREATE TABLE IF NOT EXISTS users (
 *     id INTEGER PRIMARY KEY AUTOINCREMENT,
 *     name TEXT NOT NULL,
 *     active INTEGER DEFAULT 1
 *   )
 * `)
 *
 * function MyComponent() {
 *   const { data: users } = useQuery(db, 'SELECT * FROM users WHERE active = ?', [1])
 *   const { mutate: addUser } = useMutation(db, 'INSERT INTO users (name) VALUES (?)')
 *
 *   return (
 *     <div>
 *       {users.map(u => <div key={u.id}>{u.name}</div>)}
 *       <button onClick={() => addUser('New User')}>Add User</button>
 *     </div>
 *   )
 * }
 * ```
 */

// Database
export { ReactiveDatabase, createReactiveDatabase } from './database.js'

// Hooks
export { useQuery, useQueryOne, useQueryValue, useMutation } from './hooks.js'

// Parser utilities
export { extractReadTables, extractWriteTables, isWriteOperation, extractAllTables } from './parser.js'

// Types
export type {
  QuerySubscription,
  SubscriptionCallback,
  QueryState,
  MutationState,
  UseQueryResult,
  UseMutationResult,
  UseQueryOptions,
  UseMutationOptions,
  ReactiveDatabaseConfig,
  DatabaseEvent,
  DatabaseEventType,
} from './types.js'

```

## `src/reactive-sqlite/database.ts`

```typescript
/**
 * ReactiveDatabase - A reactive wrapper around bun:sqlite
 *
 * Provides automatic query invalidation when data changes.
 */

import { Database } from "bun:sqlite";
import {
  extractReadTables,
  extractWriteTables,
  isWriteOperation,
  extractRowFilter,
} from "./parser.js";
import type {
  QuerySubscription,
  SubscriptionCallback,
  ReactiveDatabaseConfig,
  RowFilter,
} from "./types.js";

/**
 * ReactiveDatabase wraps bun:sqlite with reactive subscriptions
 *
 * @example
 * ```ts
 * const db = new ReactiveDatabase({ path: 'mydb.sqlite' })
 *
 * // Execute schema
 * db.exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)`)
 *
 * // Query with auto-tracking
 * const users = db.query('SELECT * FROM users').all()
 *
 * // Mutations auto-invalidate
 * db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
 * ```
 */
export class ReactiveDatabase {
  private db: Database;
  private subscriptions: Map<string, QuerySubscription> = new Map();
  private nextSubscriptionId = 0;
  private closed = false;

  constructor(config: ReactiveDatabaseConfig | string) {
    const options = typeof config === "string" ? { path: config } : config;

    this.db = new Database(options.path, {
      create: options.create ?? true,
      readonly: options.readonly ?? false,
    });

    // Enable WAL mode for better concurrent performance
    this.db.exec("PRAGMA journal_mode = WAL");
  }

  /**
   * Get the underlying bun:sqlite Database instance
   */
  get raw(): Database {
    return this.db;
  }

  /**
   * Execute raw SQL (for schema, pragmas, etc.)
   */
  exec(sql: string): void {
    this.db.exec(sql);

    // Check if this affects any tables
    if (isWriteOperation(sql)) {
      const tables = extractWriteTables(sql);
      if (tables.length > 0) {
        this.invalidate(tables);
      }
    }
  }

  /**
   * Prepare a statement for repeated execution
   */
  prepare<T = unknown>(sql: string) {
    return this.db.prepare<T, any[]>(sql);
  }

  /**
   * Run a write operation (INSERT, UPDATE, DELETE)
   * Auto-invalidates affected queries with row-level granularity when possible
   */
  run(
    sql: string,
    params: any[] = [],
  ): Database["run"] extends (...args: any[]) => infer R ? R : never {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);

    // Auto-invalidate affected tables
    const tables = extractWriteTables(sql);
    if (tables.length > 0) {
      // Try to extract row filter for fine-grained invalidation
      const rowFilter = extractRowFilter(sql, params);

      if (rowFilter) {
        // Row-level invalidation - only notify subscriptions for this specific row
        this.invalidateWithRowFilter(tables, rowFilter);
      } else {
        // Fall back to table-level invalidation
        this.invalidate(tables);
      }
    }

    return result as any;
  }

  /**
   * Execute a query and return all rows
   */
  query<T = Record<string, unknown>>(sql: string, params: any[] = []): T[] {
    const stmt = this.db.prepare<T, any[]>(sql);
    return stmt.all(...params);
  }

  /**
   * Execute a query and return the first row
   */
  queryOne<T = Record<string, unknown>>(
    sql: string,
    params: any[] = [],
  ): T | null {
    const stmt = this.db.prepare<T, any[]>(sql);
    return stmt.get(...params) ?? null;
  }

  /**
   * Execute a query and return a single value
   */
  queryValue<T = unknown>(sql: string, params: any[] = []): T | null {
    const row = this.queryOne<Record<string, T>>(sql, params);
    if (!row) return null;
    const values = Object.values(row);
    return values[0] ?? null;
  }

  /**
   * Subscribe to changes on specific tables
   * Returns unsubscribe function
   */
  subscribe(tables: string[], callback: SubscriptionCallback): () => void {
    const id = String(this.nextSubscriptionId++);
    const subscription: QuerySubscription = {
      id,
      tables: new Set(tables.map((t) => t.toLowerCase())),
      callback,
    };

    this.subscriptions.set(id, subscription);

    return () => {
      this.subscriptions.delete(id);
    };
  }

  /**
   * Subscribe to a specific query
   * Automatically detects which tables are involved
   */
  subscribeQuery(sql: string, callback: SubscriptionCallback): () => void {
    const tables = extractReadTables(sql);
    return this.subscribe(tables, callback);
  }

  /**
   * Subscribe to a query with row-level filtering
   * Only triggers when the specific row is modified
   */
  subscribeWithRowFilter(
    sql: string,
    params: unknown[],
    callback: SubscriptionCallback
  ): () => void {
    const id = String(this.nextSubscriptionId++);
    const tables = extractReadTables(sql);
    const rowFilter = extractRowFilter(sql, params);

    const subscription: QuerySubscription = {
      id,
      tables: new Set(tables.map((t) => t.toLowerCase())),
      ...(rowFilter && { rowFilters: [rowFilter] }),
      callback,
    };

    this.subscriptions.set(id, subscription);

    return () => {
      this.subscriptions.delete(id);
    };
  }

  /**
   * Invalidate subscriptions for specific rows
   */
  invalidateRows(
    table: string,
    column: string,
    values: (string | number)[]
  ): void {
    const normalizedTable = table.toLowerCase();
    const normalizedColumn = column.toLowerCase();
    const valueSet = new Set(values.map(v => String(v)));

    for (const subscription of this.subscriptions.values()) {
      // Check if subscription is for this table
      if (!subscription.tables.has(normalizedTable)) {
        continue;
      }

      // If subscription has row filters, check if any match
      if (subscription.rowFilters && subscription.rowFilters.length > 0) {
        const matches = subscription.rowFilters.some(
          (filter) =>
            filter.table.toLowerCase() === normalizedTable &&
            filter.column.toLowerCase() === normalizedColumn &&
            valueSet.has(String(filter.value))
        );

        if (matches) {
          subscription.callback();
        }
      } else {
        // No row filters - this is a table-level subscription, trigger it
        subscription.callback();
      }
    }
  }

  /**
   * Invalidate with row filter - triggers row-level subscriptions that match
   * and falls back to table-level for subscriptions without row filters
   */
  private invalidateWithRowFilter(tables: string[], rowFilter: RowFilter): void {
    const normalizedTables = tables.map((t) => t.toLowerCase());

    for (const subscription of this.subscriptions.values()) {
      // Check if subscription depends on any of the invalidated tables
      let affectedTable: string | null = null;
      for (const table of normalizedTables) {
        if (subscription.tables.has(table)) {
          affectedTable = table;
          break;
        }
      }

      if (!affectedTable) {
        continue;
      }

      // If subscription has row filters, check if this row filter matches
      if (subscription.rowFilters && subscription.rowFilters.length > 0) {
        const matches = subscription.rowFilters.some(
          (filter) =>
            filter.table.toLowerCase() === rowFilter.table.toLowerCase() &&
            filter.column.toLowerCase() === rowFilter.column.toLowerCase() &&
            String(filter.value) === String(rowFilter.value)
        );

        if (matches) {
          subscription.callback();
        }
      } else {
        // No row filters - this is a table-level subscription, always trigger
        subscription.callback();
      }
    }
  }

  /**
   * Invalidate queries that depend on the given tables
   * If no tables specified, invalidates all queries
   */
  invalidate(tables?: string[]): void {
    const normalizedTables = tables?.map((t) => t.toLowerCase());

    for (const subscription of this.subscriptions.values()) {
      if (!normalizedTables) {
        // Invalidate all
        subscription.callback();
      } else {
        // Check if subscription depends on any of the invalidated tables
        for (const table of normalizedTables) {
          if (subscription.tables.has(table)) {
            subscription.callback();
            break;
          }
        }
      }
    }
  }

  /**
   * Run a function in a transaction
   */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (!this.closed) {
      this.subscriptions.clear();
      this.db.close();
      this.closed = true;
    }
  }

  /**
   * Check if database is closed
   */
  get isClosed(): boolean {
    return this.closed;
  }
}

/**
 * Create a new ReactiveDatabase instance
 */
export function createReactiveDatabase(
  config: ReactiveDatabaseConfig | string,
): ReactiveDatabase {
  return new ReactiveDatabase(config);
}

```

## `src/reactive-sqlite/types.ts`

```typescript
/**
 * Types for the reactive SQLite library
 */

/**
 * Subscription callback type
 */
export type SubscriptionCallback = () => void

/**
 * Row filter for fine-grained invalidation
 */
export interface RowFilter {
  /** Table name */
  table: string
  /** Column used for filtering (e.g., 'id') */
  column: string
  /** Value to match */
  value: string | number
}

/**
 * Query subscription info
 */
export interface QuerySubscription {
  id: string
  tables: Set<string>
  /** Optional row-level filters for fine-grained invalidation */
  rowFilters?: RowFilter[]
  callback: SubscriptionCallback
}

/**
 * Query result state
 */
export interface QueryState<T> {
  data: T[]
  isLoading: boolean
  error: Error | null
}

/**
 * Mutation result state
 */
export interface MutationState {
  isLoading: boolean
  error: Error | null
}

/**
 * useQuery return type
 */
export interface UseQueryResult<T> extends QueryState<T> {
  refetch: () => void
}

/**
 * useMutation return type
 */
export interface UseMutationResult<TParams extends any[] = any[]> extends MutationState {
  mutate: (...params: TParams) => void
  mutateAsync: (...params: TParams) => Promise<void>
}

/**
 * Options for useQuery
 */
export interface UseQueryOptions {
  /** Whether to skip the query */
  skip?: boolean
  /** Additional dependencies that trigger re-fetch */
  deps?: any[]
}

/**
 * Options for useMutation
 */
export interface UseMutationOptions {
  /** Tables to invalidate after mutation (auto-detected if not provided) */
  invalidateTables?: string[]
  /** Callback after successful mutation */
  onSuccess?: () => void
  /** Callback after failed mutation */
  onError?: (error: Error) => void
}

/**
 * ReactiveDatabase configuration
 */
export interface ReactiveDatabaseConfig {
  /** Path to SQLite database file (use ':memory:' for in-memory) */
  path: string
  /** Whether to create the database if it doesn't exist */
  create?: boolean
  /** Whether to open in read-only mode */
  readonly?: boolean
}

/**
 * Event types for database changes
 */
export type DatabaseEventType = 'insert' | 'update' | 'delete' | 'invalidate'

/**
 * Database change event
 */
export interface DatabaseEvent {
  type: DatabaseEventType
  tables: string[]
}

```

## `src/reactive-sqlite/database.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/reactive-sqlite/parser.ts`

```typescript
/**
 * Simple SQL parser for extracting table names
 *
 * This is a lightweight parser that extracts table names from common SQL patterns.
 * It doesn't need to be a full SQL parser - just enough to track dependencies.
 */

/**
 * Extract table names that are being READ from a SELECT query
 */
export function extractReadTables(sql: string): string[] {
  const tables = new Set<string>()
  const normalized = sql
    .replace(/--.*$/gm, '') // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
    .toLowerCase()

  // FROM clause: FROM table_name, FROM table_name AS alias
  const fromRegex = /\bfrom\s+([a-z_][a-z0-9_]*)/gi
  let match
  while ((match = fromRegex.exec(normalized)) !== null) {
    tables.add(match[1]!)
  }

  // JOIN clauses: JOIN table_name, LEFT JOIN table_name, etc.
  const joinRegex = /\bjoin\s+([a-z_][a-z0-9_]*)/gi
  while ((match = joinRegex.exec(normalized)) !== null) {
    tables.add(match[1]!)
  }

  // Subqueries in FROM (simplified - just look for nested FROM)
  // This is intentionally simple; complex subqueries will still work
  // because the outer FROM is captured

  return Array.from(tables)
}

/**
 * Extract table names that are being WRITTEN to (INSERT, UPDATE, DELETE)
 */
export function extractWriteTables(sql: string): string[] {
  const tables = new Set<string>()
  const normalized = sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

  // INSERT INTO table_name
  const insertRegex = /\binsert\s+(?:or\s+\w+\s+)?into\s+([a-z_][a-z0-9_]*)/gi
  let match
  while ((match = insertRegex.exec(normalized)) !== null) {
    tables.add(match[1]!)
  }

  // UPDATE table_name
  const updateRegex = /\bupdate\s+(?:or\s+\w+\s+)?([a-z_][a-z0-9_]*)/gi
  while ((match = updateRegex.exec(normalized)) !== null) {
    tables.add(match[1]!)
  }

  // DELETE FROM table_name
  const deleteRegex = /\bdelete\s+from\s+([a-z_][a-z0-9_]*)/gi
  while ((match = deleteRegex.exec(normalized)) !== null) {
    tables.add(match[1]!)
  }

  // CREATE TABLE table_name
  const createRegex = /\bcreate\s+(?:temp\s+|temporary\s+)?table\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi
  while ((match = createRegex.exec(normalized)) !== null) {
    tables.add(match[1]!)
  }

  // DROP TABLE table_name
  const dropRegex = /\bdrop\s+table\s+(?:if\s+exists\s+)?([a-z_][a-z0-9_]*)/gi
  while ((match = dropRegex.exec(normalized)) !== null) {
    tables.add(match[1]!)
  }

  // ALTER TABLE table_name
  const alterRegex = /\balter\s+table\s+([a-z_][a-z0-9_]*)/gi
  while ((match = alterRegex.exec(normalized)) !== null) {
    tables.add(match[1]!)
  }

  return Array.from(tables)
}

/**
 * Determine if a SQL statement is a read or write operation
 */
export function isWriteOperation(sql: string): boolean {
  const normalized = sql.trim().toLowerCase()
  return (
    normalized.startsWith('insert') ||
    normalized.startsWith('update') ||
    normalized.startsWith('delete') ||
    normalized.startsWith('create') ||
    normalized.startsWith('drop') ||
    normalized.startsWith('alter') ||
    normalized.startsWith('replace')
  )
}

/**
 * Extract all tables from a SQL statement (both read and write)
 */
export function extractAllTables(sql: string): { read: string[]; write: string[] } {
  return {
    read: extractReadTables(sql),
    write: extractWriteTables(sql),
  }
}

/**
 * Row filter result for fine-grained invalidation
 */
export interface RowFilter {
  table: string
  column: string
  value: string | number
}

/**
 * Extract row filter from simple WHERE clauses
 *
 * Only extracts filters from simple equality conditions like:
 * - WHERE id = ?
 * - WHERE id = 123
 * - WHERE user_id = ? AND ...
 *
 * Returns null for complex conditions (OR, IN, LIKE, subqueries, etc.)
 */
export function extractRowFilter(sql: string, params: unknown[] = []): RowFilter | null {
  const normalized = sql
    .replace(/--.*$/gm, '') // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()

  // Don't process INSERT statements (no row filter possible)
  if (/^\s*insert/i.test(normalized)) {
    return null
  }

  // Check for OR conditions - these are too complex for simple row filtering
  if (/\bwhere\b.*\bor\b/i.test(normalized)) {
    return null
  }

  // Check for subqueries
  if (/\bwhere\b.*\b(in|exists)\s*\(/i.test(normalized)) {
    return null
  }

  // Check for LIKE conditions
  if (/\bwhere\b.*\blike\b/i.test(normalized)) {
    return null
  }

  // Check for range/comparison operators (>, <, >=, <=, <>)
  if (/\bwhere\b[^=]*[<>]/i.test(normalized)) {
    return null
  }

  // Extract table name from UPDATE, DELETE, or SELECT
  let table: string | null = null

  // UPDATE table SET ... WHERE
  const updateMatch = normalized.match(/\bupdate\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))/i)
  if (updateMatch && (updateMatch[1] || updateMatch[2])) {
    table = (updateMatch[1] || updateMatch[2])!.toLowerCase()
  }

  // DELETE FROM table WHERE
  const deleteMatch = normalized.match(/\bdelete\s+from\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))/i)
  if (deleteMatch && (deleteMatch[1] || deleteMatch[2])) {
    table = (deleteMatch[1] || deleteMatch[2])!.toLowerCase()
  }

  // SELECT ... FROM table WHERE
  const selectMatch = normalized.match(/\bfrom\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))/i)
  if (selectMatch && !table && (selectMatch[1] || selectMatch[2])) {
    table = (selectMatch[1] || selectMatch[2])!.toLowerCase()
  }

  if (!table) {
    return null
  }

  // Extract WHERE clause
  const whereMatch = normalized.match(/\bwhere\s+(.+?)(?:\s+(?:order|group|limit|having)\b|$)/i)
  if (!whereMatch || !whereMatch[1]) {
    return null
  }

  const whereClause = whereMatch[1]

  // For AND conditions, take the first condition for row-level filtering
  // (Note: This may miss invalidations for other columns in AND clauses)
  const conditions = whereClause.split(/\band\b/i)
  if (!conditions[0]) {
    return null
  }
  const firstCondition = conditions[0].trim()

  // Match simple equality: column = ? or column = value
  // Handle quoted identifiers
  const equalityMatch = firstCondition.match(
    /^(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s*=\s*(.+)$/i
  )

  if (!equalityMatch || !equalityMatch[3]) {
    return null
  }

  const column = ((equalityMatch[1] || equalityMatch[2]) || '').toLowerCase()
  const valueExpr = equalityMatch[3].trim()

  // Determine the value
  let value: string | number

  if (valueExpr === '?') {
    // Parameterized query - need to figure out which param
    // Count ? before the WHERE clause to find the right param index
    const beforeWhere = normalized.substring(0, normalized.toLowerCase().indexOf('where'))
    const paramsBefore = (beforeWhere.match(/\?/g) || []).length

    // For AND conditions, count ? in conditions before this one
    // (but for the first condition, it's just paramsBefore)
    const paramIndex = paramsBefore

    if (paramIndex >= params.length) {
      return null
    }

    value = params[paramIndex] as string | number
  } else {
    // Literal value - parse it
    // Try numeric
    const numMatch = valueExpr.match(/^(\d+)$/)
    if (numMatch && numMatch[1]) {
      value = parseInt(numMatch[1], 10)
    } else {
      // Try quoted string
      const strMatch = valueExpr.match(/^['"](.+)['"]$/)
      if (strMatch && strMatch[1]) {
        value = strMatch[1]
      } else {
        // Unquoted string or other literal
        value = valueExpr
      }
    }
  }

  return {
    table,
    column,
    value
  }
}

```

## `src/reactive-sqlite/parser.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/commands/db/recovery-view.ts`

```typescript
// Recovery view for database inspection

interface IncompleteExecution {
  id: string
  name?: string
  file_path: string
  started_at?: string
}

interface Transition {
  created_at: string
  key: string
  new_value: unknown
}

export async function showRecovery(db: any) {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('CRASH RECOVERY')
  console.log('═══════════════════════════════════════════════════════════')
  console.log('')

  const incomplete: IncompleteExecution | null = await db.execution.findIncomplete()

  if (!incomplete) {
    console.log('  ✓ No incomplete executions found')
    console.log('  No recovery needed')
    console.log('')
    return
  }

  console.log('  ⚠️  Found incomplete execution!')
  console.log('')
  console.log(`  Name: ${incomplete.name || 'Unnamed'}`)
  console.log(`  ID: ${incomplete.id}`)
  console.log(`  File: ${incomplete.file_path}`)
  console.log(`  Started: ${new Date(incomplete.started_at!).toLocaleString()}`)
  console.log('')

  // Get last known state
  const state = await db.state.getAll()
  console.log('  Last Known State:')
  for (const [key, value] of Object.entries(state)) {
    console.log(`    ${key}: ${JSON.stringify(value)}`)
  }
  console.log('')

  // Get transition history
  const transitions: Transition[] = await db.state.history(undefined, 5)
  console.log(`  Last ${transitions.length} Transitions:`)
  for (const t of transitions) {
    console.log(`    ${new Date(t.created_at).toLocaleString()}: ${t.key} = ${JSON.stringify(t.new_value)}`)
  }
  console.log('')

  console.log('  Recovery Options:')
  console.log('    1. Resume from last state (if possible)')
  console.log('    2. Restart from beginning')
  console.log('    3. Mark as failed and start new execution')
  console.log('')
}

```

## `src/commands/db/state-view.ts`

```typescript
// State view for database inspection

export async function showState(db: any) {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('CURRENT STATE')
  console.log('═══════════════════════════════════════════════════════════')
  console.log('')

  const state = await db.state.getAll()

  if (Object.keys(state).length === 0) {
    console.log('  (empty state)')
  } else {
    for (const [key, value] of Object.entries(state)) {
      console.log(`  ${key}:`, JSON.stringify(value, null, 2).split('\n').join('\n    '))
    }
  }

  console.log('')
}

```

## `src/commands/db/memories-view.ts`

```typescript
// Memories view for database inspection

interface MemoryStats {
  total: number
  byCategory: Record<string, number>
  byScope: Record<string, number>
}

interface Memory {
  category: string
  key: string
  content: string
  confidence: number
  source?: string
}

export async function showMemories(db: any) {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('MEMORIES')
  console.log('═══════════════════════════════════════════════════════════')
  console.log('')

  const stats: MemoryStats = await db.memories.stats()

  console.log(`  Total: ${stats.total}`)
  console.log('')

  console.log('  By Category:')
  for (const [category, count] of Object.entries(stats.byCategory)) {
    console.log(`    ${category}: ${count}`)
  }
  console.log('')

  console.log('  By Scope:')
  for (const [scope, count] of Object.entries(stats.byScope)) {
    console.log(`    ${scope}: ${count}`)
  }
  console.log('')

  // Show recent memories
  const recent: Memory[] = await db.memories.list(undefined, undefined, 5)

  if (recent.length > 0) {
    console.log('  Recent Memories:')
    console.log('')

    for (const m of recent) {
      console.log(`    [${m.category}] ${m.key}`)
      console.log(`      ${m.content.substring(0, 100)}${m.content.length > 100 ? '...' : ''}`)
      console.log(`      Confidence: ${m.confidence}, Source: ${m.source || 'unknown'}`)
      console.log('')
    }
  }
}

```

## `src/commands/db/transitions-view.ts`

```typescript
// Transitions view for database inspection

interface Transition {
  created_at: string
  key: string
  old_value: unknown
  new_value: unknown
  trigger?: string
}

export async function showTransitions(db: any) {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('STATE TRANSITIONS (last 20)')
  console.log('═══════════════════════════════════════════════════════════')
  console.log('')

  const transitions: Transition[] = await db.state.history(undefined, 20)

  if (transitions.length === 0) {
    console.log('  (no transitions)')
  } else {
    for (const t of transitions) {
      const time = new Date(t.created_at).toLocaleString()
      const oldVal = t.old_value ? JSON.stringify(t.old_value) : 'null'
      const newVal = JSON.stringify(t.new_value)
      const trigger = t.trigger || 'unknown'

      console.log(`  [${time}] ${t.key}`)
      console.log(`    ${oldVal} → ${newVal}`)
      console.log(`    Trigger: ${trigger}`)
      console.log('')
    }
  }
}

```

## `src/commands/db/index.ts`

```typescript
// Database inspection command - main dispatcher

import { createSmithersDB } from '../../db/index.js'
import { showState } from './state-view.js'
import { showTransitions } from './transitions-view.js'
import { showExecutions } from './executions-view.js'
import { showMemories } from './memories-view.js'
import { showStats } from './stats-view.js'
import { showCurrent } from './current-view.js'
import { showRecovery } from './recovery-view.js'
import { showHelp } from './help.js'

interface DbOptions {
  path?: string
}

export async function dbCommand(subcommand: string | undefined, options: DbOptions = {}) {
  if (!subcommand) {
    showHelp()
    return
  }

  const dbPath = options.path || '.smithers/data'

  console.log(`📊 Smithers Database Inspector`)
  console.log(`   Database: ${dbPath}`)
  console.log('')

  const db = await createSmithersDB({ path: dbPath })

  try {
    switch (subcommand) {
      case 'state':
        await showState(db)
        break

      case 'transitions':
        await showTransitions(db)
        break

      case 'executions':
        await showExecutions(db)
        break

      case 'memories':
        await showMemories(db)
        break

      case 'stats':
        await showStats(db)
        break

      case 'current':
        await showCurrent(db)
        break

      case 'recovery':
        await showRecovery(db)
        break

      default:
        showHelp()
    }
  } finally {
    await db.close()
  }
}

// Re-export all view functions for direct access
export { showState } from './state-view.js'
export { showTransitions } from './transitions-view.js'
export { showExecutions } from './executions-view.js'
export { showMemories } from './memories-view.js'
export { showStats } from './stats-view.js'
export { showCurrent } from './current-view.js'
export { showRecovery } from './recovery-view.js'
export { showHelp } from './help.js'

```

## `src/commands/db/stats-view.ts`

```typescript
// Stats view for database inspection

export async function showStats(db: any) {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('DATABASE STATISTICS')
  console.log('═══════════════════════════════════════════════════════════')
  console.log('')

  const tables = [
    'executions',
    'phases',
    'agents',
    'tool_calls',
    'memories',
    'state',
    'transitions',
    'artifacts',
  ]

  for (const table of tables) {
    const result = await db.query(
      `SELECT COUNT(*) as count FROM ${table}`
    ) as Array<{ count: number }>
    const count = result[0]?.count || 0
    console.log(`  ${table.padEnd(15)}: ${count}`)
  }

  console.log('')
}

```

## `src/commands/db/executions-view.ts`

```typescript
// Executions view for database inspection

interface Execution {
  id: string
  name?: string
  status: string
  file_path: string
  started_at?: string
  completed_at?: string
  total_agents: number
  total_tool_calls: number
  total_tokens_used: number
  error?: string
}

export async function showExecutions(db: any) {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('RECENT EXECUTIONS (last 10)')
  console.log('═══════════════════════════════════════════════════════════')
  console.log('')

  const executions: Execution[] = await db.execution.list(10)

  if (executions.length === 0) {
    console.log('  (no executions)')
  } else {
    for (const exec of executions) {
      const status = exec.status.toUpperCase()
      const symbol = status === 'COMPLETED' ? '✓' : status === 'FAILED' ? '✗' : '●'

      console.log(`  ${symbol} ${exec.name || 'Unnamed'}`)
      console.log(`    ID: ${exec.id}`)
      console.log(`    Status: ${status}`)
      console.log(`    File: ${exec.file_path}`)

      if (exec.started_at) {
        console.log(`    Started: ${new Date(exec.started_at).toLocaleString()}`)
      }

      if (exec.completed_at) {
        const duration =
          new Date(exec.completed_at).getTime() - new Date(exec.started_at!).getTime()
        console.log(`    Duration: ${duration}ms`)
      }

      console.log(`    Agents: ${exec.total_agents}, Tools: ${exec.total_tool_calls}, Tokens: ${exec.total_tokens_used}`)

      if (exec.error) {
        console.log(`    Error: ${exec.error}`)
      }

      console.log('')
    }
  }
}

```

## `src/commands/db/help.ts`

```typescript
// Help display for database inspection command

export function showHelp() {
  console.log('Usage: smithers db <subcommand> [options]')
  console.log('')
  console.log('Subcommands:')
  console.log('  state        Show current state')
  console.log('  transitions  Show state transition history')
  console.log('  executions   Show recent executions')
  console.log('  memories     Show memories')
  console.log('  stats        Show database statistics')
  console.log('  current      Show current execution details')
  console.log('  recovery     Check for incomplete executions (crash recovery)')
  console.log('')
  console.log('Options:')
  console.log('  --path <path>  Database path (default: .smithers/data)')
  console.log('')
}

```

## `src/commands/db/current-view.ts`

```typescript
// Current execution view for database inspection

interface Execution {
  id: string
  name?: string
  status: string
  file_path: string
}

interface Phase {
  name: string
  iteration: number
  status: string
}

interface Agent {
  id: string
  model: string
  status: string
  prompt: string
}

interface ToolCall {
  tool_name: string
  status: string
}

export async function showCurrent(db: any) {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('CURRENT EXECUTION')
  console.log('═══════════════════════════════════════════════════════════')
  console.log('')

  const execution: Execution | null = await db.execution.current()

  if (!execution) {
    console.log('  (no active execution)')
    console.log('')
    return
  }

  console.log(`  Name: ${execution.name || 'Unnamed'}`)
  console.log(`  ID: ${execution.id}`)
  console.log(`  Status: ${execution.status.toUpperCase()}`)
  console.log(`  File: ${execution.file_path}`)
  console.log('')

  // Show current phase
  const phase: Phase | null = await db.phases.current()
  if (phase) {
    console.log(`  Current Phase: ${phase.name} (iteration ${phase.iteration})`)
    console.log(`  Phase Status: ${phase.status.toUpperCase()}`)
    console.log('')
  }

  // Show current agent
  const agent: Agent | null = await db.agents.current()
  if (agent) {
    console.log(`  Current Agent: ${agent.model}`)
    console.log(`  Agent Status: ${agent.status.toUpperCase()}`)
    console.log(`  Prompt: ${agent.prompt.substring(0, 100)}...`)
    console.log('')
  }

  // Show recent tool calls
  if (agent) {
    const tools: ToolCall[] = await db.tools.list(agent.id)
    if (tools.length > 0) {
      console.log(`  Recent Tool Calls (${tools.length}):`)
      for (const tool of tools.slice(-5)) {
        console.log(`    - ${tool.tool_name} (${tool.status})`)
      }
      console.log('')
    }
  }

  // Show state
  const state = await db.state.getAll()
  console.log('  State:')
  for (const [key, value] of Object.entries(state)) {
    console.log(`    ${key}: ${JSON.stringify(value)}`)
  }
  console.log('')
}

```

## `src/utils/structured-output/validator.ts`

```typescript
// Output Parsing and Validation
// Parse and validate LLM output against Zod schemas

import { z } from 'zod'
import type { ParseResult } from './types.js'

/**
 * Extract JSON from text that may contain markdown code blocks or other content
 */
export function extractJson(text: string): string | null {
  // Try to find JSON in code blocks first
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch && codeBlockMatch[1]) {
    return codeBlockMatch[1].trim()
  }

  // Try to find raw JSON (object or array)
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
  if (jsonMatch && jsonMatch[1]) {
    return jsonMatch[1].trim()
  }

  // If the entire text looks like JSON, return it
  const trimmed = text.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return trimmed
  }

  return null
}

/**
 * Parse and validate output against a Zod schema
 */
export function parseStructuredOutput<T extends z.ZodType>(
  output: string,
  schema: T
): ParseResult<z.infer<T>> {
  // Extract JSON from the output
  const jsonStr = extractJson(output)

  if (!jsonStr) {
    return {
      success: false,
      error: 'No valid JSON found in output. The response should contain a JSON object or array.',
      rawOutput: output,
    }
  }

  // Try to parse as JSON
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch (e) {
    return {
      success: false,
      error: `Invalid JSON syntax: ${e instanceof Error ? e.message : String(e)}`,
      rawOutput: output,
    }
  }

  // Validate against the schema
  const result = schema.safeParse(parsed)

  if (!result.success) {
    // Zod 4 uses 'issues'
    const issues = result.error?.issues || []
    const errorMessages = issues
      .map((issue: any) => `- ${(issue.path || []).join('.')}: ${issue.message}`)
      .join('\n')

    return {
      success: false,
      error: `Schema validation failed:\n${errorMessages || 'Unknown validation error'}`,
      rawOutput: output,
    }
  }

  return {
    success: true,
    data: result.data,
    rawOutput: output,
  }
}

```

## `src/utils/structured-output/index.ts`

```typescript
// Structured Output Utilities - Barrel Export
// Re-exports all structured output utilities

// Types
export type { StructuredOutputConfig, ParseResult } from './types.js'

// Zod to JSON Schema conversion
export { zodToJsonSchema, convertZodType, schemaToPromptDescription } from './zod-converter.js'

// Validation and parsing
export { extractJson, parseStructuredOutput } from './validator.js'

// Prompt generation
export { generateStructuredOutputPrompt, generateRetryPrompt } from './prompt-generator.js'

```

## `src/utils/structured-output/validator.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/utils/structured-output/zod-converter.ts`

```typescript
// Zod to JSON Schema Conversion
// Converts Zod schemas to JSON schema representation for prompts

import { z } from 'zod'

/**
 * Convert a Zod schema to a JSON schema representation for prompts.
 * Uses Zod 4's built-in toJSONSchema() method.
 */
export function zodToJsonSchema(schema: z.ZodType): Record<string, any> {
  // Zod 4 has a built-in toJSONSchema method
  if (typeof (schema as any).toJSONSchema === 'function') {
    const jsonSchema = (schema as any).toJSONSchema()
    // Remove $schema to keep it cleaner for prompts
    const { $schema: _$schema, ...rest } = jsonSchema
    return rest
  }

  // Fallback for older Zod versions or edge cases
  return convertZodType(schema)
}

export function convertZodType(schema: z.ZodType): Record<string, any> {
  // Zod 4 uses schema._def.type or schema.type directly
  const def = (schema as any)._def || (schema as any).def || {}
  const type = def.type || (schema as any).type

  // Handle object type
  if (type === 'object') {
    const shape = typeof def.shape === 'function' ? def.shape() : def.shape || {}
    const properties: Record<string, any> = {}
    const required: string[] = []

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = convertZodType(value as z.ZodType)

      // Check if field is optional (Zod 4 uses isOptional method)
      const isOptional = typeof (value as any).isOptional === 'function'
        ? (value as any).isOptional()
        : (value as any)._def?.type === 'optional'

      if (!isOptional) {
        required.push(key)
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    }
  }

  // Handle array type
  if (type === 'array') {
    const itemType = def.element || def.type
    return {
      type: 'array',
      items: itemType ? convertZodType(itemType) : {},
    }
  }

  // Handle string type
  if (type === 'string') {
    const result: Record<string, any> = { type: 'string' }
    if ((schema as any)['minLength']) result['minLength'] = (schema as any)['minLength']
    if ((schema as any)['maxLength']) result['maxLength'] = (schema as any)['maxLength']
    if ((schema as any)['format']) result['format'] = (schema as any)['format']
    return result
  }

  // Handle number type
  if (type === 'number') {
    return { type: 'number' }
  }

  // Handle boolean type
  if (type === 'boolean') {
    return { type: 'boolean' }
  }

  // Handle null type
  if (type === 'null') {
    return { type: 'null' }
  }

  // Handle enum type
  if (type === 'enum') {
    return { enum: def.values || [] }
  }

  // Handle literal type
  if (type === 'literal') {
    return { const: def.value }
  }

  // Handle union type
  if (type === 'union') {
    const options = def.options || []
    return {
      oneOf: options.map((opt: z.ZodType) => convertZodType(opt)),
    }
  }

  // Handle optional type
  if (type === 'optional') {
    return convertZodType(def.innerType || def.wrapped)
  }

  // Handle nullable type
  if (type === 'nullable') {
    const inner = convertZodType(def.innerType || def.wrapped)
    return { oneOf: [inner, { type: 'null' }] }
  }

  // Default fallback
  return {}
}

/**
 * Generate a human-readable schema description for prompts
 */
export function schemaToPromptDescription(schema: z.ZodType): string {
  const jsonSchema = zodToJsonSchema(schema)
  return JSON.stringify(jsonSchema, null, 2)
}

```

## `src/utils/structured-output/types.ts`

```typescript
// Structured Output Types
// Type definitions for structured output parsing and validation

import { z } from 'zod'

export interface StructuredOutputConfig<T extends z.ZodType> {
  /** The Zod schema to validate against */
  schema: T
  /** Maximum retry attempts on validation failure */
  maxRetries?: number
  /** Custom error message prefix */
  errorPrefix?: string
}

export interface ParseResult<T> {
  success: boolean
  data?: T
  error?: string
  rawOutput: string
}

```

## `src/utils/structured-output/prompt-generator.ts`

```typescript
// Prompt Generation
// Generate prompts for structured output

import { z } from 'zod'
import { schemaToPromptDescription } from './zod-converter.js'

/**
 * Generate system prompt additions for structured output
 */
export function generateStructuredOutputPrompt(schema: z.ZodType): string {
  const jsonSchema = schemaToPromptDescription(schema)

  return `
IMPORTANT: Your response MUST be valid JSON that conforms to this schema:

\`\`\`json
${jsonSchema}
\`\`\`

Rules:
1. Output ONLY the JSON object/array, no other text
2. Do not wrap in markdown code blocks
3. Ensure all required fields are present
4. Use the exact field names and types specified
`
}

/**
 * Generate a retry prompt when validation fails
 */
export function generateRetryPrompt(
  originalOutput: string,
  validationError: string
): string {
  return `Your previous response did not match the required schema.

Previous output:
\`\`\`
${originalOutput.slice(0, 1000)}${originalOutput.length > 1000 ? '...(truncated)' : ''}
\`\`\`

Validation error:
${validationError}

Please provide a corrected response that matches the schema exactly. Output ONLY valid JSON.`
}

```

## `src/utils/structured-output/zod-converter.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/utils/vcs/git.ts`

```typescript
// Git operations
// Uses Bun.$ for command execution per CLAUDE.md

import { parseGitStatus } from './parsers.js'
import type { CommandResult, VCSStatus, DiffStats, CommitInfo } from './types.js'

const SMITHERS_NOTES_REF = 'refs/notes/smithers'

/**
 * Execute a git command
 */
export async function git(...args: string[]): Promise<CommandResult> {
  try {
    const result = await Bun.$`git ${args}`.quiet()
    return {
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    }
  } catch (error: any) {
    throw new Error(`git ${args.join(' ')} failed: ${error.stderr?.toString() || error.message}`)
  }
}

/**
 * Get current commit hash
 */
export async function getCommitHash(ref: string = 'HEAD'): Promise<string> {
  const result = await Bun.$`git rev-parse ${ref}`.text()
  return result.trim()
}

/**
 * Get commit information
 */
export async function getCommitInfo(ref: string = 'HEAD'): Promise<CommitInfo> {
  const hash = await Bun.$`git rev-parse ${ref}`.text()
  const author = await Bun.$`git log -1 --format=%an ${ref}`.text()
  const message = await Bun.$`git log -1 --format=%s ${ref}`.text()

  return {
    hash: hash.trim(),
    author: author.trim(),
    message: message.trim(),
  }
}

/**
 * Get diff statistics
 */
export async function getDiffStats(ref?: string): Promise<DiffStats> {
  const args = ref ? `${ref}...HEAD` : 'HEAD~1'
  const result = await Bun.$`git diff --numstat ${args}`.text()

  const files: string[] = []
  let insertions = 0
  let deletions = 0

  for (const line of result.split('\n')) {
    if (!line.trim()) continue

    const [ins, del, file] = line.split('\t')
    if (ins && del && file) {
      files.push(file)
      insertions += parseInt(ins) || 0
      deletions += parseInt(del) || 0
    }
  }

  return { files, insertions, deletions }
}

/**
 * Get git status
 */
export async function getGitStatus(): Promise<VCSStatus> {
  const result = await Bun.$`git status --porcelain`.text()
  return parseGitStatus(result)
}

/**
 * Add git notes with smithers metadata
 */
export async function addGitNotes(
  content: string,
  ref: string = 'HEAD',
  append: boolean = false
): Promise<void> {
  const flag = append ? 'append' : 'add'
  const forceFlag = append ? '' : '-f'

  try {
    await Bun.$`git notes --ref ${SMITHERS_NOTES_REF} ${flag} ${forceFlag} -m ${content} ${ref}`.quiet()
  } catch (error: any) {
    throw new Error(`Failed to ${flag} git notes: ${error.message}`)
  }
}

/**
 * Get git notes for a commit
 */
export async function getGitNotes(ref: string = 'HEAD'): Promise<string | null> {
  try {
    const result = await Bun.$`git notes --ref ${SMITHERS_NOTES_REF} show ${ref}`.text()
    return result.trim()
  } catch {
    return null
  }
}

/**
 * Check if git notes exist for a commit
 */
export async function hasGitNotes(ref: string = 'HEAD'): Promise<boolean> {
  const notes = await getGitNotes(ref)
  return notes !== null
}

/**
 * Check if we're in a git repository
 */
export async function isGitRepo(): Promise<boolean> {
  try {
    await Bun.$`git rev-parse --git-dir`.quiet()
    return true
  } catch {
    return false
  }
}

/**
 * Get current branch name (git)
 */
export async function getCurrentBranch(): Promise<string | null> {
  try {
    const result = await Bun.$`git branch --show-current`.text()
    return result.trim() || null
  } catch {
    return null
  }
}

```

## `src/utils/vcs/index.ts`

```typescript
// VCS utilities barrel export
// Re-exports all VCS functionality for convenient imports

// Types
export type {
  VCSStatus,
  DiffStats,
  CommitInfo,
  CommandResult,
  JJSnapshotResult,
  JJCommitResult,
} from './types.js'

// Parsers
export { parseGitStatus, parseJJStatus, parseDiffStats } from './parsers.js'

// Git operations
export {
  git,
  getCommitHash,
  getCommitInfo,
  getDiffStats,
  getGitStatus,
  addGitNotes,
  getGitNotes,
  hasGitNotes,
  isGitRepo,
  getCurrentBranch,
} from './git.js'

// Jujutsu operations
export {
  jj,
  getJJChangeId,
  jjSnapshot,
  jjCommit,
  getJJStatus,
  getJJDiffStats,
  isJJRepo,
} from './jj.js'

```

## `src/utils/vcs/parsers.ts`

```typescript
// Parser utilities for VCS output

import type { VCSStatus, DiffStats } from './types.js'

/**
 * Parse git status output
 */
export function parseGitStatus(output: string): VCSStatus {
  const modified: string[] = []
  const added: string[] = []
  const deleted: string[] = []

  for (const line of output.split('\n')) {
    if (!line.trim()) continue

    const status = line.substring(0, 2)
    const file = line.substring(3)

    if (status.includes('M')) modified.push(file)
    else if (status.includes('A')) added.push(file)
    else if (status.includes('D')) deleted.push(file)
  }

  return { modified, added, deleted }
}

/**
 * Parse JJ status output
 */
export function parseJJStatus(output: string): VCSStatus {
  const modified: string[] = []
  const added: string[] = []
  const deleted: string[] = []

  for (const line of output.split('\n')) {
    if (!line.trim()) continue

    if (line.startsWith('M ')) modified.push(line.substring(2).trim())
    else if (line.startsWith('A ')) added.push(line.substring(2).trim())
    else if (line.startsWith('D ')) deleted.push(line.substring(2).trim())
  }

  return { modified, added, deleted }
}

/**
 * Parse diff statistics from output
 */
export function parseDiffStats(output: string): DiffStats {
  const files: string[] = []
  let insertions = 0
  let deletions = 0

  const lines = output.split('\n')

  for (const line of lines) {
    if (!line.trim()) continue

    // Match pattern like: "file.ts | 10 +++++++---"
    const match = line.match(/^\s*(.+?)\s*\|\s*(\d+)\s+([+-]+)/)
    if (match && match[1] && match[3]) {
      const [, file, _changes, symbols] = match
      files.push(file.trim())

      for (const symbol of symbols) {
        if (symbol === '+') insertions++
        else if (symbol === '-') deletions++
      }
    }
  }

  return { files, insertions, deletions }
}

```

## `src/utils/vcs/jj.ts`

```typescript
// Jujutsu (jj) operations
// Uses Bun.$ for command execution per CLAUDE.md

import { parseJJStatus, parseDiffStats } from './parsers.js'
import type { CommandResult, VCSStatus, DiffStats, JJSnapshotResult, JJCommitResult } from './types.js'

/**
 * Execute a jj command
 */
export async function jj(...args: string[]): Promise<CommandResult> {
  try {
    const result = await Bun.$`jj ${args}`.quiet()
    return {
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    }
  } catch (error: any) {
    throw new Error(`jj ${args.join(' ')} failed: ${error.stderr?.toString() || error.message}`)
  }
}

/**
 * Get JJ change ID for current working copy
 */
export async function getJJChangeId(ref: string = '@'): Promise<string> {
  const result = await Bun.$`jj log -r ${ref} --no-graph -T change_id`.text()
  return result.trim()
}

/**
 * Create a JJ snapshot
 */
export async function jjSnapshot(message?: string): Promise<JJSnapshotResult> {
  // Run jj status to create implicit snapshot
  await Bun.$`jj status`.quiet()

  const changeId = await getJJChangeId('@')

  // Get description
  const description = message
    ? message
    : await Bun.$`jj log -r @ --no-graph -T description`.text().then((s) => s.trim())

  return { changeId, description }
}

/**
 * Create a JJ commit
 */
export async function jjCommit(message: string): Promise<JJCommitResult> {
  // Commit with message
  await Bun.$`jj commit -m ${message}`.quiet()

  // Get commit hash and change ID
  const commitHash = await Bun.$`jj log -r @ --no-graph -T commit_id`.text().then((s) => s.trim())
  const changeId = await getJJChangeId('@')

  return { commitHash, changeId }
}

/**
 * Get JJ status
 */
export async function getJJStatus(): Promise<VCSStatus> {
  const result = await Bun.$`jj status`.text()
  return parseJJStatus(result)
}

/**
 * Get JJ diff statistics
 */
export async function getJJDiffStats(): Promise<DiffStats> {
  const result = await Bun.$`jj diff --stat`.text()
  return parseDiffStats(result)
}

/**
 * Check if we're in a jj repository
 */
export async function isJJRepo(): Promise<boolean> {
  try {
    await Bun.$`jj root`.quiet()
    return true
  } catch {
    return false
  }
}

```

## `src/utils/vcs/types.ts`

```typescript
// Shared type definitions for VCS operations

/**
 * Status result for both git and jj
 */
export interface VCSStatus {
  modified: string[]
  added: string[]
  deleted: string[]
}

/**
 * Diff statistics result
 */
export interface DiffStats {
  files: string[]
  insertions: number
  deletions: number
}

/**
 * Commit info result
 */
export interface CommitInfo {
  hash: string
  author: string
  message: string
}

/**
 * Command execution result
 */
export interface CommandResult {
  stdout: string
  stderr: string
}

/**
 * JJ snapshot result
 */
export interface JJSnapshotResult {
  changeId: string
  description: string
}

/**
 * JJ commit result
 */
export interface JJCommitResult {
  commitHash: string
  changeId: string
}

```

## `src/components/Git/Notes.test.tsx`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/components/Git/Commit.test.tsx`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/components/Git/index.ts`

```typescript
// Git VCS components
export { Commit, type CommitProps, type CommitResult } from './Commit.js'
export { Notes, type NotesProps, type NotesResult } from './Notes.js'

```

## `src/components/Git/Notes.tsx`

```typescript
import { useState, useRef, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider.js'
import { addGitNotes, getGitNotes } from '../../utils/vcs.js'
import { useMount, useMountedState } from '../../reconciler/hooks.js'

export interface NotesProps {
  /** Commit reference (default: HEAD) */
  commitRef?: string
  /** Data to store in notes */
  data: Record<string, any>
  /** Append to existing notes instead of replacing */
  append?: boolean
  /** Callback when notes are added */
  onFinished?: (result: NotesResult) => void
  /** Callback on error */
  onError?: (error: Error) => void
}

export interface NotesResult {
  commitRef: string
  data: Record<string, any>
  previousNotes: string | null
}

/**
 * Notes component - adds/appends git notes with smithers tracking
 *
 * React pattern: Uses useEffect with empty deps and async IIFE inside
 */
export function Notes(props: NotesProps): ReactNode {
  const smithers = useSmithers()
  const [status, setStatus] = useState<'pending' | 'running' | 'complete' | 'error'>('pending')
  const [result, setResult] = useState<NotesResult | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const taskIdRef = useRef<string | null>(null)
  const isMounted = useMountedState()

  useMount(() => {
    // Fire-and-forget async IIFE
    ;(async () => {
      // Register task with database
      taskIdRef.current = smithers.db.tasks.start('git-notes')

      try {
        setStatus('running')

        const commitRef = props.commitRef ?? 'HEAD'

        // Get existing notes if appending
        const previousNotes = props.append ? await getGitNotes(commitRef) : null

        // Prepare notes content with smithers metadata
        const notesData = {
          smithers: true,
          executionId: smithers.executionId,
          timestamp: Date.now(),
          ...props.data,
        }

        const notesContent = JSON.stringify(notesData, null, 2)

        // Add or append notes
        await addGitNotes(notesContent, commitRef, props.append ?? false)

        const notesResult: NotesResult = {
          commitRef,
          data: notesData,
          previousNotes,
        }

        if (isMounted()) {
          setResult(notesResult)
          setStatus('complete')
          props.onFinished?.(notesResult)
        }

      } catch (err) {
        if (isMounted()) {
          const errorObj = err instanceof Error ? err : new Error(String(err))
          setError(errorObj)
          setStatus('error')
          props.onError?.(errorObj)
        }
      } finally {
        // Complete task
        if (taskIdRef.current) {
          smithers.db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  })

  return (
    <git-notes
      status={status}
      commit-ref={result?.commitRef}
      error={error?.message}
    />
  )
}

```

## `src/components/Git/Commit.tsx`

```typescript
import { useState, useRef, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider.js'
import { addGitNotes, getCommitHash, getDiffStats } from '../../utils/vcs.js'
import { useMount, useMountedState } from '../../reconciler/hooks.js'

export interface CommitProps {
  /** Commit message (optional if autoGenerate is true) */
  message?: string
  /** Auto-generate commit message using Claude */
  autoGenerate?: boolean
  /** Metadata to store in git notes */
  notes?: Record<string, any>
  /** Specific files to stage (default: all with -A) */
  files?: string[]
  /** Stage all tracked files with -a flag */
  all?: boolean
  /** Children content (used as message if message prop not provided) */
  children?: ReactNode
  /** Callback when commit is complete */
  onFinished?: (result: CommitResult) => void
  /** Callback on error */
  onError?: (error: Error) => void
}

export interface CommitResult {
  commitHash: string
  message: string
  filesChanged: string[]
  insertions: number
  deletions: number
}

/**
 * Generate commit message using Claude CLI
 */
async function generateCommitMessage(): Promise<string> {
  // Get the diff for context
  const diffResult = await Bun.$`git diff --cached --stat`.text()
  const diffContent = await Bun.$`git diff --cached`.text()

  const prompt = `Generate a concise git commit message for these changes. Return ONLY the commit message, nothing else.

Staged files:
${diffResult}

Diff:
${diffContent.slice(0, 5000)}${diffContent.length > 5000 ? '\n...(truncated)' : ''}`

  // Use claude CLI with --print to get the response
  const result = await Bun.$`claude --print --prompt ${prompt}`.text()
  return result.trim()
}

/**
 * Commit component - creates a git commit with smithers metadata
 *
 * React pattern: Uses useEffect with empty deps and async IIFE inside
 */
export function Commit(props: CommitProps): ReactNode {
  const smithers = useSmithers()
  const [status, setStatus] = useState<'pending' | 'running' | 'complete' | 'error'>('pending')
  const [result, setResult] = useState<CommitResult | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const taskIdRef = useRef<string | null>(null)
  const isMounted = useMountedState()

  useMount(() => {
    // Fire-and-forget async IIFE
    ;(async () => {
      // Register task with database
      taskIdRef.current = smithers.db.tasks.start('git-commit')

      try {
        setStatus('running')

        // Stage files
        if (props.files && props.files.length > 0) {
          // Stage specific files
          for (const file of props.files) {
            await Bun.$`git add ${file}`.quiet()
          }
        } else {
          // Stage all files with -A
          await Bun.$`git add -A`.quiet()
        }

        // Get or generate commit message
        let message = props.message

        if (!message && props.children) {
          // Use children content as message
          message = String(props.children)
        }

        if (!message && props.autoGenerate) {
          message = await generateCommitMessage()
        }

        if (!message) {
          throw new Error('No commit message provided and autoGenerate is false')
        }

        // Create commit
        const commitFlag = props.all ? '-a' : ''
        if (commitFlag) {
          await Bun.$`git commit -a -m ${message}`.quiet()
        } else {
          await Bun.$`git commit -m ${message}`.quiet()
        }

        if (!isMounted()) return

        // Get commit info
        const commitHash = await getCommitHash('HEAD')
        const diffStats = await getDiffStats('HEAD~1')

        // Add git notes with smithers metadata
        const notesData = {
          smithers: true,
          executionId: smithers.executionId,
          timestamp: Date.now(),
          ...props.notes,
        }

        await addGitNotes(JSON.stringify(notesData, null, 2), 'HEAD', false)

        // Log to database
        await smithers.db.vcs.logCommit({
          vcs_type: 'git',
          commit_hash: commitHash,
          message,
          files_changed: diffStats.files,
          insertions: diffStats.insertions,
          deletions: diffStats.deletions,
          smithers_metadata: notesData,
        })

        const commitResult: CommitResult = {
          commitHash,
          message,
          filesChanged: diffStats.files,
          insertions: diffStats.insertions,
          deletions: diffStats.deletions,
        }

        if (isMounted()) {
          setResult(commitResult)
          setStatus('complete')
          props.onFinished?.(commitResult)
        }

      } catch (err) {
        if (isMounted()) {
          const errorObj = err instanceof Error ? err : new Error(String(err))
          setError(errorObj)
          setStatus('error')
          props.onError?.(errorObj)
        }
      } finally {
        // Complete task
        if (taskIdRef.current) {
          smithers.db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  })

  return (
    <git-commit
      status={status}
      commit-hash={result?.commitHash}
      message={result?.message}
      error={error?.message}
    >
      {props.children}
    </git-commit>
  )
}

```

## `src/components/Hooks/PostCommit.test.tsx`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/components/Hooks/index.ts`

```typescript
// Hook components for Smithers orchestrator
// These components trigger children based on external events

export { PostCommit, type PostCommitProps } from './PostCommit.js'
export { OnCIFailure, type OnCIFailureProps, type CIFailure } from './OnCIFailure.js'

```

## `src/components/Hooks/PostCommit.tsx`

```typescript
// PostCommit hook component - triggers children when a git commit is made
// Installs a git post-commit hook and polls db.state for triggers

import { useState, useRef, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider.js'
import { useMount, useUnmount } from '../../reconciler/hooks.js'

export interface PostCommitProps {
  children: ReactNode
  /**
   * Filter which commits trigger the hook
   * - 'all': All commits trigger
   * - 'smithers-only': Only commits with smithers metadata in git notes
   */
  runOn?: 'all' | 'smithers-only'
  /**
   * Run children in background (non-blocking)
   */
  async?: boolean
}

interface HookTrigger {
  type: 'post-commit'
  commitHash: string
  timestamp: number
  processed?: boolean
}

/**
 * Install the git post-commit hook
 */
async function installPostCommitHook(): Promise<void> {
  const hookPath = '.git/hooks/post-commit'
  const hookContent = `#!/bin/bash
COMMIT_HASH=$(git rev-parse HEAD)
bunx smithers hook-trigger post-commit "$COMMIT_HASH"
`
  await Bun.write(hookPath, hookContent)
  await Bun.$`chmod +x ${hookPath}`
}

/**
 * Check if a commit has smithers metadata in git notes
 */
async function hasSmithersMetadata(commitHash: string): Promise<boolean> {
  try {
    const result = await Bun.$`git notes show ${commitHash} 2>/dev/null`.text()
    return result.toLowerCase().includes('smithers') || result.toLowerCase().includes('user prompt:')
  } catch {
    return false
  }
}

/**
 * PostCommit - Hook component that triggers on git commits
 *
 * On mount, installs a git post-commit hook that calls:
 *   bunx smithers hook-trigger post-commit "$COMMIT_HASH"
 *
 * Then polls db.state for 'last_hook_trigger' to detect new commits.
 * When a commit is detected, renders children.
 *
 * Usage:
 * ```tsx
 * <PostCommit runOn="smithers-only">
 *   <Claude>Review the latest commit and suggest improvements</Claude>
 * </PostCommit>
 * ```
 */
export function PostCommit(props: PostCommitProps): ReactNode {
  const smithers = useSmithers()

  const [triggered, setTriggered] = useState(false)
  const [currentTrigger, setCurrentTrigger] = useState<HookTrigger | null>(null)
  const lastProcessedTimestampRef = useRef(0)
  const [hookInstalled, setHookInstalled] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const taskIdRef = useRef<string | null>(null)

  useMount(() => {
    // Fire-and-forget async IIFE pattern
    ;(async () => {
      try {
        // Install the git hook
        await installPostCommitHook()
        setHookInstalled(true)

        // Start polling for triggers
        pollIntervalRef.current = setInterval(async () => {
          try {
            const trigger = await smithers.db.state.get<HookTrigger>('last_hook_trigger')

            if (trigger && trigger.type === 'post-commit' && trigger.timestamp > lastProcessedTimestampRef.current) {
              // Check filter conditions
              let shouldTrigger = true

              if (props.runOn === 'smithers-only') {
                shouldTrigger = await hasSmithersMetadata(trigger.commitHash)
              }

              if (shouldTrigger) {
                setCurrentTrigger(trigger)
                lastProcessedTimestampRef.current = trigger.timestamp
                setTriggered(true)

                // Mark as processed in db
                await smithers.db.state.set('last_hook_trigger', {
                  ...trigger,
                  processed: true,
                }, 'post-commit-hook')

                // If running in background (async), register task
                if (props.async) {
                  taskIdRef.current = smithers.db.tasks.start('post-commit-hook')
                  // Task will be completed when children finish
                  // For now, we complete immediately as children handle their own task registration
                  smithers.db.tasks.complete(taskIdRef.current)
                }
              }
            }
          } catch (pollError) {
            console.error('[PostCommit] Polling error:', pollError)
          }
        }, 1000) // Poll every 1 second

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        setError(errorMsg)
        console.error('[PostCommit] Failed to install hook:', errorMsg)
      }
    })()
  })

  useUnmount(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
    }
  })

  return (
    <post-commit-hook
      installed={hookInstalled}
      triggered={triggered}
      commit-hash={currentTrigger?.commitHash}
      run-on={props.runOn || 'all'}
      async={props.async || false}
      error={error}
    >
      {triggered ? props.children : null}
    </post-commit-hook>
  )
}

```

## `src/components/Hooks/OnCIFailure.tsx`

```typescript
// OnCIFailure hook component - polls CI status and triggers children on failure
// Currently supports GitHub Actions

import { useState, useRef, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider.js'
import { useMount, useUnmount } from '../../reconciler/hooks.js'

export interface CIFailure {
  failed: boolean
  runId?: string
  workflowName?: string
  failedJobs?: string[]
  logs?: string
}

export interface OnCIFailureProps {
  children: ReactNode
  /**
   * CI provider (currently only github-actions supported)
   */
  provider: 'github-actions'
  /**
   * Polling interval in milliseconds (default: 30000ms / 30s)
   */
  pollInterval?: number
  /**
   * Callback when a CI failure is detected
   */
  onFailure?: (failure: CIFailure) => void
}

interface GitHubActionsRun {
  status: string
  conclusion: string | null
  databaseId: number
  name: string
}

/**
 * Fetch the latest GitHub Actions run for the main branch
 */
async function fetchLatestGitHubActionsRun(): Promise<GitHubActionsRun | null> {
  try {
    const result = await Bun.$`gh run list --branch main --limit 1 --json status,conclusion,databaseId,name`.json()

    if (Array.isArray(result) && result.length > 0) {
      return result[0] as GitHubActionsRun
    }
    return null
  } catch (err) {
    console.error('[OnCIFailure] Failed to fetch GitHub Actions status:', err)
    return null
  }
}

/**
 * Fetch failed job names from a GitHub Actions run
 */
async function fetchFailedJobs(runId: number): Promise<string[]> {
  try {
    const result = await Bun.$`gh run view ${runId} --json jobs`.json() as { jobs: Array<{ name: string; conclusion: string }> }

    if (result.jobs) {
      return result.jobs
        .filter((job) => job.conclusion === 'failure')
        .map((job) => job.name)
    }
    return []
  } catch {
    return []
  }
}

/**
 * Fetch logs from a failed GitHub Actions run
 */
async function fetchRunLogs(runId: number): Promise<string> {
  try {
    const result = await Bun.$`gh run view ${runId} --log-failed 2>/dev/null`.text()
    // Truncate if too long (keep last 5000 chars)
    if (result.length > 5000) {
      return '... [truncated]\n' + result.slice(-5000)
    }
    return result
  } catch {
    return ''
  }
}

/**
 * OnCIFailure - Hook component that triggers on CI failures
 *
 * Polls GitHub Actions status and renders children when a failure is detected.
 * Keeps track of processed run IDs to avoid re-triggering on the same failure.
 *
 * Usage:
 * ```tsx
 * <OnCIFailure
 *   provider="github-actions"
 *   pollInterval={60000}
 *   onFailure={(failure) => console.log('CI failed:', failure)}
 * >
 *   <Claude>The CI has failed. Analyze the logs and fix the issue.</Claude>
 * </OnCIFailure>
 * ```
 */
export function OnCIFailure(props: OnCIFailureProps): ReactNode {
  const smithers = useSmithers()

  const [ciStatus, setCIStatus] = useState<'idle' | 'polling' | 'failed' | 'error'>('idle')
  const [currentFailure, setCurrentFailure] = useState<CIFailure | null>(null)
  const [triggered, setTriggered] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Track processed run IDs to avoid re-triggering
  const processedRunIdsRef = useRef(new Set<number>())
  const taskIdRef = useRef<string | null>(null)

  const intervalMs = props.pollInterval ?? 30000
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useMount(() => {
    const processedRunIds = processedRunIdsRef.current

    // Fire-and-forget async IIFE pattern
    ;(async () => {
      setCIStatus('polling')

      // Load previously processed run IDs from db state
      try {
        const processed = await smithers.db.state.get<number[]>('ci_processed_run_ids')
        if (processed) {
          processed.forEach((id) => processedRunIds.add(id))
        }
      } catch {
        // Ignore - starting fresh
      }

      // Define the polling function
      const checkCI = async () => {
        try {
          if (props.provider !== 'github-actions') {
            setError(`Unsupported CI provider: ${props.provider}`)
            return
          }

          const run = await fetchLatestGitHubActionsRun()

          if (!run) {
            return
          }

          // Check if this is a new failure
          if (
            run.status === 'completed' &&
            run.conclusion === 'failure' &&
            !processedRunIds.has(run.databaseId)
          ) {
            // Mark as processed
            processedRunIds.add(run.databaseId)

            // Persist processed IDs
            await smithers.db.state.set(
              'ci_processed_run_ids',
              Array.from(processedRunIds),
              'ci-failure-hook'
            )

            // Fetch additional failure details
            const failedJobs = await fetchFailedJobs(run.databaseId)
            const logs = await fetchRunLogs(run.databaseId)

            const failure: CIFailure = {
              failed: true,
              runId: String(run.databaseId),
              workflowName: run.name,
              failedJobs,
              logs,
            }

            setCurrentFailure(failure)
            setCIStatus('failed')
            setTriggered(true)

            // Call onFailure callback
            props.onFailure?.(failure)

            // Register task for tracking - children will handle completion
            taskIdRef.current = smithers.db.tasks.start('ci-failure-hook', props.provider)
            // Complete immediately as children handle their own task registration
            smithers.db.tasks.complete(taskIdRef.current)

            // Log to db state
            await smithers.db.state.set('last_ci_failure', failure, 'ci-failure-hook')
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err)
          setError(errorMsg)
          setCIStatus('error')
          console.error('[OnCIFailure] Polling error:', errorMsg)
        }
      }

      // Initial check
      await checkCI()

      // Start polling
      pollIntervalRef.current = setInterval(checkCI, intervalMs)
    })()
  })

  useUnmount(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
    }
  })

  return (
    <ci-failure-hook
      provider={props.provider}
      status={ciStatus}
      triggered={triggered}
      run-id={currentFailure?.runId}
      workflow-name={currentFailure?.workflowName}
      failed-jobs={currentFailure?.failedJobs?.join(', ')}
      poll-interval={intervalMs}
      error={error}
    >
      {triggered ? props.children : null}
    </ci-failure-hook>
  )
}

```

## `src/components/Hooks/OnCIFailure.test.tsx`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/components/MCP/index.ts`

```typescript
// MCP Tool Components
// Components for configuring MCP servers as children of agent components

export { Sqlite, type SqliteProps } from './Sqlite.js'

```

## `src/components/MCP/Sqlite.tsx`

```typescript
import type { ReactNode } from 'react'

export interface SqliteProps {
  /** Path to SQLite database file */
  path: string
  /** Open database in read-only mode */
  readOnly?: boolean
  /** Custom instructions for using the database */
  children?: ReactNode
}

/**
 * SQLite MCP Tool component.
 *
 * Provides SQLite database access to Claude via MCP server.
 * Use as a child of <Claude> with custom instructions.
 *
 * @example
 * <Claude>
 *   <Sqlite path="./data.db">
 *     Database has users table with id, name, email columns.
 *   </Sqlite>
 *   Query all users and format as a table.
 * </Claude>
 */
export function Sqlite(props: SqliteProps): ReactNode {
  const config = JSON.stringify({
    path: props.path,
    readOnly: props.readOnly ?? false,
  })

  return (
    <mcp-tool type="sqlite" config={config}>
      {props.children}
    </mcp-tool>
  )
}

```

## `src/components/agents/ClaudeCodeCLI.ts`

```typescript
// Claude Code CLI Executor
// Re-exports from the claude-cli module for backward compatibility

export {
  // Argument builder
  buildClaudeArgs,
  modelMap,
  permissionFlags,
  formatMap,
  // Stop conditions
  checkStopConditions,
  // Output parser
  parseClaudeOutput,
  // Executor functions
  executeClaudeCLI,
  executeClaudeShell,
  executeClaudeCLIOnce,
} from './claude-cli/index.js'

export type { ParsedOutput } from './claude-cli/index.js'

```

## `src/components/agents/SmithersCLI.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/components/agents/types.ts`

```typescript
// Agent system types for Smithers orchestrator
// Re-exports from types/ folder for backward compatibility

export type {
  JSONSchema,
  ToolContext,
  Tool,
  MCPServer,
  BaseAgentProps,
  ClaudeProps,
  ClaudeModel,
  ClaudePermissionMode,
  ClaudeOutputFormat,
  StopCondition,
  CLIExecutionOptions,
  AgentResult,
  StopConditionType,
  StopReason,
} from './types/index.js'

```

## `src/components/agents/SmithersCLI.ts`

```typescript
// Smithers Subagent CLI Executor
// Generates and executes Smithers scripts using Claude for planning

import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import type { AgentResult, ClaudeModel } from './types.js'
import { executeClaudeCLI } from './ClaudeCodeCLI.js'

// ============================================================================
// Types
// ============================================================================

export interface SmithersExecutionOptions {
  /**
   * Task description to plan and execute
   */
  task: string

  /**
   * Model to use for planning
   */
  plannerModel?: ClaudeModel

  /**
   * Model to use within the generated script
   */
  executionModel?: ClaudeModel

  /**
   * Working directory for the script
   */
  cwd?: string

  /**
   * Timeout in milliseconds
   */
  timeout?: number

  /**
   * Maximum turns for the planning phase
   */
  maxPlanningTurns?: number

  /**
   * Additional context about available resources
   */
  context?: string

  /**
   * Whether to keep the generated script after execution
   */
  keepScript?: boolean

  /**
   * Custom script output path (if keepScript is true)
   */
  scriptPath?: string

  /**
   * Progress callback
   */
  onProgress?: (message: string) => void

  /**
   * Called when script is generated (before execution)
   */
  onScriptGenerated?: (script: string, path: string) => void
}

export interface SmithersResult extends AgentResult {
  /**
   * The generated script content
   */
  script: string

  /**
   * Path where the script was written
   */
  scriptPath: string

  /**
   * Planning phase result
   */
  planningResult: AgentResult
}

// ============================================================================
// Script Generation
// ============================================================================

const SCRIPT_TEMPLATE = `#!/usr/bin/env bun
/**
 * Auto-generated Smithers script
 * Task: {{TASK}}
 * Generated at: {{TIMESTAMP}}
 */

import { createSmithersRoot } from 'smithers'
import { createSmithersDB, SmithersProvider, Orchestration, Claude, Phase, Step } from 'smithers/orchestrator'
import { Ralph, Review, Commit, Notes } from 'smithers/components'

{{SCRIPT_BODY}}
`

const PLANNING_SYSTEM_PROMPT = `You are a Smithers orchestration script generator. Your task is to create a complete, executable Smithers script that accomplishes the given task.

## Available Components

### Core Components
- \`<SmithersProvider db={db} executionId={id}>\` - Required wrapper for database context
- \`<Orchestration>\` - Orchestration container with timeout and stop conditions
- \`<Ralph maxIterations={n}>\` - Loop controller for iterative workflows
- \`<Phase name="...">\` - Named execution phase
- \`<Step name="...">\` - Named step within a phase

### Agent Components
- \`<Claude model="sonnet|opus|haiku" maxTurns={n}>\` - Claude agent for AI tasks
  - Props: model, maxTurns, tools, systemPrompt, onFinished, onError, reportingEnabled

### Git Components
- \`<Commit message="..." autoDescribe notes={...}>\` - Create git commit
- \`<Notes>\` - Add git notes

### Review Component
- \`<Review target={...} criteria={[...]} agent="claude" model="sonnet" blocking>\` - Code review

## Script Structure

Your script should:
1. Initialize the database with createSmithersDB
2. Start an execution with db.execution.start
3. Define an async workflow function that returns JSX
4. Create a root with createSmithersRoot()
5. Mount the workflow
6. Handle completion/errors
7. Clean up with db.close()

## Example Pattern

\`\`\`tsx
const db = await createSmithersDB({ path: '.smithers/my-task' })
const executionId = await db.execution.start('My Task', 'scripts/my-task.tsx')

async function MyWorkflow() {
  return (
    <SmithersProvider db={db} executionId={executionId}>
      <Orchestration globalTimeout={600000}>
        <Phase name="Main">
          <Claude model="sonnet" maxTurns={10} onFinished={() => console.log('Done!')}>
            Your prompt here
          </Claude>
        </Phase>
      </Orchestration>
    </SmithersProvider>
  )
}

const root = createSmithersRoot()
await root.mount(MyWorkflow)
await db.execution.complete(executionId)
await db.close()
\`\`\`

## Output Format

Return ONLY the script body (everything that goes inside the main function), not the imports or boilerplate.
The script should be complete and ready to execute.
Do not include markdown code fences - return raw TypeScript/TSX code only.`

/**
 * Generate a Smithers script using Claude
 */
async function generateSmithersScript(
  task: string,
  options: SmithersExecutionOptions
): Promise<{ script: string; planningResult: AgentResult }> {
  const prompt = `Generate a Smithers orchestration script for the following task:

${task}

${options.context ? `\nAdditional context:\n${options.context}` : ''}

The script should use model "${options.executionModel || 'sonnet'}" for Claude agents.

Return ONLY the script body code, no markdown fences or explanations.`

  options.onProgress?.('Planning Smithers script...')

  const planningResult = await executeClaudeCLI({
    prompt,
    model: options.plannerModel || 'sonnet',
    maxTurns: options.maxPlanningTurns || 5,
    systemPrompt: PLANNING_SYSTEM_PROMPT,
    timeout: options.timeout || 120000,
    ...(options.onProgress ? { onProgress: options.onProgress } : {}),
  })

  if (planningResult.stopReason === 'error') {
    throw new Error(`Script planning failed: ${planningResult.output}`)
  }

  // Clean up the output (remove any markdown fences if present)
  let scriptBody = planningResult.output
    .replace(/^```(?:tsx?|typescript)?\n?/gm, '')
    .replace(/\n?```$/gm, '')
    .trim()

  // Build the full script
  const fullScript = SCRIPT_TEMPLATE
    .replace('{{TASK}}', task.replace(/\*/g, '\\*').slice(0, 100))
    .replace('{{TIMESTAMP}}', new Date().toISOString())
    .replace('{{SCRIPT_BODY}}', scriptBody)

  return { script: fullScript, planningResult }
}

/**
 * Write script to file and make it executable
 */
async function writeScriptFile(script: string, scriptPath?: string): Promise<string> {
  const filePath = scriptPath || path.join(
    os.tmpdir(),
    `smithers-subagent-${Date.now()}.tsx`
  )

  await fs.writeFile(filePath, script)
  await fs.chmod(filePath, '755')

  return filePath
}

/**
 * Execute a Smithers script
 */
async function executeScript(
  scriptPath: string,
  options: SmithersExecutionOptions
): Promise<{ output: string; exitCode: number; durationMs: number }> {
  const startTime = Date.now()
  const timeout = options.timeout || 600000 // 10 minutes default

  options.onProgress?.(`Executing Smithers script: ${scriptPath}`)

  try {
    const proc = Bun.spawn(['bun', scriptPath], {
      cwd: options.cwd || process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
    })

    // Set up timeout
    let killed = false
    const timeoutId = setTimeout(() => {
      killed = true
      proc.kill()
    }, timeout)

    // Collect output
    let stdout = ''
    let stderr = ''
    const decoder = new TextDecoder()

    // Read stdout
    const stdoutReader = proc.stdout.getReader()
    const readStdout = async () => {
      while (true) {
        const { done, value } = await stdoutReader.read()
        if (done) break
        const chunk = decoder.decode(value)
        stdout += chunk
        options.onProgress?.(chunk)
      }
    }

    // Read stderr
    const stderrReader = proc.stderr.getReader()
    const readStderr = async () => {
      while (true) {
        const { done, value } = await stderrReader.read()
        if (done) break
        stderr += decoder.decode(value)
      }
    }

    await Promise.all([readStdout(), readStderr()])
    const exitCode = await proc.exited
    clearTimeout(timeoutId)

    const durationMs = Date.now() - startTime

    if (killed) {
      return {
        output: stdout + '\n[Execution timed out after ' + timeout + 'ms]',
        exitCode: -1,
        durationMs,
      }
    }

    return {
      output: stdout + (stderr ? '\n[stderr]\n' + stderr : ''),
      exitCode,
      durationMs,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    return {
      output: error instanceof Error ? error.message : String(error),
      exitCode: -1,
      durationMs,
    }
  }
}

// ============================================================================
// Main Executor
// ============================================================================

/**
 * Execute a Smithers subagent task
 *
 * This function:
 * 1. Uses Claude to plan a Smithers script for the given task
 * 2. Writes the script to a temp file
 * 3. Executes the script with bun
 * 4. Returns the combined result
 */
export async function executeSmithers(options: SmithersExecutionOptions): Promise<SmithersResult> {
  const startTime = Date.now()

  try {
    // Step 1: Generate the script
    const { script, planningResult } = await generateSmithersScript(options.task, options)

    // Step 2: Write to file
    const scriptPath = await writeScriptFile(script, options.scriptPath)
    options.onScriptGenerated?.(script, scriptPath)
    options.onProgress?.(`Script written to: ${scriptPath}`)

    // Step 3: Execute the script
    const execResult = await executeScript(scriptPath, options)

    // Step 4: Clean up (unless keepScript is true)
    if (!options.keepScript && !options.scriptPath) {
      try {
        await fs.unlink(scriptPath)
      } catch {
        // Ignore cleanup errors
      }
    }

    const durationMs = Date.now() - startTime

    return {
      output: execResult.output,
      script,
      scriptPath,
      planningResult,
      tokensUsed: {
        input: planningResult.tokensUsed.input,
        output: planningResult.tokensUsed.output,
      },
      turnsUsed: planningResult.turnsUsed,
      stopReason: execResult.exitCode === 0 ? 'completed' : 'error',
      durationMs,
      exitCode: execResult.exitCode,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    return {
      output: errorMessage,
      script: '',
      scriptPath: '',
      planningResult: {
        output: errorMessage,
        tokensUsed: { input: 0, output: 0 },
        turnsUsed: 0,
        stopReason: 'error',
        durationMs: 0,
      },
      tokensUsed: { input: 0, output: 0 },
      turnsUsed: 0,
      stopReason: 'error',
      durationMs,
      exitCode: -1,
    }
  }
}

```

## `src/components/Review/index.ts`

```typescript
export type { ReviewTarget, ReviewIssue, ReviewResult, ReviewProps } from './types.js'
export { Review } from './Review.js'

```

## `src/components/Review/types.ts`

```typescript
export interface ReviewTarget {
  /** Type of content to review */
  type: 'commit' | 'diff' | 'pr' | 'files'
  /** Reference (commit hash, branch, PR number, etc.) */
  ref?: string
  /** Specific files to review (for 'files' type) */
  files?: string[]
}

export interface ReviewIssue {
  /** Severity of the issue */
  severity: 'critical' | 'major' | 'minor'
  /** File path (if applicable) */
  file?: string
  /** Line number (if applicable) */
  line?: number
  /** Description of the issue */
  message: string
  /** Suggested fix */
  suggestion?: string
}

export interface ReviewResult {
  /** Whether the review passed */
  approved: boolean
  /** Summary of the review */
  summary: string
  /** List of issues found */
  issues: ReviewIssue[]
}

export interface ReviewProps {
  /** What to review */
  target: ReviewTarget
  /** Agent to use for review (currently only 'claude') */
  agent?: 'claude'
  /** Model to use */
  model?: string
  /** Stop orchestration if issues are found */
  blocking?: boolean
  /** Review criteria/checklist */
  criteria?: string[]
  /** Post review as GitHub PR comment */
  postToGitHub?: boolean
  /** Store review in git notes */
  postToGitNotes?: boolean
  /** Callback when review is complete */
  onFinished?: (result: ReviewResult) => void
  /** Callback on error */
  onError?: (error: Error) => void
}

```

## `src/components/Review/Review.tsx`

```typescript
import { useState, useRef, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider.js'
import { addGitNotes } from '../../utils/vcs.js'
import type { ReviewTarget, ReviewResult, ReviewProps } from './types.js'
import { useMount, useMountedState } from '../../reconciler/hooks.js'

/**
 * Fetch content to review based on target type
 */
async function fetchTargetContent(target: ReviewTarget): Promise<string> {
  switch (target.type) {
    case 'commit': {
      const ref = target.ref ?? 'HEAD'
      const result = await Bun.$`git show ${ref}`.text()
      return result
    }

    case 'diff': {
      const ref = target.ref
      if (ref) {
        const result = await Bun.$`git diff ${ref}`.text()
        return result
      } else {
        const result = await Bun.$`git diff`.text()
        return result
      }
    }

    case 'pr': {
      if (!target.ref) {
        throw new Error('PR number required for pr target type')
      }
      const result = await Bun.$`gh pr view ${target.ref} --json body,title,files,additions,deletions,commits`.text()
      const prData = JSON.parse(result)

      // Also get the diff
      const diffResult = await Bun.$`gh pr diff ${target.ref}`.text()

      return `PR #${target.ref}: ${prData.title}

${prData.body}

Files changed: ${prData.files?.length ?? 0}
Additions: ${prData.additions}
Deletions: ${prData.deletions}

Diff:
${diffResult}`
    }

    case 'files': {
      if (!target.files || target.files.length === 0) {
        throw new Error('files array required for files target type')
      }

      const contents: string[] = []
      for (const file of target.files) {
        try {
          const content = await Bun.file(file).text()
          contents.push(`=== ${file} ===\n${content}`)
        } catch {
          contents.push(`=== ${file} === (file not found)`)
        }
      }
      return contents.join('\n\n')
    }

    default:
      throw new Error(`Unknown target type: ${(target as any).type}`)
  }
}

/**
 * Build the review prompt
 */
function buildReviewPrompt(content: string, criteria?: string[]): string {
  const criteriaText = criteria && criteria.length > 0
    ? `\nReview Criteria:\n${criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
    : ''

  return `You are a code reviewer. Review the following code changes and provide feedback.

${criteriaText}

Respond with ONLY a JSON object in this exact format (no markdown, no code blocks):
{
  "approved": true/false,
  "summary": "Brief summary of the review",
  "issues": [
    {
      "severity": "critical|major|minor",
      "file": "path/to/file (optional)",
      "line": 123 (optional),
      "message": "Description of the issue",
      "suggestion": "Suggested fix (optional)"
    }
  ]
}

Rules:
- Set approved to false if there are any critical issues
- Set approved to false if there are more than 2 major issues
- Be constructive and specific in your feedback
- Focus on correctness, security, performance, and maintainability

Content to review:
${content}`
}

/**
 * Execute review using Claude CLI
 */
async function executeReview(prompt: string, model?: string): Promise<ReviewResult> {
  // Use claude CLI with --print to get the response
  const result = model
    ? await Bun.$`claude --print --model ${model} --prompt ${prompt}`.text()
    : await Bun.$`claude --print --prompt ${prompt}`.text()

  // Parse the JSON response
  const trimmed = result.trim()

  // Handle potential markdown code blocks
  let jsonStr = trimmed
  if (trimmed.startsWith('```')) {
    const lines = trimmed.split('\n')
    jsonStr = lines.slice(1, -1).join('\n')
  }

  try {
    const parsed = JSON.parse(jsonStr)
    return {
      approved: Boolean(parsed.approved),
      summary: String(parsed.summary ?? ''),
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    }
  } catch (parseError) {
    // If parsing fails, create a default failed review
    return {
      approved: false,
      summary: 'Failed to parse review response',
      issues: [{
        severity: 'critical',
        message: `Review parsing failed: ${parseError}. Raw response: ${trimmed.slice(0, 500)}`,
      }],
    }
  }
}

/**
 * Post review to GitHub PR
 */
async function postToGitHubPR(prNumber: string, review: ReviewResult): Promise<void> {
  const issuesText = review.issues.length > 0
    ? review.issues.map(i => {
        const location = [i.file, i.line].filter(Boolean).join(':')
        const locationText = location ? ` (${location})` : ''
        const suggestionText = i.suggestion ? `\n  > Suggestion: ${i.suggestion}` : ''
        return `- **${i.severity.toUpperCase()}**${locationText}: ${i.message}${suggestionText}`
      }).join('\n')
    : 'No issues found.'

  const body = `## Automated Code Review

**Status:** ${review.approved ? 'Approved' : 'Changes Requested'}

### Summary
${review.summary}

### Issues
${issuesText}

---
*Generated by Smithers Review*`

  await Bun.$`gh pr comment ${prNumber} --body ${body}`.quiet()
}

/**
 * Review component - reviews code changes using AI
 *
 * React pattern: Uses useEffect with empty deps and async IIFE inside
 */
export function Review(props: ReviewProps): ReactNode {
  const smithers = useSmithers()
  const [status, setStatus] = useState<'pending' | 'running' | 'complete' | 'error'>('pending')
  const [result, setResult] = useState<ReviewResult | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const taskIdRef = useRef<string | null>(null)
  const isMounted = useMountedState()

  useMount(() => {
    // Fire-and-forget async IIFE
    ;(async () => {
      // Register task with database
      taskIdRef.current = smithers.db.tasks.start('review', props.target.type)

      try {
        setStatus('running')

        // Fetch content to review
        const content = await fetchTargetContent(props.target)

        // Build review prompt
        const prompt = buildReviewPrompt(content, props.criteria)

        // Execute review
        const reviewResult = await executeReview(prompt, props.model)

        if (!isMounted()) return

        // Log to database
        const reviewId = await smithers.db.vcs.logReview({
          target_type: props.target.type,
          ...(props.target.ref ? { target_ref: props.target.ref } : {}),
          approved: reviewResult.approved,
          summary: reviewResult.summary,
          issues: reviewResult.issues,
          reviewer_model: props.model ?? 'claude-sonnet-4',
          ...(props.blocking !== undefined ? { blocking: props.blocking } : {}),
        })

        // Post to GitHub if requested
        if (props.postToGitHub && props.target.type === 'pr' && props.target.ref) {
          await postToGitHubPR(props.target.ref, reviewResult)
          await smithers.db.vcs.updateReview(reviewId, { posted_to_github: true })
        }

        // Post to git notes if requested
        if (props.postToGitNotes) {
          const commitRef = props.target.type === 'commit' ? (props.target.ref ?? 'HEAD') : 'HEAD'
          const notesContent = JSON.stringify({
            smithers_review: true,
            executionId: smithers.executionId,
            timestamp: Date.now(),
            review: reviewResult,
          }, null, 2)
          await addGitNotes(notesContent, commitRef, true)
          await smithers.db.vcs.updateReview(reviewId, { posted_to_git_notes: true })
        }

        if (isMounted()) {
          setResult(reviewResult)
          setStatus('complete')
          props.onFinished?.(reviewResult)

          // If blocking and not approved, request stop
          if (props.blocking && !reviewResult.approved) {
            const criticalCount = reviewResult.issues.filter(i => i.severity === 'critical').length
            const majorCount = reviewResult.issues.filter(i => i.severity === 'major').length
            smithers.requestStop(
              `Review failed: ${criticalCount} critical, ${majorCount} major issues found. ${reviewResult.summary}`
            )
          }
        }

      } catch (err) {
        if (isMounted()) {
          const errorObj = err instanceof Error ? err : new Error(String(err))
          setError(errorObj)
          setStatus('error')
          props.onError?.(errorObj)
        }
      } finally {
        // Complete task
        if (taskIdRef.current) {
          smithers.db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  })

  return (
    <review
      status={status}
      approved={result?.approved}
      summary={result?.summary}
      issue-count={result?.issues.length}
      error={error?.message}
      target-type={props.target.type}
      target-ref={props.target.ref}
      blocking={props.blocking}
    />
  )
}

```

## `src/components/JJ/Describe.tsx`

```typescript
import { useState, useRef, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider.js'
import { useMount, useMountedState } from '../../reconciler/hooks.js'

export interface DescribeProps {
  useAgent?: 'claude'
  template?: string
  children?: ReactNode
}

/**
 * JJ Describe component - auto-generates commit message.
 *
 * React pattern: Uses useEffect with empty deps and async IIFE inside.
 * Registers with Ralph for task tracking.
 */
export function Describe(props: DescribeProps): ReactNode {
  const smithers = useSmithers()
  const [status, setStatus] = useState<'pending' | 'running' | 'complete' | 'error'>('pending')
  const [description, setDescription] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const taskIdRef = useRef<string | null>(null)
  const isMounted = useMountedState()

  useMount(() => {
    // Fire-and-forget async IIFE
    ;(async () => {
      // Register task with database
      taskIdRef.current = smithers.db.tasks.start('jj-describe')

      try {
        setStatus('running')

        // Get the current diff
        const diff = await Bun.$`jj diff`.text()

        // Generate description
        const lines = diff.split('\n').length
        const generatedDescription = `Changes: ${lines} lines modified`

        // Update JJ description
        await Bun.$`jj describe -m ${generatedDescription}`.quiet()

        if (isMounted()) {
          setDescription(generatedDescription)
          setStatus('complete')
        }

        // Log to vcs reports
        await smithers.db.vcs.addReport({
          type: 'progress',
          title: 'JJ Describe',
          content: generatedDescription,
          data: {
            useAgent: props.useAgent,
            template: props.template,
          },
        })
      } catch (err) {
        if (isMounted()) {
          const errorObj = err instanceof Error ? err : new Error(String(err))
          setError(errorObj)
          setStatus('error')
        }
      } finally {
        // Complete task
        if (taskIdRef.current) {
          smithers.db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  })

  return (
    <jj-describe
      status={status}
      description={description}
      error={error?.message}
      use-agent={props.useAgent}
      template={props.template}
    >
      {props.children}
    </jj-describe>
  )
}

```

## `src/components/JJ/Commit.test.tsx`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/components/JJ/Describe.test.tsx`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/components/JJ/index.ts`

```typescript
// JJ (Jujutsu) VCS Components
// Components for interacting with JJ version control system

export { Snapshot, type SnapshotProps } from './Snapshot.js'
export { Commit, type CommitProps } from './Commit.js'
export { Describe, type DescribeProps } from './Describe.js'
export { Status, type StatusProps } from './Status.js'
export { Rebase, type RebaseProps } from './Rebase.js'

```

## `src/components/JJ/Snapshot.test.tsx`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/components/JJ/Status.tsx`

```typescript
import { useState, useRef, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider.js'
import { getJJStatus } from '../../utils/vcs.js'
import { useMount, useMountedState } from '../../reconciler/hooks.js'

export interface StatusProps {
  onDirty?: (status: { modified: string[]; added: string[]; deleted: string[] }) => void
  onClean?: () => void
  children?: ReactNode
}

/**
 * JJ Status component - checks JJ working copy status.
 *
 * React pattern: Uses useEffect with empty deps and async IIFE inside.
 * Registers with Ralph for task tracking.
 */
export function Status(props: StatusProps): ReactNode {
  const smithers = useSmithers()
  const [status, setStatus] = useState<'pending' | 'running' | 'complete' | 'error'>('pending')
  const [isDirty, setIsDirty] = useState<boolean | null>(null)
  const [fileStatus, setFileStatus] = useState<{
    modified: string[]
    added: string[]
    deleted: string[]
  } | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const taskIdRef = useRef<string | null>(null)
  const isMounted = useMountedState()

  useMount(() => {
    // Fire-and-forget async IIFE
    ;(async () => {
      // Register task with database
      taskIdRef.current = smithers.db.tasks.start('jj-status')

      try {
        setStatus('running')

        // Get JJ status
        const jjStatus = await getJJStatus()

        if (!isMounted()) return

        setFileStatus(jjStatus)

        // Check if working copy is dirty
        const dirty =
          jjStatus.modified.length > 0 ||
          jjStatus.added.length > 0 ||
          jjStatus.deleted.length > 0

        setIsDirty(dirty)

        // Call appropriate callback
        if (dirty) {
          props.onDirty?.(jjStatus)
        } else {
          props.onClean?.()
        }

        if (isMounted()) {
          setStatus('complete')
        }

        // Log status check to reports
        await smithers.db.vcs.addReport({
          type: 'progress',
          title: 'JJ Status Check',
          content: dirty
            ? `Working copy is dirty: ${jjStatus.modified.length} modified, ${jjStatus.added.length} added, ${jjStatus.deleted.length} deleted`
            : 'Working copy is clean',
          data: {
            isDirty: dirty,
            ...jjStatus,
          },
        })
      } catch (err) {
        if (isMounted()) {
          const errorObj = err instanceof Error ? err : new Error(String(err))
          setError(errorObj)
          setStatus('error')
        }
      } finally {
        // Complete task
        if (taskIdRef.current) {
          smithers.db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  })

  return (
    <jj-status
      status={status}
      is-dirty={isDirty}
      modified={fileStatus?.modified?.join(',')}
      added={fileStatus?.added?.join(',')}
      deleted={fileStatus?.deleted?.join(',')}
      error={error?.message}
    >
      {props.children}
    </jj-status>
  )
}

```

## `src/components/JJ/Rebase.tsx`

```typescript
import { useState, useRef, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider.js'
import { useMount, useMountedState } from '../../reconciler/hooks.js'

export interface RebaseProps {
  destination?: string
  source?: string
  onConflict?: (conflicts: string[]) => void
  children?: ReactNode
}

/**
 * Parse conflict files from jj rebase output or status.
 */
function parseConflicts(output: string): string[] {
  const conflicts: string[] = []
  const lines = output.split('\n')

  for (const line of lines) {
    // JJ marks conflicts with 'C' or mentions them in output
    if (line.includes('conflict') || line.startsWith('C ')) {
      const match = line.match(/C\s+(.+)/)
      if (match && match[1]) {
        conflicts.push(match[1].trim())
      } else {
        // Try to extract file paths from conflict messages
        const fileMatch = line.match(/['"]([^'"]+)['"]/g)
        if (fileMatch) {
          conflicts.push(...fileMatch.map((f) => f.replace(/['"]/g, '')))
        }
      }
    }
  }

  return conflicts
}

/**
 * JJ Rebase component - performs JJ rebase with conflict handling.
 *
 * React pattern: Uses useEffect with empty deps and async IIFE inside.
 * Registers with Ralph for task tracking.
 */
export function Rebase(props: RebaseProps): ReactNode {
  const smithers = useSmithers()
  const [status, setStatus] = useState<'pending' | 'running' | 'complete' | 'conflict' | 'error'>('pending')
  const [conflicts, setConflicts] = useState<string[]>([])
  const [error, setError] = useState<Error | null>(null)

  const taskIdRef = useRef<string | null>(null)
  const isMounted = useMountedState()

  useMount(() => {
    // Fire-and-forget async IIFE
    ;(async () => {
      // Register task with database
      taskIdRef.current = smithers.db.tasks.start('jj-rebase')

      try {
        setStatus('running')

        // Build rebase command
        const args: string[] = ['rebase']

        if (props.destination) {
          args.push('-d', props.destination)
        }

        if (props.source) {
          args.push('-s', props.source)
        }

        // Execute rebase
        let rebaseOutput: string
        let hasConflicts = false

        try {
          const result = await Bun.$`jj ${args}`.quiet()
          rebaseOutput = result.stdout.toString() + result.stderr.toString()
        } catch (rebaseError: any) {
          // JJ rebase may fail with conflicts but still "succeed"
          rebaseOutput = rebaseError.stderr?.toString() || rebaseError.message
          hasConflicts = rebaseOutput.toLowerCase().includes('conflict')
        }

        if (!isMounted()) return

        // Check for conflicts in output
        const detectedConflicts = parseConflicts(rebaseOutput)

        // Also check jj status for conflicts
        const statusResult = await Bun.$`jj status`.text()
        const statusConflicts = parseConflicts(statusResult)

        const allConflicts = [...new Set([...detectedConflicts, ...statusConflicts])]
        setConflicts(allConflicts)

        if (allConflicts.length > 0 || hasConflicts) {
          if (isMounted()) {
            setStatus('conflict')
            props.onConflict?.(allConflicts)
          }

          // Log conflict to database
          await smithers.db.vcs.addReport({
            type: 'warning',
            title: 'JJ Rebase Conflicts',
            content: `Rebase resulted in ${allConflicts.length} conflict(s)`,
            severity: 'warning',
            data: {
              destination: props.destination,
              source: props.source,
              conflicts: allConflicts,
            },
          })
        } else {
          if (isMounted()) {
            setStatus('complete')
          }

          // Log successful rebase
          await smithers.db.vcs.addReport({
            type: 'progress',
            title: 'JJ Rebase Complete',
            content: `Successfully rebased${props.source ? ` from ${props.source}` : ''}${props.destination ? ` to ${props.destination}` : ''}`,
            data: {
              destination: props.destination,
              source: props.source,
            },
          })
        }
      } catch (err) {
        if (isMounted()) {
          const errorObj = err instanceof Error ? err : new Error(String(err))
          setError(errorObj)
          setStatus('error')
        }

        // Log error to database
        const errorObj = err instanceof Error ? err : new Error(String(err))
        await smithers.db.vcs.addReport({
          type: 'error',
          title: 'JJ Rebase Failed',
          content: errorObj.message,
          severity: 'critical',
          data: {
            destination: props.destination,
            source: props.source,
          },
        })
      } finally {
        // Complete task
        if (taskIdRef.current) {
          smithers.db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  })

  return (
    <jj-rebase
      status={status}
      destination={props.destination}
      source={props.source}
      conflicts={conflicts.join(',')}
      error={error?.message}
    >
      {props.children}
    </jj-rebase>
  )
}

```

## `src/components/JJ/Snapshot.tsx`

```typescript
import { useState, useRef, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider.js'
import { jjSnapshot, getJJStatus } from '../../utils/vcs.js'
import { useMount, useMountedState } from '../../reconciler/hooks.js'

export interface SnapshotProps {
  message?: string
  children?: ReactNode
}

/**
 * JJ Snapshot component - creates a JJ snapshot and logs to database.
 *
 * React pattern: Uses useEffect with empty deps and async IIFE inside.
 * Registers with Ralph for task tracking.
 */
export function Snapshot(props: SnapshotProps): ReactNode {
  const smithers = useSmithers()
  const [status, setStatus] = useState<'pending' | 'running' | 'complete' | 'error'>('pending')
  const [changeId, setChangeId] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const taskIdRef = useRef<string | null>(null)
  const isMounted = useMountedState()

  useMount(() => {
    // Fire-and-forget async IIFE
    ;(async () => {
      // Register task with database
      taskIdRef.current = smithers.db.tasks.start('jj-snapshot')

      try {
        setStatus('running')

        // Create JJ snapshot
        const result = await jjSnapshot(props.message)

        if (!isMounted()) return

        setChangeId(result.changeId)

        // Get file status for logging
        const fileStatus = await getJJStatus()

        // Log to database
        await smithers.db.vcs.logSnapshot({
          change_id: result.changeId,
          description: result.description,
          files_modified: fileStatus.modified,
          files_added: fileStatus.added,
          files_deleted: fileStatus.deleted,
        })

        if (isMounted()) {
          setStatus('complete')
        }
      } catch (err) {
        if (isMounted()) {
          const errorObj = err instanceof Error ? err : new Error(String(err))
          setError(errorObj)
          setStatus('error')
        }
      } finally {
        // Complete task
        if (taskIdRef.current) {
          smithers.db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  })

  return (
    <jj-snapshot
      status={status}
      change-id={changeId}
      error={error?.message}
      message={props.message}
    >
      {props.children}
    </jj-snapshot>
  )
}

```

## `src/components/JJ/Commit.tsx`

```typescript
import { useState, useRef, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider.js'
import { jjCommit, addGitNotes, getJJDiffStats } from '../../utils/vcs.js'
import { useMount, useMountedState } from '../../reconciler/hooks.js'

export interface CommitProps {
  message?: string
  autoDescribe?: boolean
  notes?: string
  children?: ReactNode
}

/**
 * JJ Commit component - creates a JJ commit with optional auto-describe.
 *
 * React pattern: Uses useEffect with empty deps and async IIFE inside.
 * Registers with Ralph for task tracking.
 */
export function Commit(props: CommitProps): ReactNode {
  const smithers = useSmithers()
  const [status, setStatus] = useState<'pending' | 'running' | 'complete' | 'error'>('pending')
  const [commitHash, setCommitHash] = useState<string | null>(null)
  const [changeId, setChangeId] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const taskIdRef = useRef<string | null>(null)
  const isMounted = useMountedState()

  useMount(() => {
    // Fire-and-forget async IIFE
    ;(async () => {
      // Register task with database
      taskIdRef.current = smithers.db.tasks.start('jj-commit')

      try {
        setStatus('running')

        let message = props.message

        // Auto-describe if requested
        if (props.autoDescribe && !message) {
          const diffResult = await Bun.$`jj diff`.text()
          const lines = diffResult.split('\n').length
          message = `Auto-generated commit: ${lines} lines changed`
        }

        // Default message if still none
        if (!message) {
          message = 'Commit by Smithers'
        }

        // Create JJ commit
        const result = await jjCommit(message)

        if (!isMounted()) return

        setCommitHash(result.commitHash)
        setChangeId(result.changeId)

        // Get diff stats for logging
        const stats = await getJJDiffStats()

        // Add git notes with smithers metadata if provided
        if (props.notes) {
          await addGitNotes(props.notes)
        }

        // Log to database
        await smithers.db.vcs.logCommit({
          vcs_type: 'jj',
          commit_hash: result.commitHash,
          change_id: result.changeId,
          message,
          files_changed: stats.files,
          insertions: stats.insertions,
          deletions: stats.deletions,
          ...(props.notes ? { smithers_metadata: { notes: props.notes } } : {}),
        })

        if (isMounted()) {
          setStatus('complete')
        }
      } catch (err) {
        if (isMounted()) {
          const errorObj = err instanceof Error ? err : new Error(String(err))
          setError(errorObj)
          setStatus('error')
        }
      } finally {
        // Complete task
        if (taskIdRef.current) {
          smithers.db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  })

  return (
    <jj-commit
      status={status}
      commit-hash={commitHash}
      change-id={changeId}
      error={error?.message}
      message={props.message}
      auto-describe={props.autoDescribe}
    >
      {props.children}
    </jj-commit>
  )
}

```

## `src/components/JJ/Status.test.tsx`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/components/JJ/Rebase.test.tsx`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/reactive-sqlite/hooks/index.ts`

```typescript
/**
 * React hooks for reactive SQLite queries
 *
 * Barrel export for all hooks
 */

export { useQuery } from './useQuery.js'
export { useMutation } from './useMutation.js'
export { useQueryOne } from './useQueryOne.js'
export { useQueryValue } from './useQueryValue.js'
export { useVersionTracking, useQueryCache } from './shared.js'
export { DatabaseProvider, useDatabase, useDatabaseOptional } from './context.js'

```

## `src/reactive-sqlite/hooks/context.tsx`

```typescript
/**
 * React Context Provider for ReactiveDatabase
 *
 * Provides database access throughout the component tree without prop drilling.
 */

import { createContext, useContext, type ReactNode } from 'react'
import type { ReactiveDatabase } from '../database.js'

/**
 * Context for the ReactiveDatabase instance
 */
const DatabaseContext = createContext<ReactiveDatabase | null>(null)

/**
 * Props for DatabaseProvider
 */
interface DatabaseProviderProps {
  /** The ReactiveDatabase instance to provide */
  db: ReactiveDatabase
  /** Child components */
  children: ReactNode
}

/**
 * Provider component that makes a ReactiveDatabase available to child components
 *
 * @example
 * ```tsx
 * const db = new ReactiveDatabase(':memory:')
 *
 * function App() {
 *   return (
 *     <DatabaseProvider db={db}>
 *       <UserList />
 *     </DatabaseProvider>
 *   )
 * }
 * ```
 */
export function DatabaseProvider({ db, children }: DatabaseProviderProps) {
  return (
    <DatabaseContext.Provider value={db}>
      {children}
    </DatabaseContext.Provider>
  )
}

/**
 * Hook to access the ReactiveDatabase from context
 *
 * @throws Error if used outside of a DatabaseProvider
 *
 * @example
 * ```tsx
 * function UserList() {
 *   const db = useDatabase()
 *   const users = db.query('SELECT * FROM users')
 *   return <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>
 * }
 * ```
 */
export function useDatabase(): ReactiveDatabase {
  const db = useContext(DatabaseContext)
  if (!db) {
    throw new Error('useDatabase must be used within a DatabaseProvider')
  }
  return db
}

/**
 * Hook to optionally access the ReactiveDatabase from context
 * Returns null if not within a provider (useful for hooks that accept optional db)
 */
export function useDatabaseOptional(): ReactiveDatabase | null {
  return useContext(DatabaseContext)
}

export { DatabaseContext }

```

## `src/reactive-sqlite/hooks/context.test.tsx`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/reactive-sqlite/hooks/useQuery.ts`

```typescript
/**
 * useQuery hook for reactive SQLite queries
 */

import { useSyncExternalStore, useCallback, useMemo, useEffect } from 'react'
import type { ReactiveDatabase } from '../database.js'
import { extractReadTables } from '../parser.js'
import type { UseQueryResult, UseQueryOptions } from '../types.js'
import { useVersionTracking, useQueryCache } from './shared.js'
import { useDatabaseOptional } from './context.js'

/**
 * Hook to execute a reactive query
 *
 * The query will automatically re-run when relevant tables are mutated.
 *
 * @example
 * ```tsx
 * // With explicit db
 * function UserList() {
 *   const { data: users, isLoading } = useQuery(
 *     db,
 *     'SELECT * FROM users WHERE active = ?',
 *     [true]
 *   )
 *
 *   if (isLoading) return <div>Loading...</div>
 *
 *   return <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>
 * }
 *
 * // With context (inside DatabaseProvider)
 * function UserList() {
 *   const { data: users } = useQuery('SELECT * FROM users')
 *   return <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>
 * }
 * ```
 */
export function useQuery<T = Record<string, unknown>>(
  sqlOrDb: ReactiveDatabase | string,
  sqlOrParams?: string | any[],
  paramsOrOptions?: any[] | UseQueryOptions,
  optionsOrDb?: UseQueryOptions | ReactiveDatabase
): UseQueryResult<T> {
  // Parse overloaded arguments
  const contextDb = useDatabaseOptional()

  let db: ReactiveDatabase
  let sql: string
  let params: any[]
  let options: UseQueryOptions

  if (typeof sqlOrDb === 'string') {
    // New signature: useQuery(sql, params?, options?, explicitDb?)
    sql = sqlOrDb
    params = Array.isArray(sqlOrParams) ? sqlOrParams : []
    options = (Array.isArray(sqlOrParams) ? paramsOrOptions : sqlOrParams) as UseQueryOptions ?? {}
    const explicitDb = Array.isArray(sqlOrParams) ? optionsOrDb : paramsOrOptions

    if (explicitDb && typeof explicitDb !== 'object') {
      throw new Error('Invalid arguments to useQuery')
    }

    db = (explicitDb as ReactiveDatabase) ?? contextDb!
    if (!db) {
      throw new Error('useQuery requires either a DatabaseProvider or an explicit db argument')
    }
  } else {
    // Legacy signature: useQuery(db, sql, params?, options?)
    db = sqlOrDb
    sql = sqlOrParams as string
    params = Array.isArray(paramsOrOptions) ? paramsOrOptions : []
    options = (optionsOrDb as UseQueryOptions) ?? {}
  }

  const { skip = false, deps = [] } = options

  // Track version for forcing re-renders
  const { incrementVersion, invalidateAndUpdate } = useVersionTracking()
  const { cacheRef, invalidateCache } = useQueryCache<T>()

  // Memoize the query key
  const queryKey = useMemo(
    () => JSON.stringify({ sql, params, skip }),
    [sql, JSON.stringify(params), skip]
  )

  // Execute query and update cache
  const executeQuery = useCallback(() => {
    if (skip) {
      return { data: [] as T[], error: null }
    }

    try {
      const data = db.query<T>(sql, params)
      return { data, error: null }
    } catch (error) {
      return { data: [] as T[], error: error as Error }
    }
  }, [db, sql, JSON.stringify(params), skip])

  // Subscribe to database changes
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (skip) {
        return () => {}
      }

      const tables = extractReadTables(sql)
      return db.subscribe(tables, () => {
        incrementVersion()
        onStoreChange()
      })
    },
    [db, sql, skip, incrementVersion]
  )

  // Get current snapshot
  const getSnapshot = useCallback(() => {
    if (cacheRef.current.key !== queryKey) {
      const result = executeQuery()
      cacheRef.current = {
        key: queryKey,
        data: result.data,
        error: result.error,
      }
    }
    return cacheRef.current
  }, [queryKey, executeQuery, cacheRef])

  // Use useSyncExternalStore for React 18+ concurrent mode support
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot // Server snapshot (same as client for SQLite)
  )

  // Re-fetch when deps change
  useEffect(() => {
    if (deps.length > 0) {
      invalidateCache()
      invalidateAndUpdate()
    }
  }, deps)

  // Refetch function
  const refetch = useCallback(() => {
    invalidateCache()
    invalidateAndUpdate()
  }, [invalidateCache, invalidateAndUpdate])

  return {
    data: snapshot.data,
    isLoading: false, // SQLite queries are synchronous
    error: snapshot.error,
    refetch,
  }
}

```

## `src/reactive-sqlite/hooks/shared.ts`

```typescript
/**
 * Shared utilities for reactive SQLite hooks
 */

import { useRef, useState, useCallback } from 'react'

/**
 * Hook for version tracking to force re-renders
 */
export function useVersionTracking() {
  const versionRef = useRef(0)
  const [, forceUpdate] = useState(0)

  const incrementVersion = useCallback(() => {
    versionRef.current++
  }, [])

  const invalidateAndUpdate = useCallback(() => {
    forceUpdate(v => v + 1)
  }, [])

  return {
    versionRef,
    incrementVersion,
    invalidateAndUpdate,
  }
}

/**
 * Hook for managing query cache
 */
export function useQueryCache<T>() {
  const cacheRef = useRef<{ key: string; data: T[]; error: Error | null }>({
    key: '',
    data: [],
    error: null,
  })

  const invalidateCache = useCallback(() => {
    cacheRef.current.key = ''
  }, [])

  const updateCache = useCallback((key: string, data: T[], error: Error | null) => {
    cacheRef.current = { key, data, error }
  }, [])

  return {
    cacheRef,
    invalidateCache,
    updateCache,
  }
}

```

## `src/reactive-sqlite/hooks/useQueryValue.ts`

```typescript
/**
 * useQueryValue hook for reactive SQLite single-value queries
 */

import type { ReactiveDatabase } from '../database.js'
import type { UseQueryResult, UseQueryOptions } from '../types.js'
import { useQuery } from './useQuery.js'

/**
 * Hook to get a single value from a query
 *
 * @example
 * ```tsx
 * function UserCount() {
 *   const { data: count } = useQueryValue<number>(
 *     db,
 *     'SELECT COUNT(*) as count FROM users'
 *   )
 *
 *   return <div>Total users: {count ?? 0}</div>
 * }
 * ```
 */
export function useQueryValue<T = unknown>(
  db: ReactiveDatabase,
  sql: string,
  params: any[] = [],
  options: UseQueryOptions = {}
): Omit<UseQueryResult<Record<string, T>>, 'data'> & { data: T | null } {
  const result = useQuery<Record<string, T>>(db, sql, params, options)
  const firstRow = result.data[0]
  const value = firstRow ? Object.values(firstRow)[0] ?? null : null

  return {
    ...result,
    data: value,
  }
}

```

## `src/reactive-sqlite/hooks/useMutation.ts`

```typescript
/**
 * useMutation hook for reactive SQLite mutations
 */

import { useCallback, useState } from 'react'
import type { ReactiveDatabase } from '../database.js'
import type { UseMutationResult, UseMutationOptions } from '../types.js'
import { useDatabaseOptional } from './context.js'

/**
 * Hook to execute mutations with automatic query invalidation
 *
 * @example
 * ```tsx
 * // With explicit db
 * function AddUser() {
 *   const { mutate, isLoading } = useMutation(
 *     db,
 *     'INSERT INTO users (name, email) VALUES (?, ?)'
 *   )
 *
 *   const handleAdd = () => {
 *     mutate('Alice', 'alice@example.com')
 *   }
 *
 *   return <button onClick={handleAdd} disabled={isLoading}>Add User</button>
 * }
 *
 * // With context (inside DatabaseProvider)
 * function AddUser() {
 *   const { mutate } = useMutation('INSERT INTO users (name, email) VALUES (?, ?)')
 *   return <button onClick={() => mutate('Alice', 'alice@example.com')}>Add User</button>
 * }
 * ```
 */
export function useMutation<TParams extends any[] = any[]>(
  sqlOrDb: ReactiveDatabase | string,
  sqlOrOptions?: string | UseMutationOptions,
  optionsOrDb?: UseMutationOptions | ReactiveDatabase
): UseMutationResult<TParams> {
  // Parse overloaded arguments
  const contextDb = useDatabaseOptional()

  let db: ReactiveDatabase
  let sql: string
  let options: UseMutationOptions

  if (typeof sqlOrDb === 'string') {
    // New signature: useMutation(sql, options?, explicitDb?)
    sql = sqlOrDb
    if (typeof sqlOrOptions === 'object' && sqlOrOptions !== null && !('query' in sqlOrOptions)) {
      // sqlOrOptions is UseMutationOptions
      options = sqlOrOptions as UseMutationOptions
      db = (optionsOrDb as ReactiveDatabase) ?? contextDb!
    } else {
      options = {}
      db = (sqlOrOptions as ReactiveDatabase) ?? contextDb!
    }

    if (!db) {
      throw new Error('useMutation requires either a DatabaseProvider or an explicit db argument')
    }
  } else {
    // Legacy signature: useMutation(db, sql, options?)
    db = sqlOrDb
    sql = sqlOrOptions as string
    options = (optionsOrDb as UseMutationOptions) ?? {}
  }

  const { invalidateTables, onSuccess, onError } = options
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const mutate = useCallback(
    (...params: TParams) => {
      setIsLoading(true)
      setError(null)

      try {
        db.run(sql, params)

        // Manual invalidation if specified
        if (invalidateTables) {
          db.invalidate(invalidateTables)
        }

        onSuccess?.()
      } catch (err) {
        const error = err as Error
        setError(error)
        onError?.(error)
      } finally {
        setIsLoading(false)
      }
    },
    [db, sql, invalidateTables, onSuccess, onError]
  )

  const mutateAsync = useCallback(
    async (...params: TParams): Promise<void> => {
      setIsLoading(true)
      setError(null)

      try {
        db.run(sql, params)

        if (invalidateTables) {
          db.invalidate(invalidateTables)
        }

        onSuccess?.()
      } catch (err) {
        const error = err as Error
        setError(error)
        onError?.(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [db, sql, invalidateTables, onSuccess, onError]
  )

  return {
    mutate,
    mutateAsync,
    isLoading,
    error,
  }
}

```

## `src/reactive-sqlite/hooks/useQueryOne.ts`

```typescript
/**
 * useQueryOne hook for reactive SQLite single-row queries
 */

import type { ReactiveDatabase } from '../database.js'
import type { UseQueryResult, UseQueryOptions } from '../types.js'
import { useQuery } from './useQuery.js'

/**
 * Hook to get a single row from a query
 *
 * @example
 * ```tsx
 * function UserProfile({ userId }: { userId: number }) {
 *   const { data: user } = useQueryOne(
 *     db,
 *     'SELECT * FROM users WHERE id = ?',
 *     [userId]
 *   )
 *
 *   if (!user) return <div>User not found</div>
 *
 *   return <div>{user.name}</div>
 * }
 * ```
 */
export function useQueryOne<T = Record<string, unknown>>(
  db: ReactiveDatabase,
  sql: string,
  params: any[] = [],
  options: UseQueryOptions = {}
): Omit<UseQueryResult<T>, 'data'> & { data: T | null } {
  const result = useQuery<T>(db, sql, params, options)
  return {
    ...result,
    data: result.data[0] ?? null,
  }
}

```

## `src/components/agents/claude-cli/stop-conditions.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/components/agents/claude-cli/index.ts`

```typescript
// Claude CLI Module
// Main exports - re-exports everything from submodules

// Argument builder
export {
  buildClaudeArgs,
  modelMap,
  permissionFlags,
  formatMap,
} from './arg-builder.js'

// Stop conditions
export { checkStopConditions } from './stop-conditions.js'

// Output parser
export { parseClaudeOutput } from './output-parser.js'
export type { ParsedOutput } from './output-parser.js'

// Executor functions
export {
  executeClaudeCLI,
  executeClaudeShell,
  executeClaudeCLIOnce,
} from './executor.js'

```

## `src/components/agents/claude-cli/output-parser.ts`

```typescript
// Claude CLI Output Parser
// Parses CLI output to extract result information

import type { ClaudeOutputFormat } from '../types.js'

/**
 * Parsed output structure from Claude CLI
 */
export interface ParsedOutput {
  output: string
  structured?: any
  tokensUsed: { input: number; output: number }
  turnsUsed: number
}

/**
 * Parse Claude CLI output to extract result information
 */
export function parseClaudeOutput(
  stdout: string,
  outputFormat: ClaudeOutputFormat = 'text'
): ParsedOutput {
  const result: ParsedOutput = {
    output: stdout,
    tokensUsed: { input: 0, output: 0 },
    turnsUsed: 1,
  }

  // Try to parse JSON output
  if (outputFormat === 'json' || outputFormat === 'stream-json') {
    try {
      const parsed = JSON.parse(stdout)
      result.structured = parsed
      result.output = typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2)

      // Extract token usage if present
      if (parsed.usage) {
        result.tokensUsed = {
          input: parsed.usage.input_tokens ?? 0,
          output: parsed.usage.output_tokens ?? 0,
        }
      }

      // Extract turn count if present
      if (parsed.turns !== undefined) {
        result.turnsUsed = parsed.turns
      }
    } catch {
      // Not valid JSON, use as-is
    }
  }

  // Try to extract token usage from text output
  const tokenMatch = stdout.match(/tokens?:\s*(\d+)\s*input,?\s*(\d+)\s*output/i)
  if (tokenMatch && tokenMatch[1] && tokenMatch[2]) {
    result.tokensUsed = {
      input: parseInt(tokenMatch[1], 10),
      output: parseInt(tokenMatch[2], 10),
    }
  }

  // Try to extract turn count from text output
  const turnMatch = stdout.match(/turns?:\s*(\d+)/i)
  if (turnMatch && turnMatch[1]) {
    result.turnsUsed = parseInt(turnMatch[1], 10)
  }

  return result
}

```

## `src/components/agents/claude-cli/message-parser.ts`

```typescript
/**
 * Message parser for Claude CLI output.
 * Parses streaming output into discrete message and tool-call entries.
 */

export interface TailLogEntry {
  index: number
  type: 'message' | 'tool-call'
  content: string
  toolName?: string
}

export class MessageParser {
  private buffer: string = ''
  private entries: TailLogEntry[] = []
  private currentIndex: number = 0
  private currentMessage: string = ''
  private maxEntries: number

  // Tool call pattern: lines starting with "Tool:" or tool invocations
  private toolStartPattern = /^(Tool:|TOOL:|\s*<invoke)/m

  constructor(maxEntries: number = 100) {
    this.maxEntries = maxEntries
  }

  parseChunk(chunk: string): void {
    this.buffer += chunk
    this.processBuffer()
  }

  /**
   * Add an entry while enforcing maxEntries limit.
   * Removes oldest entries when limit is exceeded.
   */
  private addEntry(entry: Omit<TailLogEntry, 'index'>): void {
    this.entries.push({
      ...entry,
      index: this.currentIndex++,
    })

    // Enforce maxEntries limit by removing oldest entries
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries)
    }
  }

  private processBuffer(): void {
    // Look for tool call boundaries
    const match = this.buffer.match(this.toolStartPattern)

    if (match && match.index !== undefined) {
      // Text before tool call is a message
      const beforeTool = this.buffer.slice(0, match.index)
      if (beforeTool.trim()) {
        this.currentMessage += beforeTool
      }

      // Flush current message if we have one
      if (this.currentMessage.trim()) {
        this.addEntry({
          type: 'message',
          content: this.currentMessage.trim(),
        })
        this.currentMessage = ''
      }

      // Find end of tool call (next blank line or another tool)
      this.buffer = this.buffer.slice(match.index)
      const toolEnd = this.findToolEnd()

      if (toolEnd > 0) {
        const toolContent = this.buffer.slice(0, toolEnd)
        const toolName = this.extractToolName(toolContent)

        this.addEntry({
          type: 'tool-call',
          content: toolContent.trim(),
          toolName,
        })

        this.buffer = this.buffer.slice(toolEnd)
      }
    } else {
      // No tool call found, accumulate as message
      this.currentMessage += this.buffer
      this.buffer = ''
    }
  }

  private findToolEnd(): number {
    // Find the next tool start (skip the first character to avoid matching current tool)
    const nextTool = this.buffer.slice(1).search(this.toolStartPattern)

    if (nextTool > 0) {
      return nextTool + 1
    }

    // Look for closing </invoke> tag for XML-style tool calls
    if (this.buffer.includes('<invoke')) {
      const closeTag = this.buffer.indexOf('</invoke>')
      if (closeTag > 0) {
        // Find the end of the line after </invoke>
        const afterCloseTag = this.buffer.indexOf('\n', closeTag)
        if (afterCloseTag > 0) {
          return afterCloseTag + 1
        }
      }
      // XML invoke not yet complete
      return -1
    }

    // For "Tool: X" format, look for clear boundaries:
    // Priority order: triple newline > double newline followed by content > double newline at end

    // 1. Triple newline (paragraph break) - most robust
    const tripleNewline = this.buffer.indexOf('\n\n\n')
    if (tripleNewline > 0) {
      return tripleNewline + 3
    }

    // 2. Double newline followed by non-whitespace, non-indented content
    // This handles cases where tool output contains single blank lines
    const doubleNewlineWithContent = /\n\n(?=[A-Za-z\d])/
    const contentMatch = this.buffer.match(doubleNewlineWithContent)
    if (contentMatch && contentMatch.index !== undefined && contentMatch.index > 0) {
      return contentMatch.index + 2
    }

    // 3. Double newline at end of buffer (tool output ended)
    // This is a fallback for when the tool call is the last thing in the stream
    if (this.buffer.endsWith('\n\n')) {
      return this.buffer.length
    }

    // 4. Double newline anywhere (least preferred, for backwards compatibility)
    const doubleNewline = this.buffer.indexOf('\n\n')
    if (doubleNewline > 0) {
      return doubleNewline + 2
    }

    return -1 // Tool not complete yet
  }

  private extractToolName(content: string): string {
    const match = content.match(/(?:Tool:|TOOL:)\s*(\w+)/) ||
                  content.match(/<invoke\s+name="([^"]+)"/)
    return match?.[1] ?? 'unknown'
  }

  flush(): void {
    if (this.currentMessage.trim() || this.buffer.trim()) {
      this.addEntry({
        type: 'message',
        content: (this.currentMessage + this.buffer).trim(),
      })
      this.currentMessage = ''
      this.buffer = ''
    }
  }

  /**
   * Reset parser state for reuse.
   */
  reset(): void {
    this.buffer = ''
    this.entries = []
    this.currentIndex = 0
    this.currentMessage = ''
  }

  getEntries(): TailLogEntry[] {
    return this.entries
  }

  getLatestEntries(n: number): TailLogEntry[] {
    return this.entries.slice(-n)
  }
}

export function truncateToLastLines(content: string, maxLines: number = 10): string {
  const lines = content.split('\n')
  if (lines.length <= maxLines) return content
  return lines.slice(-maxLines).join('\n')
}

```

## `src/components/agents/claude-cli/output-parser.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/components/agents/claude-cli/arg-builder.ts`

```typescript
// Claude CLI Argument Builder
// Builds CLI arguments from execution options

import type { CLIExecutionOptions, ClaudePermissionMode, ClaudeOutputFormat } from '../types.js'

/**
 * Model name mapping from shorthand to full model ID
 */
export const modelMap: Record<string, string> = {
  opus: 'claude-opus-4',
  sonnet: 'claude-sonnet-4',
  haiku: 'claude-haiku-3',
}

/**
 * Permission mode to CLI flag mapping
 */
export const permissionFlags: Record<ClaudePermissionMode, string[]> = {
  default: [],
  acceptEdits: ['--dangerously-skip-permissions'],
  bypassPermissions: ['--dangerously-skip-permissions'],
}

/**
 * Output format mapping
 */
export const formatMap: Record<ClaudeOutputFormat, string> = {
  text: 'text',
  json: 'json',
  'stream-json': 'stream-json',
}

/**
 * Build Claude CLI arguments from options
 */
export function buildClaudeArgs(options: CLIExecutionOptions): string[] {
  const args: string[] = []

  // Print mode for non-interactive execution
  args.push('--print')

  // Model
  if (options.model) {
    const modelId = modelMap[options.model] || options.model
    args.push('--model', modelId)
  }

  // Max turns
  if (options.maxTurns !== undefined) {
    args.push('--max-turns', String(options.maxTurns))
  }

  // Permission mode
  if (options.permissionMode) {
    args.push(...permissionFlags[options.permissionMode])
  }

  // System prompt
  if (options.systemPrompt) {
    args.push('--system-prompt', options.systemPrompt)
  }

  // Output format
  if (options.outputFormat) {
    args.push('--output-format', formatMap[options.outputFormat])
  }

  // MCP config
  if (options.mcpConfig) {
    args.push('--mcp-config', options.mcpConfig)
  }

  // Allowed tools
  if (options.allowedTools && options.allowedTools.length > 0) {
    for (const tool of options.allowedTools) {
      args.push('--allowedTools', tool)
    }
  }

  // Disallowed tools
  if (options.disallowedTools && options.disallowedTools.length > 0) {
    for (const tool of options.disallowedTools) {
      args.push('--disallowedTools', tool)
    }
  }

  // Continue conversation
  if (options.continue) {
    args.push('--continue')
  }

  // Resume session
  if (options.resume) {
    args.push('--resume', options.resume)
  }

  // Add the prompt last
  args.push(options.prompt)

  return args
}

```

## `src/components/agents/claude-cli/message-parser.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/components/agents/claude-cli/stop-conditions.ts`

```typescript
// Claude CLI Stop Condition Checker
// Checks if execution should stop based on configured conditions

import type { StopCondition, AgentResult } from '../types.js'

/**
 * Check if any stop condition is met
 */
export function checkStopConditions(
  conditions: StopCondition[] | undefined,
  partialResult: Partial<AgentResult>
): { shouldStop: boolean; reason?: string } {
  if (!conditions || conditions.length === 0) {
    return { shouldStop: false }
  }

  for (const condition of conditions) {
    switch (condition.type) {
      case 'token_limit': {
        const totalTokens =
          (partialResult.tokensUsed?.input ?? 0) +
          (partialResult.tokensUsed?.output ?? 0)
        if (typeof condition.value === 'number' && totalTokens >= condition.value) {
          return {
            shouldStop: true,
            reason: condition.message ?? `Token limit ${condition.value} exceeded`,
          }
        }
        break
      }

      case 'time_limit': {
        if (
          typeof condition.value === 'number' &&
          (partialResult.durationMs ?? 0) >= condition.value
        ) {
          return {
            shouldStop: true,
            reason: condition.message ?? `Time limit ${condition.value}ms exceeded`,
          }
        }
        break
      }

      case 'turn_limit': {
        if (
          typeof condition.value === 'number' &&
          (partialResult.turnsUsed ?? 0) >= condition.value
        ) {
          return {
            shouldStop: true,
            reason: condition.message ?? `Turn limit ${condition.value} exceeded`,
          }
        }
        break
      }

      case 'pattern': {
        const pattern =
          condition.value instanceof RegExp
            ? condition.value
            : typeof condition.value === 'string'
              ? new RegExp(condition.value)
              : null
        if (pattern && partialResult.output && pattern.test(partialResult.output)) {
          return {
            shouldStop: true,
            reason: condition.message ?? `Pattern matched: ${condition.value}`,
          }
        }
        break
      }

      case 'custom': {
        if (condition.fn && partialResult.output !== undefined) {
          const result: AgentResult = {
            output: partialResult.output ?? '',
            tokensUsed: partialResult.tokensUsed ?? { input: 0, output: 0 },
            turnsUsed: partialResult.turnsUsed ?? 0,
            stopReason: 'completed',
            durationMs: partialResult.durationMs ?? 0,
          }
          if (condition.fn(result)) {
            return {
              shouldStop: true,
              reason: condition.message ?? 'Custom stop condition met',
            }
          }
        }
        break
      }
    }
  }

  return { shouldStop: false }
}

```

## `src/components/agents/claude-cli/arg-builder.test.ts`

This file is a test, schema, or markdown file and will not be copied in full. Its content is omitted for brevity.

## `src/components/agents/claude-cli/executor.ts`

```typescript
// Claude CLI Executor
// Executes Claude CLI commands using Bun

import type { CLIExecutionOptions, AgentResult } from '../types.js'
import {
  generateStructuredOutputPrompt,
  generateRetryPrompt,
  parseStructuredOutput,
} from '../../../utils/structured-output.js'
import { buildClaudeArgs } from './arg-builder.js'
import { checkStopConditions } from './stop-conditions.js'
import { parseClaudeOutput } from './output-parser.js'

/**
 * Execute a single Claude CLI invocation (internal helper)
 */
export async function executeClaudeCLIOnce(
  options: CLIExecutionOptions,
  startTime: number
): Promise<AgentResult & { sessionId?: string }> {
  const args = buildClaudeArgs(options)

  // Build the command
  const command = ['claude', ...args]

  // Set up timeout
  const timeout = options.timeout ?? 300000 // 5 minutes default

  let proc: ReturnType<typeof Bun.spawn> | null = null
  let killed = false

  try {
    // Execute using Bun.spawn for streaming output
    proc = Bun.spawn(command, {
      cwd: options.cwd ?? process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
    })

    // Set up timeout
    const timeoutId = setTimeout(() => {
      if (proc && !killed) {
        killed = true
        proc.kill()
      }
    }, timeout)

    // Collect output
    let stdout = ''
    let stderr = ''

    // Read stdout
    if (!proc.stdout || typeof proc.stdout === 'number') {
      throw new Error('stdout is not a readable stream')
    }
    const stdoutReader = proc.stdout.getReader()
    const decoder = new TextDecoder()

    const readStream = async () => {
      while (true) {
        const { done, value } = await stdoutReader.read()
        if (done) break

        const chunk = decoder.decode(value)
        stdout += chunk

        // Report progress
        options.onProgress?.(chunk)

        // Check stop conditions periodically
        const elapsed = Date.now() - startTime
        const partialResult: Partial<AgentResult> = {
          output: stdout,
          durationMs: elapsed,
        }

        const { shouldStop, reason: _reason } = checkStopConditions(
          options.stopConditions,
          partialResult
        )

        if (shouldStop) {
          killed = true
          proc?.kill()
          clearTimeout(timeoutId)

          return {
            output: stdout,
            tokensUsed: { input: 0, output: 0 },
            turnsUsed: 0,
            stopReason: 'stop_condition' as const,
            durationMs: elapsed,
          }
        }
      }

      return null
    }

    // Read stderr
    const stderrPromise = (async () => {
      if (!proc?.stderr || typeof proc.stderr === 'number') {
        return
      }
      const reader = proc.stderr.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        stderr += decoder.decode(value)
      }
    })()

    // Wait for both streams and exit
    const earlyResult = await readStream()
    if (earlyResult) {
      return earlyResult
    }

    await stderrPromise
    const exitCode = await proc.exited

    clearTimeout(timeoutId)

    const durationMs = Date.now() - startTime

    // Check if we were killed by timeout
    if (killed) {
      return {
        output: stdout || stderr,
        tokensUsed: { input: 0, output: 0 },
        turnsUsed: 0,
        stopReason: 'stop_condition',
        durationMs,
        exitCode: -1,
      }
    }

    // Parse the output
    const parsed = parseClaudeOutput(stdout, options.outputFormat)

    // Try to extract session ID from stderr (Claude CLI outputs session info there)
    const sessionMatch = stderr.match(/session[_-]?id[:\s]+([a-f0-9-]+)/i)
    const sessionId = sessionMatch?.[1]

    // Determine stop reason
    let stopReason: AgentResult['stopReason'] = 'completed'
    if (exitCode !== 0) {
      stopReason = 'error'
    }

    return {
      output: parsed.output,
      structured: parsed.structured,
      tokensUsed: parsed.tokensUsed,
      turnsUsed: parsed.turnsUsed,
      stopReason,
      durationMs,
      exitCode,
      ...(sessionId ? { sessionId } : {}),
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    return {
      output: errorMessage,
      tokensUsed: { input: 0, output: 0 },
      turnsUsed: 0,
      stopReason: 'error',
      durationMs,
      exitCode: -1,
    }
  }
}

/**
 * Execute Claude CLI command and return structured result.
 * If a schema is provided, validates the output and retries with --continue on failure.
 */
export async function executeClaudeCLI(options: CLIExecutionOptions): Promise<AgentResult> {
  const startTime = Date.now()
  const maxSchemaRetries = options.schemaRetries ?? 2

  // If schema is provided, add structured output instructions to system prompt
  let effectiveOptions = { ...options }
  if (options.schema) {
    const schemaPrompt = generateStructuredOutputPrompt(options.schema)
    effectiveOptions.systemPrompt = options.systemPrompt
      ? `${options.systemPrompt}\n\n${schemaPrompt}`
      : schemaPrompt
  }

  // Execute the initial request
  let result = await executeClaudeCLIOnce(effectiveOptions, startTime)

  // If no schema, just return the result
  if (!options.schema) {
    return result
  }

  // Validate against schema and retry on failure
  let schemaRetryCount = 0
  while (schemaRetryCount < maxSchemaRetries) {
    // Skip validation if there was an execution error
    if (result.stopReason === 'error') {
      return result
    }

    // Parse and validate the output
    const parseResult = parseStructuredOutput(result.output, options.schema)

    if (parseResult.success) {
      // Validation passed - return result with typed structured data
      return {
        ...result,
        structured: parseResult.data,
      }
    }

    // Validation failed - retry by continuing the session
    schemaRetryCount++
    options.onProgress?.(
      `Schema validation failed (attempt ${schemaRetryCount}/${maxSchemaRetries}): ${parseResult.error}`
    )

    // Generate retry prompt with error feedback
    const retryPrompt = generateRetryPrompt(result.output, parseResult.error!)

    // Continue the session with the error feedback
    const retryOptions: CLIExecutionOptions = {
      ...effectiveOptions,
      prompt: retryPrompt,
      continue: true, // Use --continue to maintain context
    }

    result = await executeClaudeCLIOnce(retryOptions, startTime)
  }

  // Final validation attempt after all retries
  if (result.stopReason !== 'error') {
    const finalParseResult = parseStructuredOutput(result.output, options.schema)
    if (finalParseResult.success) {
      return {
        ...result,
        structured: finalParseResult.data,
      }
    }

    // All retries exhausted - return error
    return {
      ...result,
      stopReason: 'error',
      output: `Schema validation failed after ${maxSchemaRetries} retries: ${finalParseResult.error}\n\nLast output: ${result.output}`,
    }
  }

  return result
}

/**
 * Execute Claude CLI using Bun.$ shell syntax
 * Simpler alternative for basic usage
 */
export async function executeClaudeShell(
  prompt: string,
  options: Partial<CLIExecutionOptions> = {}
): Promise<AgentResult> {
  const startTime = Date.now()

  const args = buildClaudeArgs({ ...options, prompt })
  const argsString = args.map((arg) => (arg.includes(' ') ? `"${arg}"` : arg)).join(' ')

  try {
    const result = await Bun.$`claude ${argsString}`.text()

    const durationMs = Date.now() - startTime
    const parsed = parseClaudeOutput(result, options.outputFormat)

    return {
      output: parsed.output,
      structured: parsed.structured,
      tokensUsed: parsed.tokensUsed,
      turnsUsed: parsed.turnsUsed,
      stopReason: 'completed',
      durationMs,
      exitCode: 0,
    }
  } catch (error: any) {
    const durationMs = Date.now() - startTime

    return {
      output: error.stderr || error.message || String(error),
      tokensUsed: { input: 0, output: 0 },
      turnsUsed: 0,
      stopReason: 'error',
      durationMs,
      exitCode: error.exitCode ?? -1,
    }
  }
}

```

## `src/components/agents/types/execution.ts`

```typescript
// Execution-related type definitions for Smithers orchestrator

import type { z } from 'zod'
import type { StopCondition, ClaudeModel, ClaudePermissionMode, ClaudeOutputFormat } from './agents.js'

// ============================================================================
// Stop Conditions
// ============================================================================

export type StopConditionType =
  | 'token_limit'
  | 'time_limit'
  | 'turn_limit'
  | 'pattern'
  | 'custom'

export type StopReason = 'completed' | 'stop_condition' | 'error' | 'cancelled'

// ============================================================================
// Agent Result
// ============================================================================

export interface AgentResult<T = any> {
  /**
   * Raw text output from the agent
   */
  output: string

  /**
   * Structured output (if JSON output was requested or schema was provided)
   * When a Zod schema is provided, this will be typed according to the schema.
   */
  structured?: T

  /**
   * Token usage
   */
  tokensUsed: {
    input: number
    output: number
  }

  /**
   * Number of turns used
   */
  turnsUsed: number

  /**
   * Reason the agent stopped
   */
  stopReason: StopReason

  /**
   * Execution duration in milliseconds
   */
  durationMs: number

  /**
   * Exit code from CLI (if applicable)
   */
  exitCode?: number

  /**
   * Session ID for resuming the conversation
   */
  sessionId?: string
}

// ============================================================================
// CLI Execution Options
// ============================================================================

export interface CLIExecutionOptions {
  /**
   * The prompt to send
   */
  prompt: string

  /**
   * Model to use
   */
  model?: ClaudeModel

  /**
   * Permission mode
   */
  permissionMode?: ClaudePermissionMode

  /**
   * Maximum turns
   */
  maxTurns?: number

  /**
   * System prompt
   */
  systemPrompt?: string

  /**
   * Output format
   */
  outputFormat?: ClaudeOutputFormat

  /**
   * MCP config path
   */
  mcpConfig?: string

  /**
   * Allowed tools
   */
  allowedTools?: string[]

  /**
   * Disallowed tools
   */
  disallowedTools?: string[]

  /**
   * Timeout in milliseconds
   */
  timeout?: number

  /**
   * Working directory
   */
  cwd?: string

  /**
   * Continue conversation
   */
  continue?: boolean

  /**
   * Resume session ID
   */
  resume?: string

  /**
   * Stop conditions to monitor
   */
  stopConditions?: StopCondition[]

  /**
   * Progress callback
   */
  onProgress?: (message: string) => void

  /**
   * Tool call callback
   */
  onToolCall?: (tool: string, input: any) => void

  /**
   * Zod schema for structured output validation
   */
  schema?: z.ZodType

  /**
   * Maximum retries for schema validation failures
   * @default 2
   */
  schemaRetries?: number
}

```

## `src/components/agents/types/index.ts`

```typescript
// Barrel export for agent types
// Re-exports all types from the split type files

export type { JSONSchema } from './schema.js'

export type { ToolContext, Tool, MCPServer } from './tools.js'

export type {
  BaseAgentProps,
  ClaudeProps,
  ClaudeModel,
  ClaudePermissionMode,
  ClaudeOutputFormat,
  StopCondition,
} from './agents.js'

export type {
  CLIExecutionOptions,
  AgentResult,
  StopConditionType,
  StopReason,
} from './execution.js'

```

## `src/components/agents/types/tools.ts`

```typescript
// Tool and MCP Server type definitions for Smithers orchestrator

import type { JSONSchema } from './schema.js'

// ============================================================================
// Tool Context
// ============================================================================

export interface ToolContext {
  /**
   * Current execution ID
   */
  executionId: string

  /**
   * Current agent ID
   */
  agentId: string

  /**
   * Working directory
   */
  cwd: string

  /**
   * Environment variables
   */
  env: Record<string, string>

  /**
   * Log a message
   */
  log: (message: string) => void
}

// ============================================================================
// Tool Definition
// ============================================================================

export interface Tool {
  /**
   * Tool name (must be unique)
   */
  name: string

  /**
   * Human-readable description
   */
  description: string

  /**
   * JSON Schema for input validation
   */
  inputSchema: JSONSchema

  /**
   * Execute the tool with given input
   */
  execute: (input: any, context: ToolContext) => Promise<any>
}

// ============================================================================
// MCP Server Definition
// ============================================================================

export interface MCPServer {
  /**
   * Server name (for identification)
   */
  name: string

  /**
   * Command to run the MCP server
   */
  command: string

  /**
   * Command arguments
   */
  args?: string[]

  /**
   * Environment variables
   */
  env?: Record<string, string>
}

```

## `src/components/agents/types/agents.ts`

```typescript
// Agent props type definitions for Smithers orchestrator

import type { ReactNode } from 'react'
import type { z } from 'zod'
import type { Tool, MCPServer } from './tools.js'
import type { AgentResult, StopConditionType } from './execution.js'

// ============================================================================
// Stop Condition (defined here to avoid circular dependency)
// ============================================================================

export interface StopCondition {
  /**
   * Type of stop condition
   */
  type: StopConditionType

  /**
   * Value for the condition (interpretation depends on type)
   * - token_limit: max tokens
   * - time_limit: max milliseconds
   * - turn_limit: max turns
   * - pattern: regex pattern to match in output
   */
  value?: number | string | RegExp

  /**
   * Custom function for 'custom' type
   */
  fn?: (result: AgentResult) => boolean

  /**
   * Human-readable message when condition triggers
   */
  message?: string
}

// ============================================================================
// Base Agent Props
// ============================================================================

export interface BaseAgentProps {
  /**
   * The prompt to send to the agent (usually as children)
   */
  children: ReactNode

  /**
   * Tools available to the agent
   * Can be:
   * - string: built-in tool name
   * - Tool: custom tool definition
   * - MCPServer: MCP server to connect to
   */
  tools?: (string | Tool | MCPServer)[]

  /**
   * Conditions that will stop the agent
   */
  stopConditions?: StopCondition[]

  /**
   * Maximum number of turns (agentic loops)
   */
  maxTurns?: number

  /**
   * Maximum tokens for output
   */
  maxTokens?: number

  /**
   * Timeout in milliseconds
   */
  timeout?: number

  /**
   * Called when agent finishes successfully
   */
  onFinished?: (result: AgentResult) => void

  /**
   * Called when agent encounters an error
   */
  onError?: (error: Error) => void

  /**
   * Called when agent makes a tool call
   */
  onToolCall?: (tool: string, input: any) => void

  /**
   * Called for progress updates
   */
  onProgress?: (message: string) => void

  /**
   * Enable database reporting for this agent
   */
  reportingEnabled?: boolean

  /**
   * Validate the result before accepting
   */
  validate?: (result: AgentResult) => boolean | Promise<boolean>

  /**
   * Retry if validation fails
   */
  retryOnValidationFailure?: boolean

  /**
   * Maximum retry attempts
   */
  maxRetries?: number

  /**
   * System prompt for the agent
   */
  systemPrompt?: string
}

// ============================================================================
// Claude-Specific Props
// ============================================================================

export type ClaudeModel = 'opus' | 'sonnet' | 'haiku' | string

export type ClaudePermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions'

export type ClaudeOutputFormat = 'text' | 'json' | 'stream-json'

export interface ClaudeProps<TSchema extends z.ZodType = z.ZodType> extends BaseAgentProps {
  /**
   * Claude model to use
   * - 'opus': Claude Opus (most capable)
   * - 'sonnet': Claude Sonnet (balanced)
   * - 'haiku': Claude Haiku (fastest)
   * - string: custom model ID
   */
  model?: ClaudeModel

  /**
   * Permission mode for file operations
   * - 'default': ask for permission
   * - 'acceptEdits': auto-accept edits
   * - 'bypassPermissions': skip all permission checks
   */
  permissionMode?: ClaudePermissionMode

  /**
   * Path to MCP configuration file
   */
  mcpConfig?: string

  /**
   * Output format
   * - 'text': plain text output
   * - 'json': structured JSON output
   * - 'stream-json': streaming JSON output
   */
  outputFormat?: ClaudeOutputFormat

  /**
   * Specific tools to allow (whitelist)
   */
  allowedTools?: string[]

  /**
   * Specific tools to disallow (blacklist)
   */
  disallowedTools?: string[]

  /**
   * Continue from previous conversation
   */
  continueConversation?: boolean

  /**
   * Resume a specific session
   */
  resumeSession?: string

  /**
   * Zod schema for structured output validation.
   * When provided, the output will be parsed and validated against this schema.
   * If validation fails, the session will be resumed with error feedback.
   */
  schema?: TSchema

  /**
   * Maximum retries for schema validation failures.
   * @default 2
   */
  schemaRetries?: number

  /**
   * Number of tail log entries to display during execution.
   * @default 10
   */
  tailLogCount?: number

  /**
   * Number of lines to show per tail log entry.
   * @default 10
   */
  tailLogLines?: number
}

```

## `src/components/agents/types/schema.ts`

```typescript
// JSON Schema type definitions for Smithers orchestrator

// ============================================================================
// JSON Schema type (simplified)
// ============================================================================

export interface JSONSchema {
  type?: string
  properties?: Record<string, JSONSchema>
  required?: string[]
  items?: JSONSchema
  enum?: any[]
  description?: string
  default?: any
  [key: string]: any
}

```


