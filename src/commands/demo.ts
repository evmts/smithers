import * as fs from 'fs'
import * as path from 'path'
import { findPackageRoot } from './cli-utils.js'

export async function demo() {
  const targetDir = process.cwd()
  const demoFile = path.join(targetDir, 'SmithersDemo.tsx')

  console.log('🎓 Creating Smithers Demo file...')
  console.log('')

  if (fs.existsSync(demoFile)) {
    console.log('⚠️  SmithersDemo.tsx already exists')
    console.log('')
    console.log('To recreate, remove the file first:')
    console.log(`   rm ${demoFile}`)
    console.log('')
    process.exit(1)
  }

  const packageRoot = findPackageRoot(import.meta.url)
  const templatePath = path.join(packageRoot, 'templates/SmithersDemo.tsx')

  if (!fs.existsSync(templatePath)) {
    console.error(`❌ Template not found: ${templatePath}`)
    process.exit(1)
  }

  const templateContent = fs.readFileSync(templatePath, 'utf-8')
  fs.writeFileSync(demoFile, templateContent)
  fs.chmodSync(demoFile, '755')

  console.log('✅ Created SmithersDemo.tsx')
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log('Run the demo:')
  console.log('')
  console.log('   bun SmithersDemo.tsx')
  console.log('')
  console.log('This interactive demo teaches you:')
  console.log('   - Claude: AI agent component')
  console.log('   - Phase: Sequential workflow stages')
  console.log('   - Step: Ordered tasks within phases')
  console.log('   - Parallel: Concurrent execution')
  console.log('   - Schema: Structured output validation')
  console.log('   - db.state: Persistent key-value store')
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
}
