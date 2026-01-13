import { Command } from 'commander'
import pc from 'picocolors'
import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { displaySuccess, displayError, displayWarning, displayInfo } from '../utils/display.js'
import { findGitRoot, isGitRepo } from '../utils/git.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const initCommand = new Command('init')
  .description('Initialize a new Ralph project')
  .argument('[dir]', 'Directory to initialize', '.')
  .option('--template <name>', 'Template to use (hello-ralph, git-automation)', 'hello-ralph')
  .option('--no-hooks', 'Skip git hooks installation')
  .option('--no-codex', 'Initialize without Codex integration')
  .action(async (dir: string, options) => {
    try {
      await init(dir, options)
    } catch (error) {
      displayError((error as Error).message)
      process.exit(1)
    }
  })

interface InitOptions {
  template?: string
  hooks?: boolean
  codex?: boolean
}

async function init(dir: string, options: InitOptions): Promise<void> {
  const targetDir = path.resolve(process.cwd(), dir)
  const dirName = path.basename(targetDir)

  // Create directory if it doesn't exist
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
    displaySuccess(`Created directory: ${dirName}`)
  }

  // Check if directory is empty (except for .git)
  const files = fs.readdirSync(targetDir).filter((f) => f !== '.git' && !f.startsWith('.'))
  if (files.length > 0) {
    displayWarning(`Directory ${dirName} is not empty`)
    const readline = await import('readline')
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    const answer = await new Promise<string>((resolve) => {
      rl.question(pc.cyan('Continue anyway? (y/n): '), resolve)
    })

    rl.close()

    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
      console.log(pc.yellow('Initialization cancelled'))
      return
    }
  }

  // Initialize git if not already a repo
  if (!isGitRepo(targetDir)) {
    try {
      execSync('git init', { cwd: targetDir, stdio: 'pipe' })
      displaySuccess('Initialized git repository')
    } catch (error) {
      displayWarning('Failed to initialize git repository')
    }
  }

  // Copy template file - find templates directory relative to package root
  const templateName = options.template || 'hello-ralph'

  // Find package.json to locate package root
  let current = __dirname
  let packageRoot = ''
  while (current !== path.parse(current).root) {
    const packagePath = path.join(current, 'package.json')
    if (fs.existsSync(packagePath)) {
      const content = JSON.parse(fs.readFileSync(packagePath, 'utf-8'))
      if (content.name === '@evmts/ralph') {
        packageRoot = current
        break
      }
    }
    current = path.dirname(current)
  }

  if (!packageRoot) {
    throw new Error('Could not find @evmts/ralph package root')
  }

  const templatePath = path.join(packageRoot, 'templates', `${templateName}.mdx`)

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templateName}. Available: hello-ralph, git-automation`)
  }

  const templateContent = fs.readFileSync(templatePath, 'utf-8')
  const agentPath = path.join(targetDir, 'agent.mdx')

  fs.writeFileSync(agentPath, templateContent)
  displaySuccess(`Created agent.mdx from ${templateName} template`)

  // Create package.json
  const packageJson = {
    name: dirName,
    version: '0.1.0',
    type: 'module',
    scripts: {
      start: 'ralph run agent.mdx',
      review: 'ralph review HEAD',
      note: 'ralph note',
    },
    dependencies: {
      '@evmts/ralph': 'latest',
      '@evmts/smithers': 'latest',
      react: '^19.0.0',
    },
  }

  const packageJsonPath = path.join(targetDir, 'package.json')
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n')
  displaySuccess('Created package.json')

  // Create reviews directory
  const reviewsDir = path.join(targetDir, 'reviews')
  if (!fs.existsSync(reviewsDir)) {
    fs.mkdirSync(reviewsDir)
    displaySuccess('Created reviews/ directory')
  }

  // Create .gitignore if it doesn't exist
  const gitignorePath = path.join(targetDir, '.gitignore')
  const gitignoreContent = `
node_modules/
dist/
*.log
.env
.DS_Store
`

  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, gitignoreContent.trim() + '\n')
    displaySuccess('Created .gitignore')
  }

  // Install git hooks if requested
  if (options.hooks !== false) {
    const repoRoot = findGitRoot(targetDir)
    if (repoRoot) {
      try {
        const { installHooks } = await import('../hooks/installer.js')
        await installHooks(repoRoot, {
          codex: options.codex !== false,
          notes: true,
        })
        displaySuccess('Git hooks installed')
      } catch (error) {
        displayWarning(`Failed to install hooks: ${(error as Error).message}`)
      }
    }
  }

  // Display next steps
  console.log()
  console.log(pc.bold(pc.green('✨ Ralph project initialized!')))
  console.log()
  console.log(pc.bold('Next steps:'))

  if (dir !== '.') {
    console.log(`  ${pc.dim('$')} cd ${dir}`)
  }

  console.log(`  ${pc.dim('$')} export ANTHROPIC_API_KEY=<your-key>`)
  console.log(`  ${pc.dim('$')} bun install`)
  console.log(`  ${pc.dim('$')} ralph run agent.mdx`)
  console.log()

  if (options.hooks !== false) {
    console.log(pc.bold('Git automation ready:'))
    console.log('  ✓ Hooks installed (post-commit)')

    if (options.codex !== false) {
      console.log('  ✓ Codex reviews enabled')
    } else {
      console.log('  ○ Codex reviews disabled')
    }

    console.log('  ✓ Git notes automation available')
    console.log()
  }

  displayInfo(`Template used: ${templateName}`)
  console.log()
}
