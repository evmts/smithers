import { Command } from 'commander'
import pc from 'picocolors'
import {
  displaySuccess,
  displayError,
  displayWarning,
  displayInfo,
} from '../utils/display.js'
import { findGitRoot } from '../utils/git.js'
import { checkCodexAvailable, displayCodexInstallGuide } from '../codex/availability.js'
import {
  installHooks,
  detectHookConflicts,
  backupHooks,
  uninstallHooks,
  getHookStatus,
} from '../hooks/installer.js'

export const setupHooksCommand = new Command('setup-hooks')
  .description('Install git hooks for automated reviews and notes')
  .option('--force', 'Overwrite existing hooks without prompting')
  .option('--backup', 'Backup existing hooks before installing')
  .option('--check', 'Check hook status without installing')
  .option('--no-codex', 'Install without Codex integration')
  .option('--no-notes', 'Install without git notes prompts')
  .option('--uninstall', 'Remove Ralph hooks')
  .action(async (options) => {
    try {
      await setupHooks(options)
    } catch (error) {
      displayError((error as Error).message)
      process.exit(1)
    }
  })

interface SetupHooksOptions {
  force?: boolean
  backup?: boolean
  check?: boolean
  codex?: boolean
  notes?: boolean
  uninstall?: boolean
}

async function setupHooks(options: SetupHooksOptions): Promise<void> {
  const repoRoot = findGitRoot(process.cwd())

  if (!repoRoot) {
    throw new Error('Not in a git repository. Run "git init" first.')
  }

  // Check status mode
  if (options.check) {
    const status = await getHookStatus(repoRoot)

    if (!status) {
      displayInfo('No Ralph hooks installed')
      return
    }

    console.log(pc.bold('Hook Status:'))
    console.log(`  Installed: ${pc.green(status.installedAt)}`)
    console.log(`  CLI Version: ${pc.cyan(status.cliVersion)}`)
    console.log(`  Hook Version: ${pc.cyan(status.version)}`)
    console.log()
    console.log(pc.bold('  post-commit:'))
    console.log(`    Enabled: ${status.hooks['post-commit'].enabled ? pc.green('yes') : pc.red('no')}`)
    console.log(`    Codex: ${status.hooks['post-commit'].codex ? pc.green('yes') : pc.yellow('no')}`)
    console.log(`    Notes: ${status.hooks['post-commit'].notes ? pc.green('yes') : pc.yellow('no')}`)
    return
  }

  // Uninstall mode
  if (options.uninstall) {
    await uninstallHooks(repoRoot)
    displaySuccess('Ralph hooks removed')
    return
  }

  // Check Codex availability
  const codexAvailable = await checkCodexAvailable()

  if (!codexAvailable && options.codex !== false) {
    displayCodexInstallGuide()

    const readline = await import('readline')
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    const answer = await new Promise<string>((resolve) => {
      rl.question(
        pc.cyan('Continue without Codex? (Hooks will be installed but reviews disabled) (y/n): '),
        resolve
      )
    })

    rl.close()

    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
      console.log(pc.yellow('Installation cancelled'))
      return
    }
  }

  // Check for existing hooks
  const conflicts = await detectHookConflicts(repoRoot)

  if (conflicts.length > 0 && !options.force) {
    console.log(pc.yellow('Existing hooks detected:'))

    for (const conflict of conflicts) {
      if (conflict.type === 'ralph') {
        console.log(`  - ${conflict.hook} (Ralph v${conflict.version || 'unknown'})`)
      } else {
        console.log(`  - ${conflict.hook} (external)`)
      }
    }

    console.log()

    if (options.backup) {
      const backupPaths = await backupHooks(repoRoot, conflicts)
      for (const backupPath of backupPaths) {
        displayInfo(`Backed up to: ${backupPath}`)
      }
    } else {
      displayWarning('Use --backup to backup existing hooks')
      displayWarning('Use --force to overwrite without backup')

      const readline = await import('readline')
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      })

      const answer = await new Promise<string>((resolve) => {
        rl.question(pc.cyan('Overwrite without backup? (y/n): '), resolve)
      })

      rl.close()

      if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        console.log(pc.yellow('Installation cancelled'))
        return
      }
    }
  }

  // Install hooks
  await installHooks(repoRoot, {
    codex: options.codex !== false && codexAvailable,
    notes: options.notes !== false,
    force: options.force,
    backup: options.backup,
  })

  displaySuccess('Git hooks installed!')
  console.log()
  console.log(pc.bold('Hooks enabled:'))

  const hookConfig = {
    codex: options.codex !== false && codexAvailable,
    notes: options.notes !== false,
  }

  if (hookConfig.codex && hookConfig.notes) {
    console.log('  - post-commit: Codex reviews + git notes')
  } else if (hookConfig.codex) {
    console.log('  - post-commit: Codex reviews only')
  } else if (hookConfig.notes) {
    console.log('  - post-commit: Git notes only')
  } else {
    console.log('  - post-commit: Installed but minimal features')
  }

  console.log()
  displayInfo('To update: ralph setup-hooks --force')
  displayInfo('To disable: ralph setup-hooks --uninstall')
  console.log()
}
