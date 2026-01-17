import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

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

  // Check if .smithers already exists
  if (fs.existsSync(smithersDir)) {
    console.log('⚠️  .smithers/ directory already exists')
    console.log('')
    console.log('To reinitialize, remove the directory first:')
    console.log(`   rm -rf ${smithersDir}`)
    console.log('')
    process.exit(1)
  }

  // Create directories
  fs.mkdirSync(smithersDir, { recursive: true })
  fs.mkdirSync(logsDir, { recursive: true })

  // Get template path
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const templatePath = path.join(__dirname, '../../templates/main.tsx.template')

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
  console.log('2. Install Smithers dependencies:')
  console.log('   cd .smithers && bun install smithers zustand')
  console.log('')
  console.log('3. Run with monitoring (recommended):')
  console.log('   bunx smithers-orchestrator monitor')
  console.log('')
  console.log('Or run directly:')
  console.log('   bunx smithers-orchestrator run')
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
}
