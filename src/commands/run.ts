import { spawn, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { ensureExecutable, findPreloadPath, resolveEntrypoint } from './cli-utils.js'

interface RunOptions {
  file?: string
  /** If true, don't call process.exit() when child exits. Used for testing. */
  noExit?: boolean
}

export interface RunResult {
  child: ChildProcess
  promise: Promise<number>
}

export async function run(fileArg?: string, options: RunOptions = {}): Promise<RunResult> {
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
  })

  const promise = new Promise<number>((resolve, reject) => {
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

      reject(error)
      if (!options.noExit) {
        process.exit(1)
      }
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

      resolve(code || 0)
      if (!options.noExit) {
        process.exit(code || 0)
      }
    })
  })

  return { child, promise }
}
