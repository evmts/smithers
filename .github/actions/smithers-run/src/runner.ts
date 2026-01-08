import { loadAgentFile, executePlan } from '@evmts/smithers'
import * as fs from 'node:fs'
import * as path from 'node:path'

export interface RunnerOptions {
  agentPath: string
  config?: string
  mock: boolean
  maxFrames: number
  timeout: number
  autoApprove: boolean
  jsonOutput: boolean
  outputFile?: string
}

export interface RunnerResult {
  success: boolean
  data: unknown
  frames: number
  elapsed: number
  error?: string
}

/**
 * Run a Smithers agent with the given options
 */
export async function runAgent(options: RunnerOptions): Promise<RunnerResult> {
  const startTime = Date.now()
  let frames = 0

  try {
    // Resolve agent path relative to workspace
    const agentPath = path.resolve(process.cwd(), options.agentPath)

    if (!fs.existsSync(agentPath)) {
      throw new Error(`Agent file not found: ${options.agentPath}`)
    }

    // Load agent
    console.log(`📂 Loading agent: ${options.agentPath}`)
    const agent = await loadAgentFile(agentPath)

    // Load config if provided
    let configPath: string | undefined
    if (options.config) {
      configPath = path.resolve(process.cwd(), options.config)
      if (!fs.existsSync(configPath)) {
        throw new Error(`Config file not found: ${options.config}`)
      }
    }

    // Execute agent
    console.log('🚀 Executing agent...')
    const result = await executePlan(agent, {
      mockMode: options.mock,
      maxFrames: options.maxFrames,
      timeout: options.timeout,
      autoApprove: options.autoApprove,
      onFrameUpdate: (tree, frameNumber) => {
        frames = frameNumber
        console.log(`📊 Frame ${frameNumber} completed`)
      },
    })

    const elapsed = Date.now() - startTime

    // Save output file if requested
    if (options.outputFile) {
      const outputPath = path.resolve(process.cwd(), options.outputFile)
      const outputContent = options.jsonOutput ? JSON.stringify(result, null, 2) : String(result)
      fs.mkdirSync(path.dirname(outputPath), { recursive: true })
      fs.writeFileSync(outputPath, outputContent, 'utf-8')
      console.log(`💾 Result saved to: ${options.outputFile}`)
    }

    return {
      success: true,
      data: result,
      frames,
      elapsed,
    }
  } catch (error) {
    const elapsed = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    return {
      success: false,
      data: null,
      frames,
      elapsed,
      error: errorMessage,
    }
  }
}
