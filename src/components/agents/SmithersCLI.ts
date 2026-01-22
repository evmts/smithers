import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import type { AgentResult, ClaudeModel } from './types.js'
import { executeClaudeCLI } from './ClaudeCodeCLI.js'

/** Default timeout for Smithers script execution (10 minutes) */
export const DEFAULT_SCRIPT_TIMEOUT_MS = 600000

/** Default timeout for planning phase (2 minutes) */
export const DEFAULT_PLANNING_TIMEOUT_MS = 120000

/** Default max planning turns */
export const DEFAULT_MAX_PLANNING_TURNS = 5

export interface SmithersExecutionOptions {
  /**
   * Task description to plan and execute
   */
  task: string

  /**
   * Model to use for planning
   */
  plannerModel?: ClaudeModel

  /**
   * Model to use within the generated script
   */
  executionModel?: ClaudeModel

  /**
   * Working directory for the script
   */
  cwd?: string

  /**
   * Timeout in milliseconds
   */
  timeout?: number

  /**
   * Maximum turns for the planning phase
   */
  maxPlanningTurns?: number

  /**
   * Additional context about available resources
   */
  context?: string

  /**
   * Whether to keep the generated script after execution
   */
  keepScript?: boolean

  /**
   * Custom script output path (if keepScript is true)
   */
  scriptPath?: string

  /**
   * Progress callback
   */
  onProgress?: (message: string) => void

  /**
   * Called when script is generated (before execution)
   */
  onScriptGenerated?: (script: string, path: string) => void
}

export interface SmithersResult extends AgentResult {
  /**
   * The generated script content
   */
  script: string

  /**
   * Path where the script was written
   */
  scriptPath: string

  /**
   * Planning phase result
   */
  planningResult: AgentResult
}

const SCRIPT_TEMPLATE = `#!/usr/bin/env bun
/**
 * Auto-generated Smithers script
 * Task: {{TASK}}
 * Generated at: {{TIMESTAMP}}
 */

import { createSmithersRoot } from 'smithers'
import { createSmithersDB, SmithersProvider, Orchestration, Claude, Phase, Step } from 'smithers/orchestrator'
import { Ralph, Review, Commit, Notes } from 'smithers/components'

{{SCRIPT_BODY}}
`

const PLANNING_SYSTEM_PROMPT = `You are a Smithers orchestration script generator. Your task is to create a complete, executable Smithers script that accomplishes the given task.

## Available Components

### Core Components
- \`<SmithersProvider db={db} executionId={id}>\` - Required wrapper for database context
- \`<Orchestration>\` - Orchestration container with timeout and stop conditions
- \`<Ralph maxIterations={n}>\` - Loop controller for iterative workflows
- \`<Phase name="...">\` - Named execution phase
- \`<Step name="...">\` - Named step within a phase

### Agent Components
- \`<Claude model="sonnet|opus|haiku" maxTurns={n}>\` - Claude agent for AI tasks
  - Props: model, maxTurns, tools, systemPrompt, onFinished, onError, reportingEnabled

### Git Components
- \`<Commit message="..." autoDescribe notes={...}>\` - Create git commit
- \`<Notes>\` - Add git notes

### Review Component
- \`<Review target={...} criteria={[...]} agent="claude" model="sonnet" blocking>\` - Code review

## Script Structure

Your script should:
1. Initialize the database with createSmithersDB
2. Start an execution with db.execution.start
3. Define an async workflow function that returns JSX
4. Create a root with createSmithersRoot()
5. Mount the workflow
6. Handle completion/errors
7. Clean up with db.close()

## Example Pattern

\`\`\`tsx
const db = await createSmithersDB({ path: '.smithers/my-task' })
const executionId = await db.execution.start('My Task', 'scripts/my-task.tsx')

async function MyWorkflow() {
  return (
    <SmithersProvider db={db} executionId={executionId}>
      <Orchestration globalTimeout={600000}>
        <Phase name="Main">
          <Claude model="sonnet" maxTurns={10} onFinished={() => console.log('Done!')}>
            Your prompt here
          </Claude>
        </Phase>
      </Orchestration>
    </SmithersProvider>
  )
}

const root = createSmithersRoot()
await root.mount(MyWorkflow)
await db.execution.complete(executionId)
await db.close()
\`\`\`

## Output Format

Return ONLY the script body (everything that goes inside the main function), not the imports or boilerplate.
The script should be complete and ready to execute.
Do not include markdown code fences - return raw TypeScript/TSX code only.`

async function generateSmithersScript(
  task: string,
  options: SmithersExecutionOptions
): Promise<{ script: string; planningResult: AgentResult }> {
  const prompt = `Generate a Smithers orchestration script for the following task:

${task}

${options.context ? `\nAdditional context:\n${options.context}` : ''}

The script should use model "${options.executionModel || 'sonnet'}" for Claude agents.

Return ONLY the script body code, no markdown fences or explanations.`

  options.onProgress?.('Planning Smithers script...')

  const planningResult = await executeClaudeCLI({
    prompt,
    model: options.plannerModel || 'sonnet',
    maxTurns: options.maxPlanningTurns || DEFAULT_MAX_PLANNING_TURNS,
    systemPrompt: PLANNING_SYSTEM_PROMPT,
    timeout: options.timeout || DEFAULT_PLANNING_TIMEOUT_MS,
    ...(options.onProgress ? { onProgress: options.onProgress } : {}),
  })

  if (planningResult.stopReason === 'error') {
    throw new Error(`Script planning failed: ${planningResult.output}`)
  }

  // Clean up the output (remove any markdown fences if present)
  let scriptBody = planningResult.output
    .replace(/^```(?:tsx?|typescript)?\n?/gm, '')
    .replace(/\n?```$/gm, '')
    .trim()

  // Build the full script
  const fullScript = SCRIPT_TEMPLATE
    .replace('{{TASK}}', task.replace(/\*/g, '\\*').slice(0, 100))
    .replace('{{TIMESTAMP}}', new Date().toISOString())
    .replace('{{SCRIPT_BODY}}', scriptBody)

  return { script: fullScript, planningResult }
}

async function writeScriptFile(script: string, scriptPath?: string): Promise<string> {
  const filePath = scriptPath || path.join(
    os.tmpdir(),
    `smithers-subagent-${Date.now()}.tsx`
  )

  await fs.writeFile(filePath, script)
  await fs.chmod(filePath, '755')

  return filePath
}

async function executeScript(
  scriptPath: string,
  options: SmithersExecutionOptions
): Promise<{ output: string; exitCode: number; durationMs: number }> {
  const startTime = Date.now()
  const timeout = options.timeout || DEFAULT_SCRIPT_TIMEOUT_MS

  options.onProgress?.(`Executing Smithers script: ${scriptPath}`)

  try {
    const proc = Bun.spawn(['bun', scriptPath], {
      cwd: options.cwd || process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
    })

    // Set up timeout
    let killed = false
    const timeoutId = setTimeout(() => {
      killed = true
      proc.kill()
    }, timeout)

    // Collect output
    let stdout = ''
    let stderr = ''
    const decoder = new TextDecoder()

    // Read stdout
    const stdoutReader = proc.stdout.getReader()
    const readStdout = async () => {
      while (true) {
        const { done, value } = await stdoutReader.read()
        if (done) break
        const chunk = decoder.decode(value)
        stdout += chunk
        options.onProgress?.(chunk)
      }
    }

    // Read stderr
    const stderrReader = proc.stderr.getReader()
    const readStderr = async () => {
      while (true) {
        const { done, value } = await stderrReader.read()
        if (done) break
        stderr += decoder.decode(value)
      }
    }

    await Promise.all([readStdout(), readStderr()])
    const exitCode = await proc.exited
    clearTimeout(timeoutId)

    const durationMs = Date.now() - startTime

    if (killed) {
      return {
        output: stdout + '\n[Execution timed out after ' + timeout + 'ms]',
        exitCode: -1,
        durationMs,
      }
    }

    return {
      output: stdout + (stderr ? '\n[stderr]\n' + stderr : ''),
      exitCode,
      durationMs,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    return {
      output: error instanceof Error ? error.message : String(error),
      exitCode: -1,
      durationMs,
    }
  }
}

export async function executeSmithers(options: SmithersExecutionOptions): Promise<SmithersResult> {
  const startTime = Date.now()

  try {
    // Step 1: Generate the script
    const { script, planningResult } = await generateSmithersScript(options.task, options)

    // Step 2: Write to file
    const scriptPath = await writeScriptFile(script, options.scriptPath)
    options.onScriptGenerated?.(script, scriptPath)
    options.onProgress?.(`Script written to: ${scriptPath}`)

    // Step 3: Execute the script
    const execResult = await executeScript(scriptPath, options)

    // Step 4: Clean up (unless keepScript is true)
    if (!options.keepScript && !options.scriptPath) {
      try {
        await fs.unlink(scriptPath)
      } catch {
        // Ignore cleanup errors
      }
    }

    const durationMs = Date.now() - startTime

    return {
      output: execResult.output,
      script,
      scriptPath,
      planningResult,
      tokensUsed: {
        input: planningResult.tokensUsed.input,
        output: planningResult.tokensUsed.output,
      },
      turnsUsed: planningResult.turnsUsed,
      stopReason: execResult.exitCode === 0 ? 'completed' : 'error',
      durationMs,
      exitCode: execResult.exitCode,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    return {
      output: errorMessage,
      script: '',
      scriptPath: '',
      planningResult: {
        output: errorMessage,
        tokensUsed: { input: 0, output: 0 },
        turnsUsed: 0,
        stopReason: 'error',
        durationMs: 0,
      },
      tokensUsed: { input: 0, output: 0 },
      turnsUsed: 0,
      stopReason: 'error',
      durationMs,
      exitCode: -1,
    }
  }
}
