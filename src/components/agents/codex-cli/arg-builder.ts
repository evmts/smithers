import type { CodexCLIExecutionOptions, CodexSandboxMode, CodexApprovalPolicy } from '../types/codex.js'

/**
 * Model name mapping from shorthand to full model ID
 */
export const codexModelMap: Record<string, string> = {
  o3: 'o3',
  o4: 'o4-mini',
  'o4-mini': 'o4-mini',
  'gpt-4o': 'gpt-4o',
  'gpt-4': 'gpt-4',
}

/**
 * Build sandbox arguments based on mode
 */
function buildSandboxArgs(mode?: CodexSandboxMode): string[] {
  if (!mode) return []
  return ['--sandbox', mode]
}

/**
 * Build approval arguments based on policy
 * Note: `codex exec` doesn't support --ask-for-approval directly.
 * Approval policies are mapped to available exec flags:
 * - 'never' → --full-auto (runs without approval prompts)
 * - Other policies are ignored in exec mode (not supported)
 */
function buildApprovalArgs(_policy?: CodexApprovalPolicy): string[] {
  // codex exec doesn't support --ask-for-approval
  // The only approval-related flag is --full-auto
  return []
}

/**
 * Build Codex CLI arguments from options
 */
export function buildCodexArgs(options: CodexCLIExecutionOptions): string[] {
  const args: string[] = ['exec']

  // Model
  if (options.model) {
    const modelId = codexModelMap[options.model] || options.model
    args.push('--model', modelId)
  }

  // Sandbox mode
  args.push(...buildSandboxArgs(options.sandboxMode))

  // Approval policy handling for exec mode
  // codex exec doesn't have --ask-for-approval, but has --full-auto
  args.push(...buildApprovalArgs(options.approvalPolicy))

  // Full auto mode (also triggered by approvalPolicy: 'never')
  if (options.fullAuto || options.approvalPolicy === 'never') {
    args.push('--full-auto')
  }

  // Bypass sandbox (dangerous)
  if (options.bypassSandbox) {
    args.push('--dangerously-bypass-approvals-and-sandbox')
  }

  // Working directory
  if (options.cwd) {
    args.push('--cd', options.cwd)
  }

  // Skip git repo check
  if (options.skipGitRepoCheck) {
    args.push('--skip-git-repo-check')
  }

  // Additional writable directories
  if (options.addDirs && options.addDirs.length > 0) {
    for (const dir of options.addDirs) {
      args.push('--add-dir', dir)
    }
  }

  // Output schema
  if (options.outputSchema) {
    args.push('--output-schema', options.outputSchema)
  }

  // JSON output
  if (options.json) {
    args.push('--json')
  }

  // Output last message to file
  if (options.outputLastMessage) {
    args.push('--output-last-message', options.outputLastMessage)
  }

  // Images
  if (options.images && options.images.length > 0) {
    for (const image of options.images) {
      args.push('--image', image)
    }
  }

  // Config overrides
  if (options.configOverrides) {
    for (const [key, value] of Object.entries(options.configOverrides)) {
      args.push('--config', `${key}=${JSON.stringify(value)}`)
    }
  }

  // Profile
  if (options.profile) {
    args.push('--profile', options.profile)
  }

  // Add the prompt last
  args.push(options.prompt)

  return args
}
