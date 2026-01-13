export interface HookInstallOptions {
  codex?: boolean
  notes?: boolean
  force?: boolean
  backup?: boolean
}

export interface HookConflict {
  hook: string
  type: 'ralph' | 'external'
  action: 'update' | 'backup'
  version?: string
}

export interface HookMetadata {
  version: string
  installedAt: string
  cliVersion: string
  hooks: {
    'post-commit': {
      enabled: boolean
      codex: boolean
      notes: boolean
      version?: string
    }
  }
}
