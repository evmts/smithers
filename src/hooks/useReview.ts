import { useRef } from 'react'
import { z } from 'zod'
import { useSmithers } from '../components/SmithersProvider.js'
import { useExecutionScope } from '../components/ExecutionScope.js'
import { addGitNotes } from '../utils/vcs.js'
import type { ReviewTarget, ReviewResult, ReviewProps, ReviewIssue, ReviewAgent } from '../components/Review/types.js'
import { useMountedState, useExecutionMount } from '../reconciler/hooks.js'
import { useVersionTracking } from '../reactive-sqlite/index.js'
import { executeClaudeCLI } from '../components/agents/ClaudeCodeCLI.js'
import { executeAmpCLI } from '../components/Amp.js'
import { executeCodexCLI } from '../components/agents/codex-cli/executor.js'

const ReviewIssueSchema = z.object({
  severity: z.enum(['critical', 'major', 'minor']),
  file: z.string().optional(),
  line: z.preprocess((value) => {
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
    return value
  }, z.number().int().positive()).optional(),
  message: z.string(),
  suggestion: z.string().optional(),
})

const ReviewResultSchema = z.object({
  approved: z.boolean(),
  summary: z.string().default(''),
  issues: z.array(ReviewIssueSchema).default([]),
})

function normalizeReviewResult(result: z.infer<typeof ReviewResultSchema>): ReviewResult {
  const issues: ReviewIssue[] = result.issues.map((issue) => {
    const normalized: ReviewIssue = {
      severity: issue.severity,
      message: issue.message,
    }
    if (issue.file) normalized.file = issue.file
    if (issue.line !== undefined) normalized.line = issue.line
    if (issue.suggestion) normalized.suggestion = issue.suggestion
    return normalized
  })

  return {
    approved: result.approved,
    summary: result.summary,
    issues,
  }
}

const MAX_REVIEW_CHARS = 120_000

function truncateReviewContent(content: string, maxChars = MAX_REVIEW_CHARS): string {
  if (content.length <= maxChars) return content
  const headSize = Math.max(1000, Math.floor(maxChars * 0.6))
  const tailSize = Math.max(1000, Math.floor(maxChars * 0.35))
  const omitted = content.length - headSize - tailSize
  const head = content.slice(0, headSize)
  const tail = content.slice(-tailSize)
  return `${head}\n\n... [truncated ${omitted} chars] ...\n\n${tail}`
}

async function fetchTargetContent(target: ReviewTarget): Promise<string> {
  switch (target.type) {
    case 'commit': {
      const ref = target.ref ?? 'HEAD'
      const result = await Bun.$`git show ${ref}`.text()
      return truncateReviewContent(result)
    }

    case 'diff': {
      const ref = target.ref
      if (ref) {
        const result = await Bun.$`git diff ${ref}`.text()
        return truncateReviewContent(result)
      } else {
        const result = await Bun.$`git diff`.text()
        return truncateReviewContent(result)
      }
    }

    case 'pr': {
      if (!target.ref) {
        throw new Error('PR number required for pr target type')
      }
      if (!/^\d+$/.test(target.ref)) {
        throw new Error('PR ref must be a numeric ID')
      }
      const result = await Bun.$`gh pr view ${target.ref} --json body,title,files,additions,deletions,commits`.text()
      const prData = JSON.parse(result)

      const diffResult = await Bun.$`gh pr diff ${target.ref}`.text()

      return truncateReviewContent(`PR #${target.ref}: ${prData.title}

${prData.body}

Files changed: ${prData.files?.length ?? 0}
Additions: ${prData.additions}
Deletions: ${prData.deletions}

Diff:
${diffResult}`)
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
      return truncateReviewContent(contents.join('\n\n'))
    }

    default:
      throw new Error(`Unknown target type: ${(target as any).type}`)
  }
}

function buildReviewPrompt(content: string, criteria?: string[]): string {
  const clippedContent = truncateReviewContent(content)
  const criteriaText = criteria && criteria.length > 0
    ? `\nReview Criteria:\n${criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
    : ''

  return `You are a code reviewer. Review the following code changes and provide feedback.

${criteriaText}

Rules:
- Set approved to false if there are any critical issues
- Set approved to false if there are more than 2 major issues
- Be constructive and specific in your feedback
- Focus on correctness, security, performance, and maintainability

Return ONLY valid JSON that matches the review schema.

Content to review (may be truncated):
${clippedContent}`
}

async function executeReview(prompt: string, agent: ReviewAgent = 'claude', model?: string): Promise<ReviewResult> {
  let output: string
  let stopReason: string | undefined
  let structured: unknown

  switch (agent) {
    case 'claude': {
      const result = await executeClaudeCLI({
        prompt,
        ...(model && { model }),
        outputFormat: 'text',
        schema: ReviewResultSchema,
      })
      output = result.output
      stopReason = result.stopReason
      structured = result.structured
      break
    }

    case 'amp': {
      const result = await executeAmpCLI({
        prompt: `${prompt}\n\nReturn ONLY valid JSON matching: ${JSON.stringify(ReviewResultSchema.shape)}`,
        mode: 'smart',
        permissionMode: 'bypassPermissions',
      })
      output = result.output
      stopReason = result.stopReason
      // Parse JSON from output
      try {
        const jsonMatch = result.output.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          structured = ReviewResultSchema.parse(JSON.parse(jsonMatch[0]))
        }
      } catch {
        structured = undefined
      }
      break
    }

    case 'codex': {
      const result = await executeCodexCLI({
        prompt: `${prompt}\n\nReturn ONLY valid JSON matching: ${JSON.stringify(ReviewResultSchema.shape)}`,
        fullAuto: true,
      })
      output = result.output
      stopReason = result.stopReason
      // Parse JSON from output
      try {
        const jsonMatch = result.output.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          structured = ReviewResultSchema.parse(JSON.parse(jsonMatch[0]))
        }
      } catch {
        structured = undefined
      }
      break
    }

    default:
      throw new Error(`Unknown review agent: ${agent}`)
  }

  if (stopReason === 'error' || !structured) {
    const reason = stopReason === 'error'
      ? output
      : `Stopped: ${stopReason}. ${output}`
    return {
      approved: false,
      summary: 'Review execution failed',
      issues: [{
        severity: 'critical',
        message: reason.slice(0, 500),
      }],
    }
  }

  return normalizeReviewResult(structured as z.infer<typeof ReviewResultSchema>)
}

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

export interface UseReviewResult {
  status: 'pending' | 'running' | 'complete' | 'error'
  result: ReviewResult | null
  error: Error | null
}

export function useReview(props: ReviewProps): UseReviewResult {
  const smithers = useSmithers()
  const executionScope = useExecutionScope()
  const statusRef = useRef<'pending' | 'running' | 'complete' | 'error'>('pending')
  const resultRef = useRef<ReviewResult | null>(null)
  const errorRef = useRef<Error | null>(null)
  const { invalidateAndUpdate } = useVersionTracking()

  const taskIdRef = useRef<string | null>(null)
  const isMounted = useMountedState()

  const shouldExecute = smithers.executionEnabled && executionScope.enabled
  useExecutionMount(shouldExecute, () => {
    ;(async () => {
      taskIdRef.current = smithers.db.tasks.start('review', undefined, { scopeId: executionScope.scopeId })

      try {
        statusRef.current = 'running'
        invalidateAndUpdate()

        const content = await fetchTargetContent(props.target)

        const prompt = buildReviewPrompt(content, props.criteria)

        const reviewResult = await executeReview(prompt, props.agent ?? 'claude', props.model)

        const reviewId = await smithers.db.vcs.logReview({
          target_type: props.target.type,
          ...(props.target.ref ? { target_ref: props.target.ref } : {}),
          approved: reviewResult.approved,
          summary: reviewResult.summary,
          issues: reviewResult.issues,
          reviewer_model: props.model ?? 'claude-sonnet-4',
          ...(props.blocking !== undefined ? { blocking: props.blocking } : {}),
        })

        if (props.postToGitHub && props.target.type === 'pr' && props.target.ref) {
          await postToGitHubPR(props.target.ref, reviewResult)
          await smithers.db.vcs.updateReview(reviewId, { posted_to_github: true })
        }

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
          invalidateAndUpdate()
          props.onFinished?.(reviewResult)

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
          invalidateAndUpdate()
          props.onError?.(errorObj)
        }
      } finally {
        if (taskIdRef.current) {
          smithers.db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  }, [props.blocking, props.criteria, props.model, props.onFinished, props.postToGitHub, props.postToGitNotes, props.target, smithers])

  return {
    status: statusRef.current,
    result: resultRef.current,
    error: errorRef.current,
  }
}
