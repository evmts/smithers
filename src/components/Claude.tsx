import type { ReactNode } from 'react'
import { useClaude } from '../hooks/useClaude.js'
import { truncateToLastLines } from './agents/claude-cli/message-parser.js'
import type { ClaudeProps, AgentResult } from './agents/types.js'

/**
 * Claude Agent Component
 *
 * Executes Claude CLI as a React component with database tracking,
 * progress reporting, and retry logic.
 *
 * @example
 * ```tsx
 * <Claude model="sonnet" onFinished={(result) => console.log(result.output)}>
 *   Fix the bug in src/utils.ts
 * </Claude>
 * ```
 */
export function Claude(props: ClaudeProps): ReactNode {
  const { status, agentId, executionId, model, result, error, tailLog } = useClaude(props)

  const maxEntries = props.tailLogCount ?? 10
  const maxLines = props.tailLogLines ?? 10
  const displayEntries = status === 'complete'
    ? tailLog.slice(-1)
    : tailLog.slice(-maxEntries)

  return (
    <claude
      status={status}
      agentId={agentId}
      executionId={executionId}
      model={model}
      {...(error?.message ? { error: error.message } : {})}
      {...(result?.tokensUsed?.input !== undefined ? { tokensInput: result.tokensUsed.input } : {})}
      {...(result?.tokensUsed?.output !== undefined ? { tokensOutput: result.tokensUsed.output } : {})}
      {...(result?.turnsUsed !== undefined ? { turnsUsed: result.turnsUsed } : {})}
      {...(result?.durationMs !== undefined ? { durationMs: result.durationMs } : {})}
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

export type { ClaudeProps, AgentResult }
export { executeClaudeCLI } from './agents/ClaudeCodeCLI.js'
