import Anthropic from '@anthropic-ai/sdk'
import type { SuperSmithersContext, ClaudeModel, AnalysisResult, RewriteProposal } from './types.js'

const MODEL_MAP: Record<ClaudeModel, string> = {
  haiku: 'claude-3-haiku-20240307',
  sonnet: 'claude-sonnet-4-20250514',
  opus: 'claude-opus-4-20250514',
}

const REWRITE_SYSTEM_PROMPT = `You are SuperSmithers, an expert engineer for the Smithers React/JSX orchestration framework.

Your job is to rewrite the provided TypeScript/TSX plan module to fix the diagnosed issues.

CRITICAL CONSTRAINTS:
1) Do NOT use React useState. Use SQLite (db.state, db.tasks) or useRef for state.
2) Do NOT remove the component's exports or change its interface.
3) Prefer minimal diffs: change only what is necessary.
4) Ensure the result compiles.
5) Follow existing code conventions from the codebase.

OUTPUT:
Return JSON ONLY:
{
  "summary": "string - brief description of changes",
  "rationale": "string - why these changes fix the issues",
  "risk": "low|medium|high",
  "newCode": "// full TSX file content"
}

No markdown, no extra keys.`

export async function runRewrite(opts: {
  context: SuperSmithersContext
  analysis: AnalysisResult
  baselineCode: string
  model: ClaudeModel
  systemPrompt?: string
}): Promise<RewriteProposal> {
  const { context, analysis, baselineCode, model, systemPrompt } = opts

  const userPrompt = `## File to Rewrite
Path: ${context.sourceFile}

## Current Code
\`\`\`tsx
${baselineCode}
\`\`\`

## Diagnosed Issues
${analysis.issues.map((issue, i) => `${i + 1}. [${issue.type}] ${issue.description} - Evidence: ${issue.evidence}`).join('\n')}

## Summary
${analysis.summary}

## Rewrite Goals
${analysis.rewrite.goals.map((g, i) => `${i + 1}. ${g}`).join('\n')}

Rewrite the code to fix ALL diagnosed issues while preserving functionality.`

  const client = new Anthropic()

  const response = await client.messages.create({
    model: MODEL_MAP[model],
    max_tokens: 8192,
    system: systemPrompt ?? REWRITE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const textBlock = response.content.find((block) => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude')
  }

  let parsed: {
    summary: string
    rationale: string
    risk: 'low' | 'medium' | 'high'
    newCode: string
  }
  try {
    parsed = JSON.parse(textBlock.text)
  } catch (err) {
    throw new Error(`Failed to parse rewrite response as JSON: ${err instanceof Error ? err.message : String(err)}\nRaw response: ${textBlock.text.slice(0, 500)}`)
  }

  if (!parsed.summary || !parsed.rationale || !parsed.risk || !parsed.newCode) {
    throw new Error(`Invalid rewrite response structure: missing required fields`)
  }

  return {
    summary: parsed.summary,
    rationale: parsed.rationale,
    risk: parsed.risk,
    newCode: parsed.newCode,
  }
}

export async function validateRewrite(
  code: string,
  _originalPath: string
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = []

  // Check for useState (forbidden in Smithers plans)
  if (code.includes('useState(') || code.includes('useState<')) {
    errors.push('Code contains useState, which is forbidden in Smithers plans')
  }

  // Try to parse as TSX using Bun's transpiler
  try {
    const tempPath = `/tmp/supersmithers-validate-${Date.now()}.tsx`
    await Bun.write(tempPath, code)
    await Bun.$`bun build ${tempPath} --no-bundle`.quiet()
    await Bun.$`rm ${tempPath}`.quiet()
  } catch (err) {
    errors.push(`Syntax error: ${err instanceof Error ? err.message : String(err)}`)
  }

  return { valid: errors.length === 0, errors }
}
