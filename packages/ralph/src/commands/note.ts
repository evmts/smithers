import { Command } from 'commander'
import pc from 'picocolors'
import { execSync } from 'child_process'
import { displaySuccess, displayError, displayInfo } from '../utils/display.js'
import { findGitRoot, escapeShellArg } from '../utils/git.js'
import { fillTemplate, openEditorForNote, type NoteTemplate } from '../notes/templates.js'

export const noteCommand = new Command('note')
  .description('Add conversation context to commits as git notes')
  .argument('[commit]', 'Commit to add note to', 'HEAD')
  .option('-m, --message <text>', 'Add note directly')
  .option('-e, --edit', 'Open editor for note')
  .option('--template <type>', 'Use template (conversation, decision, context)')
  .option('--append', 'Append to existing note')
  .option('--show', 'Show notes for commit')
  .action(async (commit: string, options) => {
    try {
      await note(commit, options)
    } catch (error) {
      displayError((error as Error).message)
      process.exit(1)
    }
  })

interface NoteOptions {
  message?: string
  edit?: boolean
  template?: string
  append?: boolean
  show?: boolean
}

async function note(commit: string, options: NoteOptions): Promise<void> {
  const repoRoot = findGitRoot(process.cwd())

  if (!repoRoot) {
    throw new Error('Not in a git repository')
  }

  // Show mode
  if (options.show) {
    try {
      const notes = execSync(`git notes show ${commit}`, { encoding: 'utf-8' })
      console.log(pc.bold(`Notes for ${commit}:`))
      console.log(notes)
    } catch {
      displayInfo(`No notes for commit ${commit}`)
    }
    return
  }

  // Get note content
  let noteContent: string

  if (options.message) {
    // Direct message
    noteContent = options.message
  } else if (options.template) {
    // Use template
    const validTemplates = ['conversation', 'decision', 'context']
    if (!validTemplates.includes(options.template)) {
      throw new Error(`Invalid template: ${options.template}. Valid: ${validTemplates.join(', ')}`)
    }

    noteContent = await fillTemplate(options.template as NoteTemplate, commit)
  } else {
    // Open editor
    noteContent = await openEditorForNote(commit)
  }

  // Get existing note if appending
  let existingNote = ''
  if (options.append) {
    try {
      existingNote = execSync(`git notes show ${commit}`, { encoding: 'utf-8' })
    } catch {
      // No existing note
    }
  }

  // Format final note
  const timestamp = new Date().toISOString()
  const finalNote = existingNote
    ? `${existingNote}\n\n--- Note added ${timestamp} ---\n${noteContent}`
    : noteContent

  // Add note (use -f to replace existing note if not appending)
  const forceFlag = options.append ? '' : '-f'
  try {
    execSync(`git notes add ${forceFlag} -m "${escapeShellArg(finalNote)}" ${commit}`, {
      encoding: 'utf-8',
    })
  } catch (error) {
    throw new Error(`Failed to add note: ${error}`)
  }

  displaySuccess(`Note added to commit ${commit}`)
  console.log()
  displayInfo('To push notes to remote:')
  console.log(`  ${pc.dim('$')} git push origin refs/notes/*`)
  console.log()
  displayInfo('To view notes:')
  console.log(`  ${pc.dim('$')} ralph note --show ${commit}`)
  console.log(`  ${pc.dim('$')} git log --show-notes`)
}
