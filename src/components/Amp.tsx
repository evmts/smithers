import type { ReactNode } from 'react'
import { useAmp } from '../hooks/useAmp.js'
import { truncateToLastLines } from './agents/claude-cli/message-parser.js'
import type { AmpProps } from './agents/types/amp.js'

/**
 * Amp Agent Component
 *
 * Executes Amp CLI as a React component with database tracking,
 * progress reporting, and retry logic.
 *
 * @example
 * ```tsx
 * <Amp mode="smart" onFinished={(result) => console.log(result.output)}>
 *   Fix the bug in src/utils.ts
 * </Amp>
 * ```
 */
export function Amp(props: AmpProps): ReactNode {
  const { status, agentId, executionId, mode, result, error, tailLog } = useAmp(props)

  const maxEntries = props.tailLogCount ?? 10
  const maxLines = props.tailLogLines ?? 10
  const displayEntries = status === 'complete'
    ? tailLog.slice(-1)
    : tailLog.slice(-maxEntries)

  return (
    <amp
      status={status}
      agentId={agentId}
      executionId={executionId}
      mode={mode}
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
    </amp>
  )
}

export type { AmpProps }
export { executeAmpCLI } from './agents/amp-cli/executor.js'
