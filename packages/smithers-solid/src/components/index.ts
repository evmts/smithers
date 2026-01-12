import type { JSX } from 'solid-js'
import type { SmithersNode } from '../renderer.js'

// Type definitions (will import from @evmts/smithers when built)
interface ClaudeProps {
  onFinished?: (output: unknown) => void
  onError?: (error: Error) => void
  children?: JSX.Element
  allowedTools?: string[]
  disallowedTools?: string[]
  tools?: string[] | { type: 'preset'; preset: 'claude_code' }
  model?: string
  maxTurns?: number
  systemPrompt?: string | { type: 'preset'; preset: 'claude_code'; append?: string }
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk'
  cwd?: string
  [key: string]: unknown
}

interface ClaudeApiProps {
  tools?: unknown[]
  onFinished?: (output: unknown) => void
  onError?: (error: Error) => void
  children?: JSX.Element
  system?: string
  maxToolIterations?: number
  stream?: boolean
  [key: string]: unknown
}

interface SubagentProps {
  name?: string
  parallel?: boolean
  children?: JSX.Element
}

interface PhaseProps {
  name: string
  completed?: boolean
  children?: JSX.Element
  [key: string]: unknown
}

interface StepProps {
  completed?: boolean
  children?: JSX.Element
}

interface PersonaProps {
  role: string
  children?: JSX.Element
  [key: string]: unknown
}

interface ConstraintsProps {
  children?: JSX.Element
}

interface OutputFormatProps {
  schema?: Record<string, unknown>
  children?: JSX.Element
}

interface HumanProps {
  message?: string
  onApprove?: () => void
  onReject?: () => void
  children?: JSX.Element
}

interface StopProps {
  reason?: string
  children?: JSX.Element
}

interface OutputProps {
  format?: 'text' | 'json' | 'markdown'
  label?: string
  children?: JSX.Element
}

interface FileProps {
  path: string
  mode?: 'write' | 'append'
  encoding?: BufferEncoding
  createDirs?: boolean
  onWritten?: (path: string) => void
  onError?: (error: Error) => void
  children?: JSX.Element
  [key: string]: unknown
}

interface WorktreeProps {
  path: string
  branch?: string
  cleanup?: boolean
  baseBranch?: string
  onCreated?: (path: string, branch?: string) => void
  onError?: (error: Error) => void
  onCleanup?: (path: string) => void
  children?: JSX.Element
  [key: string]: unknown
}

// Declare lowercase JSX intrinsic elements for the host components
declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      claude: ClaudeProps
      'claude-api': ClaudeApiProps
      'claude-cli': ClaudeApiProps
      subagent: SubagentProps
      phase: PhaseProps
      step: StepProps
      persona: PersonaProps
      constraints: ConstraintsProps
      'output-format': OutputFormatProps
      human: HumanProps
      stop: StopProps
      output: OutputProps
      file: FileProps
      worktree: WorktreeProps
    }
  }
}

/**
 * Create a host element for the Smithers renderer
 *
 * This is the low-level function used by all components.
 * It creates a SmithersNode and attaches children.
 */
function createHostElement(
  type: string,
  props: Record<string, unknown>
): SmithersNode {
  const node: SmithersNode = {
    type,
    props: {},
    children: [],
    parent: null,
  }

  // Set properties (excluding children)
  for (const [key, value] of Object.entries(props)) {
    if (key !== 'children' && value !== undefined) {
      node.props[key] = value
    }
  }

  return node
}

/**
 * Main agent component - uses Claude Agent SDK
 */
export function Claude(props: ClaudeProps): SmithersNode {
  return createHostElement('claude', props as Record<string, unknown>)
}

/**
 * API-based agent component - uses Anthropic API SDK directly
 */
export function ClaudeApi(props: ClaudeApiProps): SmithersNode {
  return createHostElement('claude-api', props as Record<string, unknown>)
}

/**
 * @deprecated Use Claude instead
 */
export function ClaudeCli(props: ClaudeApiProps): SmithersNode {
  return createHostElement('claude-cli', props as Record<string, unknown>)
}

/**
 * Parallel execution boundary for sub-agents
 */
export function Subagent(props: SubagentProps): SmithersNode {
  return createHostElement('subagent', { parallel: true, ...props } as Record<string, unknown>)
}

/**
 * Semantic phase grouping
 */
export function Phase(props: PhaseProps): SmithersNode {
  return createHostElement('phase', props as Record<string, unknown>)
}

/**
 * Semantic step marker
 */
export function Step(props: StepProps): SmithersNode {
  return createHostElement('step', props as Record<string, unknown>)
}

/**
 * Agent persona/role definition
 */
export function Persona(props: PersonaProps): SmithersNode {
  return createHostElement('persona', props as Record<string, unknown>)
}

/**
 * Rules and constraints for the agent
 */
export function Constraints(props: ConstraintsProps): SmithersNode {
  return createHostElement('constraints', props as Record<string, unknown>)
}

/**
 * Specifies the expected output format/structure
 */
export function OutputFormat(props: OutputFormatProps): SmithersNode {
  return createHostElement('output-format', props as Record<string, unknown>)
}

/**
 * Pauses execution and waits for human approval
 */
export function Human(props: HumanProps): SmithersNode {
  return createHostElement('human', props as Record<string, unknown>)
}

/**
 * Signals the Ralph Wiggum loop to halt execution
 */
export function Stop(props: StopProps): SmithersNode {
  return createHostElement('stop', props as Record<string, unknown>)
}

/**
 * Renders output to the terminal
 */
export function Output(props: OutputProps): SmithersNode {
  return createHostElement('output', props as Record<string, unknown>)
}

/**
 * Writes or updates files during execution
 */
export function File(props: FileProps): SmithersNode {
  return createHostElement('file', props as Record<string, unknown>)
}

/**
 * Enables parallel agent isolation using git worktrees
 */
export function Worktree(props: WorktreeProps): SmithersNode {
  return createHostElement('worktree', props as Record<string, unknown>)
}

// Re-export types
export type {
  ClaudeProps,
  ClaudeApiProps,
  SubagentProps,
  PhaseProps,
  StepProps,
  PersonaProps,
  ConstraintsProps,
  OutputFormatProps,
  HumanProps,
  StopProps,
  OutputProps,
  FileProps,
  WorktreeProps,
}
