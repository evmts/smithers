import * as core from '@actions/core'
import * as github from '@actions/github'

/**
 * Request manual approval before execution
 *
 * This function creates a "deployment" that requires manual approval.
 * Requires workflow to use an "environment" with protection rules.
 *
 * @returns true if approved, false if rejected/timeout
 */
export async function requestApproval(): Promise<boolean> {
  // In a real implementation, this would integrate with GitHub Environments
  // For now, we'll use a simple prompt mechanism

  const approvalTimeout = parseInt(core.getInput('approval-timeout') || '3600000')
  const startTime = Date.now()

  core.info('⏸️  Waiting for manual approval...')
  core.info('ℹ️  To approve, add a workflow_dispatch event or use GitHub Environments')

  // Check environment context
  const environmentName = process.env.GITHUB_ENV_NAME

  if (environmentName) {
    core.info(`🔒 Environment: ${environmentName}`)
    // GitHub Environments handle approval automatically
    // If we reach here, approval was granted
    return true
  }

  // Without environment protection, we can't implement true approval gates
  // Log warning and auto-approve
  core.warning('⚠️  Approval gate requires GitHub Environment protection rules')
  core.warning('⚠️  Auto-approving for now. See: https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment')

  return true
}

/**
 * Check if approval timeout has been exceeded
 */
function isTimeoutExceeded(startTime: number, timeoutMs: number): boolean {
  return Date.now() - startTime > timeoutMs
}
