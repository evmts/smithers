#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const os = require('os')

const pluginName = 'smithers'
const pluginDir = path.join(os.homedir(), '.claude', 'plugins', pluginName)
const sourceDir = __dirname

console.log('')
console.log('🔧 Installing Smithers plugin to Claude Code...')
console.log('')

try {
  // Create plugin directory
  fs.mkdirSync(pluginDir, { recursive: true })

  // Files to copy
  const filesToCopy = [
    'plugin.json',
    'skills/smithers/SKILL.md',
    'skills/smithers/REFERENCE.md',
    'skills/smithers/EXAMPLES.md',
  ]

  // Copy each file
  filesToCopy.forEach((file) => {
    const src = path.join(sourceDir, file)
    const dest = path.join(pluginDir, file)

    // Create destination directory if needed
    fs.mkdirSync(path.dirname(dest), { recursive: true })

    // Copy file
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest)
      console.log(`   ✓ Copied ${file}`)
    } else {
      console.warn(`   ⚠️  File not found: ${file}`)
    }
  })

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log('✅ Smithers plugin installed successfully!')
  console.log('')
  console.log(`   Plugin location: ${pluginDir}`)
  console.log('')
  console.log('📚 Next steps:')
  console.log('')
  console.log('   1. Restart Claude Code (if running) to load the plugin')
  console.log('')
  console.log('   2. Create your first orchestration:')
  console.log('      bunx smithers init')
  console.log('')
  console.log('   3. Edit .smithers/main.tsx to define your workflow')
  console.log('')
  console.log('   4. Run with monitoring:')
  console.log('      bunx smithers monitor')
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log('💡 Using Claude Code:')
  console.log('')
  console.log('   The plugin teaches Claude to create and monitor orchestrations.')
  console.log('   Try asking:')
  console.log('')
  console.log('   "Create a multi-agent workflow to research and summarize a topic"')
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
} catch (error) {
  console.error('')
  console.error('❌ Plugin installation failed:', error.message)
  console.error('')
  console.error('You can manually copy the plugin files to:')
  console.error(`   ${pluginDir}`)
  console.error('')
  process.exit(1)
}
