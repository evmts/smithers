/**
 * Repository verification utilities for post-commit clean state validation
 * Ensures working copy is clean after commits using JJ version control
 */

export interface ExecFunction {
  (command: string): Promise<{ stdout: string }>
}

export interface JJStatusResult {
  isClean: boolean
  changes: string[]
}

export interface VerificationResult {
  verified: boolean
  message: string
  changes?: string[]
}

/**
 * Parse JJ status output to extract working copy changes
 */
function parseJJStatus(statusOutput: string): JJStatusResult {
  const lines = statusOutput.split('\n').map(line => line.trim()).filter(Boolean)
  const changes: string[] = []
  let inWorkingCopySection = false

  for (const line of lines) {
    // Look for "Working copy changes:" section
    if (line.startsWith('Working copy changes:')) {
      inWorkingCopySection = true
      continue
    }

    // If we're in the working copy section, collect file changes
    if (inWorkingCopySection) {
      // Stop collecting if we hit another section
      if (line.includes(':') && !line.match(/^[MADRC]\s/)) {
        break
      }

      // Collect file status lines (M, A, D, R, C prefixes)
      if (line.match(/^[MADRC]\s/)) {
        changes.push(line)
      }
    }
  }

  return {
    isClean: changes.length === 0,
    changes
  }
}

/**
 * Verify that the working copy is clean (no uncommitted changes)
 */
async function verifyCleanWorkingCopy(exec: ExecFunction): Promise<JJStatusResult> {
  try {
    const result = await exec('jj status')
    return parseJJStatus(result.stdout)
  } catch (error) {
    throw new Error(`Failed to verify repository status: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Post-commit verification that fails loudly if working copy has changes
 * This is the main verification function that should be called after commits
 */
async function verifyPostCommit(exec: ExecFunction): Promise<VerificationResult> {
  try {
    const statusResult = await verifyCleanWorkingCopy(exec)

    if (statusResult.isClean) {
      return {
        verified: true,
        message: 'Repository verification passed: working copy is clean'
      }
    }

    // Build detailed error message
    const errorLines = [
      '🚨 VERIFICATION FAILED: Working copy has uncommitted changes after commit!',
      '',
      'This indicates the commit operation did not complete successfully.',
      'The following changes were found:',
      '',
      ...statusResult.changes.map(change => `  ${change}`),
      '',
      'Please investigate and ensure all changes are properly committed.'
    ]

    return {
      verified: false,
      message: errorLines.join('\n'),
      changes: statusResult.changes
    }
  } catch (error) {
    return {
      verified: false,
      message: `🚨 VERIFICATION ERROR: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

export const repoVerifier = {
  verifyCleanWorkingCopy,
  verifyPostCommit,
  parseJJStatus
}