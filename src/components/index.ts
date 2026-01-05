import { createElement, type ReactElement, type ReactNode } from 'react'
import type {
  ClaudeProps,
  SubagentProps,
  PhaseProps,
  StepProps,
  PersonaProps,
  ConstraintsProps,
  OutputFormatProps,
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

// Re-export types
export type {
  ClaudeProps,
  SubagentProps,
  PhaseProps,
  StepProps,
  PersonaProps,
  ConstraintsProps,
  OutputFormatProps,
}
