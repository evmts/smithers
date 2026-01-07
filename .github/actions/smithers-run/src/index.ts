import * as core from '@actions/core'
import { runAgent } from './runner.js'
import { uploadResult } from './artifacts.js'
import { requestApproval } from './approval.js'

/**
 * Main action entry point
 */
async function run() {
  try {
    // Get inputs
    const agentPath = core.getInput('agent', { required: true })
    const config = core.getInput('config')
    const mock = core.getInput('mock') === 'true'
    const apiKey = core.getInput('anthropic-api-key') || process.env.ANTHROPIC_API_KEY
    const maxFrames = parseInt(core.getInput('max-frames') || '50')
    const timeout = parseInt(core.getInput('timeout') || '300000')
    const autoApprove = core.getInput('auto-approve') === 'true'
    const outputFile = core.getInput('output-file')
    const jsonOutput = core.getInput('json-output') === 'true'
    const uploadArtifacts = core.getInput('upload-artifacts') === 'true'
    const artifactName = core.getInput('artifact-name') || 'smithers-result'
    const approvalGate = core.getInput('approval-gate') === 'true'

    // Validate API key (unless mock mode)
    if (!mock && !apiKey) {
      throw new Error(
        'anthropic-api-key required (set input or ANTHROPIC_API_KEY env var)\n' +
          'Add to repository secrets: Settings → Secrets → Actions → New secret'
      )
    }

    // Set API key env var if provided
    if (apiKey) {
      process.env.ANTHROPIC_API_KEY = apiKey
    }

    // Set mock mode env var if enabled
    if (mock) {
      process.env.SMITHERS_MOCK = 'true'
    }

    // Handle approval gate
    if (approvalGate) {
      core.info('⏸️  Waiting for manual approval...')
      const approved = await requestApproval()
      if (!approved) {
        core.setFailed('❌ Execution not approved or timeout exceeded')
        return
      }
      core.info('✅ Approval granted')
    }

    // Run agent
    core.info(`🚀 Running agent: ${agentPath}`)
    core.info(`📋 Configuration:`)
    core.info(`   - Mock mode: ${mock}`)
    core.info(`   - Max frames: ${maxFrames}`)
    core.info(`   - Timeout: ${timeout}ms`)
    core.info(`   - Auto-approve: ${autoApprove}`)

    const result = await runAgent({
      agentPath,
      config,
      mock,
      maxFrames,
      timeout,
      autoApprove,
      jsonOutput,
      outputFile,
    })

    // Set outputs
    core.setOutput('result', jsonOutput ? JSON.stringify(result.data) : String(result.data))
    core.setOutput('success', result.success.toString())
    core.setOutput('frames', result.frames.toString())
    core.setOutput('elapsed', result.elapsed.toString())

    // Upload artifacts
    if (uploadArtifacts && result.success) {
      try {
        const artifactUrl = await uploadResult(result, artifactName)
        core.setOutput('artifact-url', artifactUrl)
        core.info(`📦 Artifact uploaded: ${artifactUrl}`)
      } catch (error) {
        core.warning(`Failed to upload artifact: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    // Create job summary
    await core.summary
      .addHeading('Smithers Agent Execution')
      .addTable([
        [
          { data: 'Metric', header: true },
          { data: 'Value', header: true },
        ],
        ['Agent', agentPath],
        ['Status', result.success ? '✅ Success' : '❌ Failed'],
        ['Frames', result.frames.toString()],
        ['Elapsed', `${(result.elapsed / 1000).toFixed(2)}s`],
        ['Mock Mode', mock ? 'Yes' : 'No'],
      ])
      .write()

    // If execution failed, add error details
    if (!result.success) {
      await core.summary.addHeading('Error Details', 3).addCodeBlock(result.error || 'Unknown error', 'text').write()

      core.setFailed(`❌ Agent execution failed: ${result.error}`)
    } else {
      core.info('✅ Agent execution completed successfully')

      // Add result preview to summary if available
      if (result.data && typeof result.data === 'object') {
        await core.summary
          .addHeading('Result Preview', 3)
          .addCodeBlock(JSON.stringify(result.data, null, 2).slice(0, 1000), 'json')
          .write()
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    core.setFailed(`❌ Action failed: ${errorMessage}`)

    // Add error to summary
    await core.summary.addHeading('Action Error', 2).addCodeBlock(errorMessage, 'text').write()
  }
}

// Run the action
run()
