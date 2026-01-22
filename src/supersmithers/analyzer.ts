import Anthropic from '@anthropic-ai/sdk'
import type { SuperSmithersContext, AnalysisResult, ClaudeModel } from './types.js'
import { MODEL_MAP } from './types.js'

const ANALYSIS_SYSTEM_PROMPT = `You are SuperSmithers Analyzer, an expert at diagnosing issues in Smithers orchestration plans.

Smithers uses React-like JSX to orchestrate AI agents. Key patterns:
- <Ralph> loops for iteration
- <Phase> for workflow stages  
- <Claude> for agent execution
- State is stored in SQLite, NOT React useState (which is forbidden)

Analyze the provided execution context and identify:
1. Repeated errors that indicate a structural problem
2. Stalls where the same state persists across iterations
3. Performance issues (excessive token usage, slow iterations)
4. Structural problems in the plan design

Output JSON only with this schema:
{
  "summary": "Brief summary of findings",
  "issues": [
    { "type": "error|stall|performance|structure", "description": "...", "evidence": "..." }
  ],
  "rewrite": {
    "recommended": true|false,
    "goals": ["goal1", "goal2"],
    "risk": "low|medium|high",
    "confidence": 0.0-1.0
  }
}`

function buildAnalysisPrompt(context: SuperSmithersContext, baselineCode: string): string {
  const errorsSection = context.recentErrors.length > 0
    ? `## Recent Errors (${context.recentErrors.length})\n${context.recentErrors.map((e, i) => 
        `${i + 1}. [${e.kind}] ${e.message} (at ${e.at}, sig: ${e.signature})`
      ).join('\n')}`
    : '## Recent Errors\nNone'

  const framesSection = context.recentFrames.length > 0
    ? `## Recent Render Frames (${context.recentFrames.length})\n${context.recentFrames.map((f) => 
        `### Frame ${f.iteration} (${f.createdAt})\n\`\`\`xml\n${f.xml}\n\`\`\``
      ).join('\n\n')}`
    : '## Recent Render Frames\nNone'

  return `## Execution Context
- Execution ID: ${context.executionId}
- Current Iteration: ${context.iteration}
- Trigger: ${context.trigger}
- Source File: ${context.sourceFile}

## Metrics
- Tokens: ${context.metrics.tokensInput} in / ${context.metrics.tokensOutput} out
- Agents: ${context.metrics.agentCount}
- Errors: ${context.metrics.errorCount}
- Stalls: ${context.metrics.stallCount}
- Is Stalled: ${context.metrics.isStalled}
- Avg Iteration Time: ${context.metrics.avgIterationTimeMs}ms

## Rewrite History
- Previous Rewrites: ${context.rewriteHistory.rewriteCount}
- Seen Code Hashes: ${context.rewriteHistory.seenCodeHashes.length}

${errorsSection}

${framesSection}

## Current Tree XML
\`\`\`xml
${context.treeXml}
\`\`\`

## Plan Source Code
\`\`\`tsx
${baselineCode}
\`\`\`

Analyze the execution state and source code. Identify any issues and recommend whether a rewrite is needed.`
}

/**
 * Run analysis on a SuperSmithers execution context to diagnose issues.
 * @throws {Error} No text response from Claude - when API returns no text content block
 * @throws {Error} Failed to parse analysis response as JSON - when Claude returns malformed JSON
 * @throws {Error} Invalid analysis response structure - when JSON is missing required fields (summary, issues array, rewrite)
 */
export async function runAnalysis(opts: {
  context: SuperSmithersContext
  model: ClaudeModel
  baselineCode: string
}): Promise<AnalysisResult> {
  const { context, model, baselineCode } = opts

  const client = new Anthropic()
  const userPrompt = buildAnalysisPrompt(context, baselineCode)

  const response = await client.messages.create({
    model: MODEL_MAP[model],
    max_tokens: 2048,
    system: ANALYSIS_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const textBlock = response.content.find((block) => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    const blockTypes = response.content.map((b) => b.type).join(', ')
    throw new Error(`No text response from Claude, got block types: [${blockTypes}]`)
  }

  let parsed: AnalysisResult
  try {
    parsed = JSON.parse(textBlock.text)
  } catch (err) {
    throw new Error(`Failed to parse analysis response as JSON. Raw response: ${textBlock.text.slice(0, 500)}`, { cause: err })
  }

  if (!parsed.summary || !Array.isArray(parsed.issues) || !parsed.rewrite) {
    const missing = [
      !parsed.summary && 'summary',
      !Array.isArray(parsed.issues) && 'issues (array)',
      !parsed.rewrite && 'rewrite',
    ].filter(Boolean)
    throw new Error(`Invalid analysis response structure, missing: ${missing.join(', ')}`)
  }

  return {
    summary: parsed.summary,
    issues: parsed.issues.map((issue) => ({
      type: issue.type,
      description: issue.description,
      evidence: issue.evidence,
    })),
    rewrite: {
      recommended: parsed.rewrite.recommended,
      goals: parsed.rewrite.goals,
      risk: parsed.rewrite.risk,
      confidence: Math.max(0, Math.min(1, parsed.rewrite.confidence)),
    },
  }
}
