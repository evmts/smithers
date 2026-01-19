import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { ensureExecutable, findPreloadPath, resolveEntrypoint } from './cli-utils.js'

interface RunOptions {
  file?: string
}

export async function run(fileArg?: string, options: RunOptions = {}) {
  const filePath = resolveEntrypoint(fileArg, options.file)

  console.log('🚀 Running Smithers orchestration...')
  console.log(`   File: ${filePath}`)
  console.log('')

  if (!existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`)
    console.log('')
    console.log('Did you run `smithers init` first?')
    console.log('')
    process.exit(1)
  }

  ensureExecutable(filePath)

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')

  const preloadPath = findPreloadPath(import.meta.url)
  const child = spawn('bun', ['--preload', preloadPath, '--install=fallback', filePath], {
    stdio: 'inherit',
    shell: true,
  })

  child.on('error', (error) => {
    console.error('')
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error('')
    console.error('❌ Execution failed:', error.message)
    console.error('')

    if (error.message.includes('ENOENT')) {
      console.error('Bun not found. Install it:')
      console.error('   curl -fsSL https://bun.sh/install | bash')
      console.error('')
    }

    process.exit(1)
  })

  child.on('exit', (code) => {
    console.log('')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    if (code === 0) {
      console.log('')
      console.log('✅ Orchestration completed successfully')
      console.log('')
    } else {
      console.log('')
      console.log(`❌ Orchestration exited with code: ${code}`)
      console.log('')
    }

    process.exit(code || 0)
  })
}
