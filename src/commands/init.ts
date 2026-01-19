import * as fs from 'fs'
import * as path from 'path'
import { findPackageRoot } from './cli-utils.js'

interface InitOptions {
  dir?: string
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
  console.log('   bunx smithers-orchestrator monitor')
  console.log('')
  console.log('   Or run directly:')
  console.log('   bunx smithers-orchestrator run')
  console.log('')
  console.log('   Dependencies are auto-installed on first run.')
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
}
