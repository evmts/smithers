import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

/**
 * Find the preload.ts file from the smithers-orchestrator package
 */
function findPreloadPath(): string {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  // Navigate up from src/orchestrator/commands to package root
  let dir = __dirname
  while (dir !== path.dirname(dir)) {
    const preloadPath = path.join(dir, 'preload.ts')
    if (fs.existsSync(preloadPath)) {
      return preloadPath
    }
    dir = path.dirname(dir)
  }
  throw new Error('Could not find preload.ts - smithers-orchestrator may be incorrectly installed')
}

interface RunOptions {
  file?: string
}

export async function run(fileArg?: string, options: RunOptions = {}) {
  const file = fileArg || options.file || '.smithers/main.tsx'
  const filePath = path.resolve(file)

  console.log('🚀 Running Smithers orchestration...')
  console.log(`   File: ${filePath}`)
  console.log('')

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`)
    console.log('')
    console.log('Did you run `smithers init` first?')
    console.log('')
    process.exit(1)
  }

  // Check if file is executable
  try {
    fs.accessSync(filePath, fs.constants.X_OK)
  } catch {
    // Make it executable
    fs.chmodSync(filePath, '755')
  }

  // Execute with bun -i (interactive mode keeps process alive)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')

  const preloadPath = findPreloadPath()
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
