import { useRef, useReducer, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider.js'
import { addGitNotes } from '../../utils/vcs.js'
import type { ReviewTarget, ReviewResult, ReviewProps } from './types.js'
import { useMountedState, useExecutionMount } from '../../reconciler/hooks.js'
import { useExecutionContext } from '../ExecutionContext.js'
import { PlanNodeProvider, usePlanNodeProps } from '../PlanNodeContext.js'

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
  const execution = useExecutionContext()
  const { nodeId, planNodeProps } = usePlanNodeProps()
  const statusRef = useRef<'pending' | 'running' | 'complete' | 'error'>('pending')
  const resultRef = useRef<ReviewResult | null>(null)
  const errorRef = useRef<Error | null>(null)
  const [, forceUpdate] = useReducer(x => x + 1, 0)

  const taskIdRef = useRef<string | null>(null)
  const isMounted = useMountedState()

  const shouldExecute = smithers.executionEnabled && execution.isActive
  useExecutionMount(shouldExecute, () => {
    // Fire-and-forget async IIFE
    ;(async () => {
      // Register task with database
      taskIdRef.current = smithers.db.tasks.start('review')

      try {
        statusRef.current = 'running'
        forceUpdate()

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
          resultRef.current = reviewResult
          statusRef.current = 'complete'
          forceUpdate()
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
          errorRef.current = errorObj
          statusRef.current = 'error'
          forceUpdate()
          props.onError?.(errorObj)
        }
      } finally {
        // Complete task
        if (taskIdRef.current) {
          smithers.db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  }, [props.blocking, props.criteria, props.model, props.onFinished, props.postToGitHub, props.postToGitNotes, props.target, smithers])

  return (
    <PlanNodeProvider nodeId={nodeId}>
      <review
        status={statusRef.current}
        approved={resultRef.current?.approved}
        summary={resultRef.current?.summary}
        issue-count={resultRef.current?.issues.length}
        error={errorRef.current?.message}
        target-type={props.target.type}
        target-ref={props.target.ref}
        blocking={props.blocking}
        {...planNodeProps}
      />
    </PlanNodeProvider>
  )
}
