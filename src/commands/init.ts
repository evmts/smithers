import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

interface InitOptions {
  dir?: string
}

/**
 * Find the package root by looking for package.json
 */
function findPackageRoot(startDir: string): string {
  let dir = startDir
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir
    }
    dir = path.dirname(dir)
  }
  return startDir
}

export async function init(options: InitOptions = {}) {
  const targetDir = options.dir || process.cwd()
  const smithersDir = path.join(targetDir, '.smithers')
  const logsDir = path.join(smithersDir, 'logs')
  const mainFile = path.join(smithersDir, 'main.tsx')

  console.log('🔧 Initializing Smithers orchestration...')
  console.log('')

  // Check if .smithers already exists
  if (fs.existsSync(smithersDir)) {
    console.log('⚠️  .smithers/ directory already exists')
    console.log('')
    console.log('To reinitialize, remove the directory first:')
    console.log(`   rm -rf ${smithersDir}`)
    console.log('')
    process.exit(1)
  }

  // Check write permission before creating directories
  try {
    fs.accessSync(targetDir, fs.constants.W_OK)
  } catch {
    console.error(`❌ No write permission for directory: ${targetDir}`)
    process.exit(1)
  }

  // Create directories
  try {
    fs.mkdirSync(smithersDir, { recursive: true })
    fs.mkdirSync(logsDir, { recursive: true })
  } catch (error) {
    console.error(`❌ Failed to create directories:`, error instanceof Error ? error.message : error)
    process.exit(1)
  }

  // Get template path - find package root first
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const packageRoot = findPackageRoot(__dirname)
  const templatePath = path.join(packageRoot, 'templates/main.tsx.template')

  // Copy template
  if (!fs.existsSync(templatePath)) {
    console.error(`❌ Template not found: ${templatePath}`)
    process.exit(1)
  }

  const templateContent = fs.readFileSync(templatePath, 'utf-8')
  fs.writeFileSync(mainFile, templateContent)
  fs.chmodSync(mainFile, '755') // Make executable

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
