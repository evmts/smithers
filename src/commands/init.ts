import * as fs from 'fs'
import * as path from 'path'
import { findPackageRoot } from './cli-utils.js'
import { $ } from 'bun'

interface InitOptions {
  dir?: string
  skipInstall?: boolean
}

type PackageManager = 'bun' | 'pnpm' | 'yarn' | 'npm'

interface PackageManagerConfig {
  name: PackageManager
  installCmd: string[]
  runCmd: string
}

export function detectPackageManager(dir: string): PackageManagerConfig {
  // Check lockfiles in priority order
  if (fs.existsSync(path.join(dir, 'bun.lockb')) || fs.existsSync(path.join(dir, 'bun.lock'))) {
    return { name: 'bun', installCmd: ['bun', 'add', '-d', 'smithers-orchestrator'], runCmd: 'bun' }
  }
  if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) {
    return { name: 'pnpm', installCmd: ['pnpm', 'add', '-D', '-w', 'smithers-orchestrator'], runCmd: 'pnpm' }
  }
  if (fs.existsSync(path.join(dir, 'yarn.lock'))) {
    return { name: 'yarn', installCmd: ['yarn', 'add', '-D', 'smithers-orchestrator'], runCmd: 'yarn' }
  }
  if (fs.existsSync(path.join(dir, 'package-lock.json'))) {
    return { name: 'npm', installCmd: ['npm', 'install', '-D', 'smithers-orchestrator'], runCmd: 'npx' }
  }
  // Default to bun
  return { name: 'bun', installCmd: ['bun', 'add', '-d', 'smithers-orchestrator'], runCmd: 'bun' }
}

export async function init(options: InitOptions = {}) {
  const targetDir = options.dir || process.cwd()
  const smithersDir = path.join(targetDir, '.smithers')
  const logsDir = path.join(smithersDir, 'logs')
  const mainFile = path.join(smithersDir, 'main.tsx')

  console.log('🔧 Initializing Smithers orchestration...')
  console.log('')

  if (fs.existsSync(smithersDir)) {
    console.log('⚠️  .smithers/ directory already exists')
    console.log('')
    console.log('To reinitialize, remove the directory first:')
    console.log(`   rm -rf ${smithersDir}`)
    console.log('')
    process.exit(1)
  }

  try {
    fs.accessSync(targetDir, fs.constants.W_OK)
  } catch {
    console.error(`❌ No write permission for directory: ${targetDir}`)
    process.exit(1)
  }

  try {
    fs.mkdirSync(smithersDir, { recursive: true })
    fs.mkdirSync(logsDir, { recursive: true })
  } catch (error) {
    console.error(`❌ Failed to create directories:`, error instanceof Error ? error.message : error)
    process.exit(1)
  }

  const packageRoot = findPackageRoot(import.meta.url)
  const templatePath = path.join(packageRoot, 'templates/main.tsx.template')

  if (!fs.existsSync(templatePath)) {
    console.error(`❌ Template not found: ${templatePath}`)
    process.exit(1)
  }

  const templateContent = fs.readFileSync(templatePath, 'utf-8')
  fs.writeFileSync(mainFile, templateContent)
  fs.chmodSync(mainFile, '755')

  // Detect package manager and install smithers-orchestrator as dev dependency
  const packageJsonPath = path.join(targetDir, 'package.json')
  const pm = detectPackageManager(targetDir)
  const installCmdStr = pm.installCmd.join(' ')

  if (fs.existsSync(packageJsonPath)) {
    console.log(`📦 Installing smithers-orchestrator via ${pm.name}...`)
    if (!options.skipInstall) {
      try {
        const [cmd, ...args] = pm.installCmd
        await $`${cmd} ${args}`.cwd(targetDir).quiet()
        console.log('✅ Installed smithers-orchestrator as dev dependency')
      } catch {
        console.warn('⚠️  Failed to install smithers-orchestrator automatically')
        console.warn(`   Run manually: ${installCmdStr}`)
      }
    }
  } else {
    console.warn('⚠️  No package.json found - skipping smithers-orchestrator install')
    console.warn(`   Run manually: ${installCmdStr}`)
  }
  console.log('')

  console.log('✅ Smithers orchestration initialized!')
  console.log('')
  console.log('Created:')
  console.log(`   ${smithersDir}/`)
  console.log(`   ├── main.tsx       ← Your orchestration program`)
  console.log(`   └── logs/          ← Monitor output logs`)
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log('Next steps:')
  console.log('')
  console.log('1. Edit your orchestration:')
  console.log(`   ${mainFile}`)
  console.log('')
  console.log('2. Run with monitoring (recommended):')
  console.log(`   ${pm.runCmd} smithers-orchestrator monitor`)
  console.log('')
  console.log('   Or run directly:')
  console.log(`   ${pm.runCmd} smithers-orchestrator run`)
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
}
