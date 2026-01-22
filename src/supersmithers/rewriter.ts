import Anthropic from '@anthropic-ai/sdk'
import type { SuperSmithersContext, ClaudeModel, AnalysisResult, RewriteProposal } from './types.js'
import { MODEL_MAP } from './types.js'

const REWRITE_SYSTEM_PROMPT = `You are SuperSmithers, an expert engineer for the Smithers React/JSX orchestration framework.

Your job is to rewrite the provided TypeScript/TSX plan module to fix the diagnosed issues.

CRITICAL CONSTRAINTS:
1) Do NOT use React useState. Use SQLite (db.state, db.tasks) or useRef for state.
2) Do NOT remove the component's exports or change its interface.
3) Prefer minimal diffs: change only what is necessary.
4) Ensure the result compiles.
5) Follow existing code conventions from the codebase.
6) Do NOT use relative imports (./foo or ../bar). All imports must be:
   - Package imports (e.g., 'react', 'smithers-orchestrator/db')
   - Absolute file:// URLs for local modules
   - In-file code (preferred for small utilities)
7) Side-effect imports (import "./x" or import '../x') are NOT allowed.
8) CommonJS require() with relative paths is NOT allowed.

OUTPUT:
Return JSON ONLY:
{
  "summary": "string - brief description of changes",
  "rationale": "string - why these changes fix the issues",
  "risk": "low|medium|high",
  "newCode": "// full TSX file content"
}

No markdown, no extra keys.`

function buildRewritePrompt(
  opts: { context: SuperSmithersContext; analysis: AnalysisResult; baselineCode: string },
  lastErrors: string[],
  attempt: number
): string {
  const { context, analysis, baselineCode } = opts

  let prompt = `## File to Rewrite
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

  if (attempt > 1 && lastErrors.length > 0) {
    prompt += `\n\n## PREVIOUS ATTEMPT FAILED VALIDATION
Attempt ${attempt - 1} produced these errors:
${lastErrors.map((e, i) => `${i + 1}. ${e}`).join('\n')}

Fix these validation errors in your new response.`
  }

  return prompt
}

/**
 * Parse Claude's rewrite response JSON.
 * @throws {Error} Failed to parse rewrite response as JSON - when response is malformed JSON
 * @throws {Error} Invalid rewrite response structure - when JSON is missing required fields (summary, rationale, risk, newCode)
 */
export function parseRewriteResponse(text: string): {
  summary: string
  rationale: string
  risk: 'low' | 'medium' | 'high'
  newCode: string
} {
  let jsonText = text.trim()
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  }

  let parsed: {
    summary: string
    rationale: string
    risk: 'low' | 'medium' | 'high'
    newCode: string
  }
  try {
    parsed = JSON.parse(jsonText)
  } catch (err) {
    throw new Error(`Failed to parse rewrite response as JSON. Raw response: ${jsonText.slice(0, 500)}`, { cause: err })
  }

  if (!parsed.summary || !parsed.rationale || !parsed.risk || !parsed.newCode) {
    const missing = [
      !parsed.summary && 'summary',
      !parsed.rationale && 'rationale',
      !parsed.risk && 'risk',
      !parsed.newCode && 'newCode',
    ].filter(Boolean)
    throw new Error(`Invalid rewrite response structure, missing: ${missing.join(', ')}`)
  }

  return parsed
}

/**
 * Run rewrite operation to fix diagnosed issues in a Smithers plan.
 * @throws {Error} No text response from Claude - when API returns no text content block
 * @throws {Error} Failed to parse rewrite response as JSON - when Claude returns malformed JSON
 * @throws {Error} Invalid rewrite response structure - when JSON is missing required fields
 * @throws {Error} Rewrite failed validation after N attempts - when code fails validation checks (useState, relative imports, syntax) after all retry attempts exhausted
 */
export async function runRewrite(opts: {
  context: SuperSmithersContext
  analysis: AnalysisResult
  baselineCode: string
  model: ClaudeModel
  systemPrompt?: string
  maxAttempts?: number
}): Promise<RewriteProposal> {
  const { context, analysis, baselineCode, model, systemPrompt } = opts
  const maxAttempts = opts.maxAttempts ?? 2
  let lastErrors: string[] = []

  const client = new Anthropic()

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const userPrompt = buildRewritePrompt({ context, analysis, baselineCode }, lastErrors, attempt)

    const response = await client.messages.create({
      model: MODEL_MAP[model],
      max_tokens: 8192,
      system: systemPrompt ?? REWRITE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const textBlock = response.content.find((block) => block.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      const blockTypes = response.content.map((b) => b.type).join(', ')
      throw new Error(`No text response from Claude, got block types: [${blockTypes}]`)
    }

    const parsed = parseRewriteResponse(textBlock.text)

    const validation = await validateRewrite(parsed.newCode, context.sourceFile)
    if (validation.valid) {
      return {
        summary: parsed.summary,
        rationale: parsed.rationale,
        risk: parsed.risk,
        newCode: parsed.newCode,
      }
    }

    lastErrors = validation.errors
    if (attempt < maxAttempts) {
      console.log(`[SuperSmithers] Rewrite attempt ${attempt} failed validation, retrying...`)
    }
  }

  throw new Error(`Rewrite failed validation after ${maxAttempts} attempts`, { cause: new Error(lastErrors.join('; ')) })
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

  // Check for unresolved relative imports
  // Overlay code should use absolute file:// URLs or package imports
  const relativeImportPattern = /from\s+['"]\.\.?\//g
  const relativeMatches = code.match(relativeImportPattern)
  if (relativeMatches && relativeMatches.length > 0) {
    errors.push(
      `Code contains ${relativeMatches.length} relative import(s). ` +
        `Overlays must use absolute file:// URLs or package imports. ` +
        `Relative imports will resolve incorrectly from overlay directory.`
    )
  }

  // Also check dynamic imports
  const dynamicRelativePattern = /import\s*\(\s*['"]\.\.?\//g
  const dynamicMatches = code.match(dynamicRelativePattern)
  if (dynamicMatches && dynamicMatches.length > 0) {
    errors.push(
      `Code contains ${dynamicMatches.length} relative dynamic import(s). ` +
        `These must be converted to absolute file:// URLs.`
    )
  }

  // Side-effect imports: import "./x" or import '../x'
  const sideEffectRelativePattern = /import\s+['"]\.\.?\//g
  const sideEffectMatches = code.match(sideEffectRelativePattern)
  if (sideEffectMatches && sideEffectMatches.length > 0) {
    errors.push(
      `Code contains ${sideEffectMatches.length} side-effect relative import(s) (import "./x"). ` +
      `These must be converted to package imports or absolute file:// URLs.`
    )
  }

  // CommonJS requires
  const requireRelativePattern = /require\s*\(\s*['"]\.\.?\//g
  const requireMatches = code.match(requireRelativePattern)
  if (requireMatches && requireMatches.length > 0) {
    errors.push(
      `Code contains ${requireMatches.length} require() relative import(s). ` +
      `These must be converted to package imports or absolute file:// URLs.`
    )
  }

  // Try to parse as TSX using Bun's transpiler
  const tempPath = `/tmp/supersmithers-validate-${Date.now()}.tsx`
  try {
    await Bun.write(tempPath, code)
    try {
      await Bun.$`bun build ${tempPath} --no-bundle`.quiet()
    } catch (buildErr) {
      errors.push(`Syntax error: ${buildErr instanceof Error ? buildErr.message : String(buildErr)}`)
    }
  } catch (writeErr) {
    errors.push(`Failed to write temp file: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`)
  } finally {
    try {
      await Bun.$`rm -f ${tempPath}`.quiet()
    } catch {
      // Ignore cleanup errors
    }
  }

  return { valid: errors.length === 0, errors }
}
