import { execSync } from 'child_process'
import { escapeShellArg, getCommitHash, getCommitShortHash } from '../utils/git.js'

export async function runCodexReview(diff: string, commitMsg: string): Promise<string> {
  const prompt = `Review this git commit. If the code looks good with no significant issues, respond with exactly 'LGTM'. Otherwise, provide specific actionable feedback (bugs, security issues, performance problems, code quality concerns). Be concise.

Commit Message: ${commitMsg}

Diff:
${diff}`

  try {
    const review = execSync(`codex exec --full-auto "${escapeShellArg(prompt)}"`, {
      encoding: 'utf-8',
    })
    return review.trim()
  } catch (error) {
    throw new Error(`Codex review failed: ${error}`)
  }
}

export function isLGTM(review: string): boolean {
  const normalized = review.toLowerCase().trim()
  return (
    normalized === 'lgtm' ||
    normalized.includes('looks good') ||
    normalized.includes('no issues') ||
    normalized.includes('no problems')
  )
}

export function formatReview(review: string, commit: string, message: string): string {
  const hash = getCommitHash(commit)
  const shortHash = getCommitShortHash(commit)
  const date = new Date().toISOString()

  return `# Review: ${shortHash}

**Commit:** ${hash}
**Message:** ${message.split('\n')[0]}
**Date:** ${date}

## Feedback

${review}
`
}
