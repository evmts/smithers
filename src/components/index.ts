import { createElement, type ReactElement, type ReactNode } from 'react'
import type {
  ClaudeProps,
  ClaudeCliProps,
  SubagentProps,
  PhaseProps,
  StepProps,
  PersonaProps,
  ConstraintsProps,
  OutputFormatProps,
  TaskProps,
  StopProps,
  HumanProps,
} from '../core/types.js'

/**
 * Main agent component - wraps Claude SDK
 *
 * @example
 * ```tsx
 * <Claude tools={[fileTool]} onFinished={setResult}>
 *   Analyze the codebase.
 * </Claude>
 * ```
 */
export function Claude(props: ClaudeProps): ReactElement {
  return createElement('claude', props)
}

/**
 * CLI-based agent component - uses Claude CLI instead of SDK
 *
 * Uses your Claude Code subscription instead of API credits.
 * Simpler than <Claude> - no custom tools, streaming, or MCP configuration.
 * The CLI handles its own tool execution loop.
 *
 * @example
 * ```tsx
 * <ClaudeCli model="opus" onFinished={setResult}>
 *   Analyze the codebase and summarize the architecture.
 * </ClaudeCli>
 * ```
 */
export function ClaudeCli(props: ClaudeCliProps): ReactElement {
  return createElement('claude-cli', props)
}

/**
 * Parallel execution boundary for sub-agents
 *
 * @example
 * ```tsx
 * <Subagent name="researcher" parallel>
 *   <Claude>Research the topic.</Claude>
 * </Subagent>
 * ```
 */
export function Subagent(props: SubagentProps): ReactElement {
  return createElement('subagent', { parallel: true, ...props })
}

/**
 * Semantic phase grouping
 *
 * @example
 * ```tsx
 * <Phase name="research">
 *   <Step>Search for sources</Step>
 *   <Step>Extract key findings</Step>
 * </Phase>
 *
 * // Mark phase as already completed (skipped by Ralph loop)
 * <Phase name="research" completed>
 *   ...
 * </Phase>
 * ```
 */
export function Phase(props: PhaseProps): ReactElement {
  return createElement('phase', props)
}

/**
 * Semantic step marker
 *
 * @example
 * ```tsx
 * <Step>Read the existing code</Step>
 *
 * // Mark step as already completed (skipped by Ralph loop)
 * <Step completed>Already done this step</Step>
 * ```
 */
export function Step(props: StepProps): ReactElement {
  return createElement('step', props)
}

/**
 * Agent persona/role definition
 *
 * @example
 * ```tsx
 * <Persona role="security expert">
 *   You have 10 years of experience in application security.
 * </Persona>
 * ```
 */
export function Persona(props: PersonaProps): ReactElement {
  return createElement('persona', props)
}

/**
 * Rules and constraints for the agent
 *
 * @example
 * ```tsx
 * <Constraints>
 *   - Keep responses under 100 words
 *   - Focus on security issues only
 * </Constraints>
 * ```
 */
export function Constraints(props: ConstraintsProps): ReactElement {
  return createElement('constraints', props)
}

/**
 * Expected output format specification
 *
 * @example
 * ```tsx
 * <OutputFormat schema={{ type: 'object', properties: { summary: { type: 'string' } } }}>
 *   Return a JSON object with a "summary" field.
 * </OutputFormat>
 * ```
 */
export function OutputFormat(props: OutputFormatProps): ReactElement {
  return createElement('output-format', props)
}

/**
 * Trackable task with completion state
 *
 * @example
 * ```tsx
 * <Task done={false}>Research the topic</Task>
 * <Task done={true}>Write the outline</Task>
 * ```
 */
export function Task(props: TaskProps): ReactElement {
  return createElement('task', props)
}

/**
 * Signals the Ralph Wiggum loop to halt execution
 *
 * When a Stop component is rendered in the tree, the execution loop
 * will complete any currently running agents and then halt, preventing
 * further iterations of the loop.
 *
 * @example
 * ```tsx
 * {isComplete && <Stop reason="All tasks completed" />}
 * ```
 */
export function Stop(props: StopProps): ReactElement {
  return createElement('stop', props)
}

/**
 * Pauses execution and waits for human approval/input
 *
 * When a Human component is rendered in the tree, the execution loop
 * will pause and prompt the user for approval before continuing.
 * This is useful for requiring manual review at critical points.
 *
 * @example
 * ```tsx
 * {needsReview && (
 *   <Human message="Review the changes before deploying">
 *     The following changes will be deployed to production...
 *   </Human>
 * )}
 * ```
 */
export function Human(props: HumanProps): ReactElement {
  return createElement('human', props)
}

// Re-export types
export type {
  ClaudeProps,
  ClaudeCliProps,
  SubagentProps,
  PhaseProps,
  StepProps,
  PersonaProps,
  ConstraintsProps,
  OutputFormatProps,
  TaskProps,
  StopProps,
  HumanProps,
}
