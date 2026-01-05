#!/usr/bin/env bun
import { Command } from 'commander'
import pc from 'picocolors'

import { runCommand } from './commands/run.js'
import { planCommand } from './commands/plan.js'
import { initCommand } from './commands/init.js'

const VERSION = '0.1.0'

const program = new Command()
  .name('smithers')
  .description('React-based AI agent framework')
  .version(VERSION, '-V, --version', 'Print version')

// Add commands
program.addCommand(runCommand)
program.addCommand(planCommand)
program.addCommand(initCommand)

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
  ${pc.dim('$')} smithers run agent.mdx           ${pc.dim('# Run an agent')}
  ${pc.dim('$')} smithers run agent.mdx --yes     ${pc.dim('# Auto-approve execution')}
  ${pc.dim('$')} smithers plan agent.mdx          ${pc.dim('# Show plan without executing')}
  ${pc.dim('$')} smithers init my-agent           ${pc.dim('# Initialize a new project')}
  ${pc.dim('$')} smithers init . --template research
`
)

// Default action (no command) - show help
program.action(() => {
  program.help()
})

// Parse and run
program.parse()
