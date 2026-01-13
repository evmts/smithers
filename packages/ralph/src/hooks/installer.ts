import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import type { HookInstallOptions, HookConflict, HookMetadata } from './types.js'

// Find package.json - works both in source and bundled
function findPackageJson(startDir: string): string {
  let current = startDir
  const root = path.parse(current).root

  while (current !== root) {
    const packagePath = path.join(current, 'package.json')
    if (fs.existsSync(packagePath)) {
      const content = JSON.parse(fs.readFileSync(packagePath, 'utf-8'))
      if (content.name === '@evmts/ralph') {
        return packagePath
      }
    }
    current = path.dirname(current)
  }

  throw new Error('Could not find @evmts/ralph package.json')
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const packageJsonPath = findPackageJson(__dirname)
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))

export async function installHooks(repoRoot: string, options: HookInstallOptions): Promise<void> {
  const hooksDir = path.join(repoRoot, '.git', 'hooks')

  // Ensure hooks directory exists
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true })
  }

  const hookPath = path.join(hooksDir, 'post-commit')

  // Read template - find hooks directory relative to package root
  const packageRoot = path.dirname(packageJsonPath)
  const templatePath = path.join(packageRoot, 'hooks', 'post-commit.template')

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Hook template not found: ${templatePath}. Package root: ${packageRoot}`)
  }

  let template = fs.readFileSync(templatePath, 'utf-8')

  // Replace variables
  template = template
    .replace(/\{\{VERSION\}\}/g, packageJson.version)
    .replace(/\{\{HOOK_VERSION\}\}/g, '1.0.0')
    .replace(/\{\{CODEX_ENABLED\}\}/g, String(options.codex ?? true))
    .replace(/\{\{NOTES_ENABLED\}\}/g, String(options.notes ?? true))
    .replace(/\{\{REVIEWS_DIR\}\}/g, 'reviews')

  // Write hook
  fs.writeFileSync(hookPath, template, { mode: 0o755 })

  // Create metadata file
  const metadata: HookMetadata = {
    version: '1.0.0',
    installedAt: new Date().toISOString(),
    cliVersion: packageJson.version,
    hooks: {
      'post-commit': {
        enabled: true,
        codex: options.codex ?? true,
        notes: options.notes ?? true,
        version: '1.0.0',
      },
    },
  }

  const metadataPath = path.join(repoRoot, '.ralph-hooks.json')
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n')

  // Create reviews directory
  const reviewsDir = path.join(repoRoot, 'reviews')
  if (!fs.existsSync(reviewsDir)) {
    fs.mkdirSync(reviewsDir, { recursive: true })
  }
}

export async function detectHookConflicts(repoRoot: string): Promise<HookConflict[]> {
  const hooksDir = path.join(repoRoot, '.git', 'hooks')
  const hookPath = path.join(hooksDir, 'post-commit')

  if (!fs.existsSync(hookPath)) {
    return []
  }

  const content = fs.readFileSync(hookPath, 'utf-8')

  // Check if Ralph-managed
  if (content.includes('@evmts/ralph')) {
    // Extract version if possible
    const versionMatch = content.match(/v(\d+\.\d+\.\d+)/)
    return [
      {
        hook: 'post-commit',
        type: 'ralph',
        action: 'update',
        version: versionMatch?.[1],
      },
    ]
  }

  // External hook
  return [
    {
      hook: 'post-commit',
      type: 'external',
      action: 'backup',
    },
  ]
}

export async function backupHooks(repoRoot: string, conflicts: HookConflict[]): Promise<string[]> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0]
  const backupPaths: string[]= []

  for (const conflict of conflicts) {
    const hookPath = path.join(repoRoot, '.git', 'hooks', conflict.hook)
    const backupPath = `${hookPath}.backup.${timestamp}`

    fs.copyFileSync(hookPath, backupPath)
    backupPaths.push(backupPath)
  }

  return backupPaths
}

export async function uninstallHooks(repoRoot: string): Promise<void> {
  const hookPath = path.join(repoRoot, '.git', 'hooks', 'post-commit')

  if (fs.existsSync(hookPath)) {
    const content = fs.readFileSync(hookPath, 'utf-8')

    // Only remove if Ralph-managed
    if (content.includes('@evmts/ralph')) {
      fs.unlinkSync(hookPath)
    } else {
      throw new Error('Hook is not Ralph-managed. Remove manually or use --force')
    }
  }

  // Remove metadata
  const metadataPath = path.join(repoRoot, '.ralph-hooks.json')
  if (fs.existsSync(metadataPath)) {
    fs.unlinkSync(metadataPath)
  }
}

export async function getHookStatus(repoRoot: string): Promise<HookMetadata | null> {
  const metadataPath = path.join(repoRoot, '.ralph-hooks.json')

  if (!fs.existsSync(metadataPath)) {
    return null
  }

  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
    return metadata
  } catch {
    return null
  }
}
