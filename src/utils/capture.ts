/**
 * Capture utilities - classification, template generation, and file I/O
 * for /capture command
 */

// ============================================================================
// Types
// ============================================================================

export type CaptureType = 'review' | 'issue' | 'todo' | 'prompt'

export interface ClassificationResult {
  type: CaptureType
  confidence: number
  reasoning: string[]
}

export interface CaptureContext {
  content: string
  commitHash?: string | undefined
  commitMessage?: string | undefined
  priority?: 'high' | 'medium' | 'low' | undefined
  title?: string | undefined
  cwd?: string | undefined
}

export interface GeneratedCapture {
  type: CaptureType
  filePath: string
  content: string
  isAppend: boolean
}

// ============================================================================
// Pattern Matching Constants
// ============================================================================

// Note: Do NOT use /g flag with patterns used in .test() to avoid lastIndex issues
const PATTERNS = {
  review: {
    commitHash: /\b[0-9a-f]{7,40}\b/i,
    fileRefs: /[\w/.-]+\.(?:ts|tsx|js|jsx|py|go|rs|java|rb|c|cpp|h):\d+/g,
    negativeWords: /\b(broken|bug|issue|error|problem|wrong|fail|incorrect)\b/i,
    reviewWords: /\b(review|commit|change|diff|patch)\b/i,
  },
  issue: {
    futureVerbs: /\b(add|implement|support|create|build|design|develop)\b/i,
    modalVerbs: /\b(should|could|would|will|need to|want to)\b/i,
    featureWords: /\b(feature|enhancement|improvement|capability|functionality)\b/i,
    designWords: /\b(architecture|design|plan|proposal|approach)\b/i,
  },
  todo: {
    checkbox: /^-?\s*\[\s*\]\s/m,
    urgentWords: /\b(must|need|required|critical|now|immediately|asap|urgent|today)\b/i,
    imperative: /^(fix|update|add|remove|change|implement|refactor|clean)\s/im,
    actionWords: /\b(todo|action|task|next step)\b/i,
  },
  prompt: {
    explicit: /\b(put|add|save|write)\s+(this|it)\s+(in|to)\s+prompt\.md\b/i,
    promptMention: /\bprompt\.md\b/i,
  },
} as const

// ============================================================================
// Classification Logic
// ============================================================================

function countMatches(text: string, pattern: RegExp): number {
  // Create global version for counting
  const globalPattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g')
  const matches = text.match(globalPattern)
  return matches?.length ?? 0
}

function computeScores(content: string): Record<CaptureType, number> {
  const scores: Record<CaptureType, number> = {
    review: 0,
    issue: 0,
    todo: 0,
    prompt: 0,
  }

  // Prompt - explicit mention takes precedence
  if (PATTERNS.prompt.explicit.test(content)) {
    scores.prompt = 1.0
    return scores
  }
  scores.prompt = countMatches(content, PATTERNS.prompt.promptMention) > 0 ? 0.3 : 0

  // Review signals
  const hasCommitHash = PATTERNS.review.commitHash.test(content)
  const fileRefCount = countMatches(content, PATTERNS.review.fileRefs)
  const negativeCount = countMatches(content, PATTERNS.review.negativeWords)
  const reviewWordCount = countMatches(content, PATTERNS.review.reviewWords)

  if (hasCommitHash) scores.review += 0.4
  if (fileRefCount > 0) scores.review += Math.min(fileRefCount * 0.15, 0.3)
  if (negativeCount > 0) scores.review += Math.min(negativeCount * 0.1, 0.2)
  if (reviewWordCount > 0) scores.review += Math.min(reviewWordCount * 0.05, 0.1)

  // Issue signals
  const futureVerbCount = countMatches(content, PATTERNS.issue.futureVerbs)
  const modalVerbCount = countMatches(content, PATTERNS.issue.modalVerbs)
  const featureWordCount = countMatches(content, PATTERNS.issue.featureWords)
  const designWordCount = countMatches(content, PATTERNS.issue.designWords)

  // No commit refs + design language = issue
  if (!hasCommitHash && futureVerbCount > 0) scores.issue += 0.3
  if (modalVerbCount > 0) scores.issue += Math.min(modalVerbCount * 0.1, 0.2)
  if (featureWordCount > 0) scores.issue += Math.min(featureWordCount * 0.15, 0.3)
  if (designWordCount > 0) scores.issue += Math.min(designWordCount * 0.1, 0.2)

  // TODO signals
  const hasCheckbox = PATTERNS.todo.checkbox.test(content)
  const urgentCount = countMatches(content, PATTERNS.todo.urgentWords)
  const hasImperative = PATTERNS.todo.imperative.test(content)
  const actionWordCount = countMatches(content, PATTERNS.todo.actionWords)

  if (hasCheckbox) scores.todo += 0.5
  if (urgentCount > 0) scores.todo += Math.min(urgentCount * 0.15, 0.3)
  if (hasImperative) scores.todo += 0.2
  if (actionWordCount > 0) scores.todo += Math.min(actionWordCount * 0.1, 0.2)

  return scores
}

export function classifyContent(ctx: CaptureContext): ClassificationResult {
  const { content, commitHash } = ctx
  const scores = computeScores(content)
  const reasoning: string[] = []

  // Boost review score if commitHash provided explicitly
  if (commitHash) {
    scores.review += 0.3
    reasoning.push(`Commit hash provided: ${commitHash}`)
  }

  // Find max score
  let maxType: CaptureType = 'issue'
  let maxScore = 0

  for (const [type, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score
      maxType = type as CaptureType
    }
  }

  // Build reasoning
  if (maxType === 'review') {
    if (PATTERNS.review.commitHash.test(content)) reasoning.push('Commit hash detected in content')
    if (PATTERNS.review.fileRefs.test(content)) reasoning.push('File:line references found')
    if (PATTERNS.review.negativeWords.test(content)) reasoning.push('Negative/bug language present')
  } else if (maxType === 'issue') {
    if (PATTERNS.issue.futureVerbs.test(content)) reasoning.push('Future-tense verbs detected')
    if (PATTERNS.issue.featureWords.test(content)) reasoning.push('Feature/enhancement language')
    if (!PATTERNS.review.commitHash.test(content)) reasoning.push('No commit references')
  } else if (maxType === 'todo') {
    if (PATTERNS.todo.checkbox.test(content)) reasoning.push('Checkbox pattern detected')
    if (PATTERNS.todo.urgentWords.test(content)) reasoning.push('Urgent language present')
    if (PATTERNS.todo.imperative.test(content)) reasoning.push('Imperative mood detected')
  } else if (maxType === 'prompt') {
    reasoning.push('Explicit Prompt.md request detected')
  }

  return {
    type: maxType,
    confidence: Math.min(maxScore, 1),
    reasoning,
  }
}

// ============================================================================
// Content Extraction Helpers
// ============================================================================

export function extractCommitHash(text: string): string | undefined {
  const match = text.match(/\b[0-9a-f]{7,40}\b/i)
  return match?.[0]
}

export function extractTitle(content: string): string {
  // Try to find a title from first line or first sentence
  const lines = content.trim().split('\n')
  const firstLine = lines[0]?.trim() ?? ''

  // Remove markdown heading prefix
  const cleaned = firstLine.replace(/^#+\s*/, '')

  // Truncate to reasonable length
  if (cleaned.length > 80) {
    return cleaned.slice(0, 77) + '...'
  }

  return cleaned || 'Untitled'
}

export function extractSummary(content: string, maxLength = 200): string {
  const lines = content.trim().split('\n')

  // Skip title line, get first substantial paragraph
  let summary = ''
  for (const line of lines.slice(1)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('#')) continue
    if (trimmed.startsWith('-') || trimmed.startsWith('*')) continue

    summary = trimmed
    break
  }

  if (!summary) {
    summary = lines[0]?.trim() ?? ''
  }

  if (summary.length > maxLength) {
    return summary.slice(0, maxLength - 3) + '...'
  }

  return summary
}

export function inferPriority(text: string): 'high' | 'medium' | 'low' {
  const lower = text.toLowerCase()

  if (/\b(critical|urgent|asap|p0|blocker|must|immediately)\b/.test(lower)) {
    return 'high'
  }
  if (/\b(should|important|p1|soon)\b/.test(lower)) {
    return 'medium'
  }
  return 'low'
}

export function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50)
}

// ============================================================================
// Template Generation
// ============================================================================

export function generateReviewTemplate(ctx: CaptureContext): string {
  const date = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const hash = ctx.commitHash ?? extractCommitHash(ctx.content) ?? 'unknown'
  const message = ctx.commitMessage ?? 'No commit message provided'

  const summary = extractSummary(ctx.content)
  const content = ctx.content.trim()

  return `# Code Review for Commit ${hash}

**Date:** ${date}
**Commit Message:** ${message}

---

### Summary

${summary}

### Issues Found

${content}

### Suggested Improvements

(Add specific improvement recommendations here)
`
}

export function generateIssueTemplate(ctx: CaptureContext): string {
  const title = ctx.title ?? extractTitle(ctx.content)
  const priority = ctx.priority ?? inferPriority(ctx.content)
  const summary = extractSummary(ctx.content)
  const content = ctx.content.trim()

  return `# ${title}

<metadata>
  <priority>${priority}</priority>
  <category>feature</category>
  <estimated-effort>TBD</estimated-effort>
  <status>draft</status>
  <dependencies>
    - TBD
  </dependencies>
</metadata>

---

## Executive Summary

${summary}

## Problem Statement

${content}

## Proposed Solution

(Describe the proposed solution here)

## Acceptance Criteria

- [ ] (Define acceptance criteria)
`
}

export function generateTodoItem(ctx: CaptureContext): string {
  const priority = ctx.priority ?? inferPriority(ctx.content)
  const content = ctx.content.trim()

  // Format as checkbox item
  const lines = content.split('\n').filter((l) => l.trim())
  const items = lines.map((line) => {
    // Remove existing checkbox if present
    const cleaned = line.replace(/^-?\s*\[\s*\]\s*/, '').trim()
    return `- [ ] ${cleaned}`
  })

  return {
    high: '\n## High Priority\n\n',
    medium: '\n## Medium Priority\n\n',
    low: '\n## Low Priority\n\n',
  }[priority] + items.join('\n')
}

export function generatePromptMd(ctx: CaptureContext): string {
  return ctx.content.trim() + '\n'
}

// ============================================================================
// File Path Generation
// ============================================================================

function formatTimestamp(): string {
  const now = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

export async function generateFilePath(
  type: CaptureType,
  ctx: CaptureContext,
  cwd: string
): Promise<string> {
  switch (type) {
    case 'review': {
      const hash = ctx.commitHash ?? extractCommitHash(ctx.content) ?? 'manual'
      const timestamp = formatTimestamp()
      return `${cwd}/reviews/${timestamp}_${hash.slice(0, 7)}.md`
    }
    case 'issue': {
      const title = ctx.title ?? extractTitle(ctx.content)
      const kebab = toKebabCase(title)
      let path = `${cwd}/issues/${kebab}.md`

      // Handle conflicts with counter
      let counter = 1
      while (await Bun.file(path).exists()) {
        path = `${cwd}/issues/${kebab}-${counter}.md`
        counter++
      }
      return path
    }
    case 'todo':
      return `${cwd}/TODO.md`
    case 'prompt':
      return `${cwd}/Prompt.md`
  }
}

// ============================================================================
// File Writing
// ============================================================================

export async function writeCapture(generated: GeneratedCapture): Promise<void> {
  if (generated.isAppend) {
    // Read existing content and append
    const existing = await Bun.file(generated.filePath)
      .text()
      .catch(() => '')
    const newContent = existing.trimEnd() + '\n' + generated.content
    await Bun.write(generated.filePath, newContent)
  } else {
    await Bun.write(generated.filePath, generated.content)
  }
}

// ============================================================================
// Main Capture Function
// ============================================================================

export async function capture(ctx: CaptureContext): Promise<GeneratedCapture> {
  const cwd = ctx.cwd ?? process.cwd()
  const classification = classifyContent(ctx)

  let content: string
  let isAppend = false

  switch (classification.type) {
    case 'review':
      content = generateReviewTemplate(ctx)
      break
    case 'issue':
      content = generateIssueTemplate(ctx)
      break
    case 'todo':
      content = generateTodoItem(ctx)
      isAppend = true
      break
    case 'prompt':
      content = generatePromptMd(ctx)
      // Check if Prompt.md exists to determine append vs create
      isAppend = await Bun.file(`${cwd}/Prompt.md`).exists()
      break
  }

  const filePath = await generateFilePath(classification.type, ctx, cwd)

  return {
    type: classification.type,
    filePath,
    content,
    isAppend,
  }
}

export { PATTERNS }
