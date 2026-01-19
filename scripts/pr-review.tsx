#!/usr/bin/env bun
/**
 * PR Review Script
 * 
 * Deploys 3 agents in parallel with thinking models to review PR changes:
 * 1. Code Quality Agent - Reviews code quality, patterns, best practices
 * 2. Security Agent - Reviews for security vulnerabilities
 * 3. Architecture Agent - Reviews architectural decisions and design
 * 
 * Then deploys Claude Sonnet to:
 * - Review git history for related commits
 * - Add git notes with related context
 */

import { SmithersProvider } from '../src/components/SmithersProvider.js'
import { Claude } from '../src/components/Claude.js'
import { Parallel } from '../src/components/Parallel.js'
import { Phase } from '../src/components/Phase.js'
import { Step } from '../src/components/Step.js'
import { PhaseRegistry } from '../src/components/PhaseRegistry.js'
import { createSmithersDB } from '../src/db/index.js'
import { createSmithersRoot } from '../src/reconciler/index.js'

const PR_NUMBER = process.env.PR_NUMBER ?? ''
const PR_HEAD_SHA = process.env.PR_HEAD_SHA ?? 'HEAD'
const PR_BASE_SHA = process.env.PR_BASE_SHA ?? 'HEAD~1'

interface ReviewResult {
  agent: string
  approved: boolean
  summary: string
  issues: Array<{ severity: string; message: string; file?: string; line?: number }>
}

const reviewResults: ReviewResult[] = []

function PRReviewOrchestration() {
  return (
    <PhaseRegistry>
      {/* Phase 1: Parallel reviews with thinking models */}
      <Phase name="parallel-reviews">
        <Parallel>
          <Step name="code-quality">
            <Claude
              model="claude-sonnet-4-20250514"
              permissionMode="bypassPermissions"
              maxTurns={5}
              onFinished={(result) => {
                try {
                  const parsed = JSON.parse(result.output)
                  reviewResults.push({ agent: 'code-quality', ...parsed })
                } catch {
                  reviewResults.push({
                    agent: 'code-quality',
                    approved: true,
                    summary: result.output.slice(0, 500),
                    issues: []
                  })
                }
              }}
            >
              {`You are a code quality reviewer using deep thinking to analyze this PR.

<extended_thinking>
Think step by step about:
1. Code readability and maintainability
2. Naming conventions and consistency
3. Error handling patterns
4. Test coverage implications
5. Performance considerations
</extended_thinking>

Review the changes in PR #${PR_NUMBER}.
Run: git diff ${PR_BASE_SHA}...${PR_HEAD_SHA}

Focus on:
- Code quality and readability
- Best practices adherence
- Naming conventions
- Error handling
- Potential performance issues

Respond with JSON:
{
  "approved": boolean,
  "summary": "brief summary",
  "issues": [{"severity": "critical|major|minor", "message": "...", "file": "...", "line": number}]
}`}
            </Claude>
          </Step>

          <Step name="security">
            <Claude
              model="claude-sonnet-4-20250514"
              permissionMode="bypassPermissions"
              maxTurns={5}
              onFinished={(result) => {
                try {
                  const parsed = JSON.parse(result.output)
                  reviewResults.push({ agent: 'security', ...parsed })
                } catch {
                  reviewResults.push({
                    agent: 'security',
                    approved: true,
                    summary: result.output.slice(0, 500),
                    issues: []
                  })
                }
              }}
            >
              {`You are a security reviewer using deep thinking to analyze this PR.

<extended_thinking>
Think step by step about:
1. Input validation vulnerabilities
2. Authentication/authorization issues
3. Injection risks (SQL, command, XSS)
4. Secrets/credentials exposure
5. Dependency vulnerabilities
</extended_thinking>

Review the changes in PR #${PR_NUMBER}.
Run: git diff ${PR_BASE_SHA}...${PR_HEAD_SHA}

Focus on:
- Security vulnerabilities
- Input validation
- Authentication/authorization
- Secrets exposure
- Injection risks

Respond with JSON:
{
  "approved": boolean,
  "summary": "brief summary",
  "issues": [{"severity": "critical|major|minor", "message": "...", "file": "...", "line": number}]
}`}
            </Claude>
          </Step>

          <Step name="architecture">
            <Claude
              model="claude-sonnet-4-20250514"
              permissionMode="bypassPermissions"
              maxTurns={5}
              onFinished={(result) => {
                try {
                  const parsed = JSON.parse(result.output)
                  reviewResults.push({ agent: 'architecture', ...parsed })
                } catch {
                  reviewResults.push({
                    agent: 'architecture',
                    approved: true,
                    summary: result.output.slice(0, 500),
                    issues: []
                  })
                }
              }}
            >
              {`You are an architecture reviewer using deep thinking to analyze this PR.

<extended_thinking>
Think step by step about:
1. Component boundaries and responsibilities
2. Dependency direction (no circular deps)
3. API design and contracts
4. State management patterns
5. Scalability implications
</extended_thinking>

Review the changes in PR #${PR_NUMBER}.
Run: git diff ${PR_BASE_SHA}...${PR_HEAD_SHA}

Focus on:
- Architectural decisions
- Component design
- Dependency management
- API contracts
- Scalability

Respond with JSON:
{
  "approved": boolean,
  "summary": "brief summary",
  "issues": [{"severity": "critical|major|minor", "message": "...", "file": "...", "line": number}]
}`}
            </Claude>
          </Step>
        </Parallel>
      </Phase>

      {/* Phase 2: Git history analysis with Sonnet */}
      <Phase name="git-history-analysis">
        <Step name="related-commits">
          <Claude
            model="sonnet"
            permissionMode="bypassPermissions"
            maxTurns={10}
            onFinished={async (result) => {
              console.log('Git history analysis complete')
              // Post combined review to PR
              await postReviewToPR()
            }}
          >
            {`You are analyzing git history to find related commits and add context.

1. Get the files changed in this PR:
   git diff --name-only ${PR_BASE_SHA}...${PR_HEAD_SHA}

2. For each changed file, find recent commits that touched it:
   git log --oneline -10 -- <file>

3. Look for patterns:
   - Who else modified these files recently?
   - What were the related changes?
   - Are there any breaking changes in history?

4. Add git notes to the PR commits with related context:
   For each commit in the PR range, add a note with related commits:
   
   git notes add -f -m "Related commits:
   - <commit1>: <message>
   - <commit2>: <message>
   
   Context: <brief analysis>"
   
   Use: git rev-list ${PR_BASE_SHA}..${PR_HEAD_SHA} to get PR commits

5. Output a summary of related commits and context found.`}
          </Claude>
        </Step>
      </Phase>
    </PhaseRegistry>
  )
}

async function postReviewToPR() {
  if (!PR_NUMBER) return

  const allApproved = reviewResults.every(r => r.approved)
  const allIssues = reviewResults.flatMap(r => r.issues.map(i => ({ ...i, agent: r.agent })))
  const criticalCount = allIssues.filter(i => i.severity === 'critical').length
  const majorCount = allIssues.filter(i => i.severity === 'major').length

  const issuesText = allIssues.length > 0
    ? allIssues.map(i => {
        const loc = [i.file, i.line].filter(Boolean).join(':')
        return `- **[${i.agent}]** ${i.severity.toUpperCase()}${loc ? ` (${loc})` : ''}: ${i.message}`
      }).join('\n')
    : 'No issues found.'

  const summaries = reviewResults.map(r => `**${r.agent}**: ${r.summary}`).join('\n\n')

  const body = `## 🤖 AI Code Review

**Status:** ${allApproved ? '✅ Approved' : '⚠️ Changes Requested'}
${criticalCount > 0 ? `\n🚨 **${criticalCount} critical issues found**` : ''}
${majorCount > 0 ? `\n⚠️ **${majorCount} major issues found**` : ''}

### Agent Summaries
${summaries}

### Issues
${issuesText}

---
*Generated by Smithers AI Review*`

  await Bun.$`gh pr comment ${PR_NUMBER} --body ${body}`.quiet()
}

async function main() {
  const db = createSmithersDB({ path: ':memory:' })
  const executionId = db.execution.start('pr-review', 'scripts/pr-review.tsx')

  console.log('Starting PR Review...')
  console.log(`PR: #${PR_NUMBER}`)
  console.log(`Range: ${PR_BASE_SHA}...${PR_HEAD_SHA}`)

  const root = createSmithersRoot()

  await root.mount(() => (
    <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
      <orchestration name="pr-review">
        <PRReviewOrchestration />
      </orchestration>
    </SmithersProvider>
  ))

  console.log('\nReview complete!')
  console.log(root.toXML())

  db.execution.complete(executionId)
  db.close()
}

main().catch(err => {
  console.error('PR review failed:', err)
  process.exit(1)
})
