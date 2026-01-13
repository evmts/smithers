#!/usr/bin/env bun
import { Command } from 'commander'
import pc from 'picocolors'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

import { runCommand } from './commands/run.js'
import { initCommand } from './commands/init.js'
import { setupHooksCommand } from './commands/setup-hooks.js'
import { noteCommand } from './commands/note.js'
import { reviewCommand } from './commands/review.js'

// Get version from package.json
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const packageJsonPath = path.resolve(__dirname, '..', 'package.json')
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
const VERSION = packageJson.version

const program = new Command()
  .name('ralph')
  .description('Ralph Wiggum loop CLI with git automation')
  .version(VERSION, '-V, --version', 'Print version')

// Add commands
program.addCommand(runCommand)
program.addCommand(initCommand)
program.addCommand(setupHooksCommand)
program.addCommand(noteCommand)
program.addCommand(reviewCommand)

// Custom help
program.configureHelp({
  sortSubcommands: true,
  sortOptions: true,
})

// Add examples to help
program.addHelpText(
  'after',
  `
${pc.bold('Examples:')}
  ${pc.dim('$')} ralph run agent.mdx           ${pc.dim('# Execute an agent')}
  ${pc.dim('$')} ralph run agent.mdx --yes     ${pc.dim('# Auto-approve execution')}
  ${pc.dim('$')} ralph init my-project         ${pc.dim('# Initialize new project')}
  ${pc.dim('$')} ralph setup-hooks             ${pc.dim('# Install git hooks')}
  ${pc.dim('$')} ralph note -m "context..."    ${pc.dim('# Add git note')}
  ${pc.dim('$')} ralph review HEAD             ${pc.dim('# Review a commit')}

${pc.bold('The Ralph Loop:')}
  Ralph keeps going in a loop (render → execute → update → repeat)
  until all work is done. It's named after Ralph Wiggum because
  he famously said "I'm going, I'm going!"
`
)

// Default action (no command) - show help
program.action(() => {
  program.help()
})

// Parse and run
program.parse()
