/**
 * JJ Wrapper - Low-level JJ command execution and management
 * Provides direct interface to JJ commands with error handling and validation
 */

import type { VCSStatus } from '../utils/vcs/types.js'

export interface JJResult {
  success: boolean
  stdout?: string
  stderr?: string
  exitCode?: number
  error?: string
}

export interface JJLogEntry {
  changeId: string
  commitId?: string
  description: string
  author: string
  timestamp: Date
  parentIds: string[]
  bookmarks?: string[]
}

export interface JJBookmarkInfo {
  name: string
  changeId: string
  description?: string
  isRemote?: boolean
}

export interface JJExecuteOptions {
  timeout?: number
  workingDir?: string
  quiet?: boolean
}

export interface JJLogOptions {
  limit?: number
  revisions?: string
  template?: string
  noGraph?: boolean
}

export interface JJWrapper {
  execute(args: string[], options?: JJExecuteOptions): Promise<JJResult>

  // Changeset operations
  createChangeset(message: string, options?: { parents?: string[] }): Promise<JJResult>
  editChangeset(changeId: string): Promise<JJResult>
  abandonChangeset(changeId: string): Promise<JJResult>
  squashChangeset(changeId: string, target?: string): Promise<JJResult>
  describeChangeset(changeId: string, message: string): Promise<JJResult>
  duplicateChangeset(changeId: string): Promise<JJResult>

  // Status and diff operations
  getStatus(): Promise<JJResult & { output?: string }>
  getDiffStats(): Promise<JJResult & { output?: string }>
  getDiff(changeId?: string): Promise<JJResult & { output?: string }>
  getChangedFiles(changeId: string): Promise<JJResult & { files?: string[] }>

  // Log and history operations
  getChangeId(revision?: string): Promise<JJResult & { changeId?: string }>
  getCommitId(revision?: string): Promise<JJResult & { commitId?: string }>
  getDescription(revision?: string): Promise<JJResult & { description?: string }>
  getLog(options?: JJLogOptions): Promise<JJResult & { entries?: JJLogEntry[] }>

  // Bookmark operations
  createBookmark(name: string, changeId?: string): Promise<JJResult>
  moveBookmark(name: string, changeId: string): Promise<JJResult>
  deleteBookmark(name: string): Promise<JJResult>
  listBookmarks(): Promise<JJResult & { bookmarks?: JJBookmarkInfo[] }>

  // Repository info
  getRoot(): Promise<JJResult & { root?: string }>
  isRepo(): Promise<boolean>
  getWorkingCopyChangeId(): Promise<JJResult & { changeId?: string }>

  // Advanced operations
  rebase(changeId: string, destination: string): Promise<JJResult>
  resolveConflicts(files: string[]): Promise<JJResult>
  getConflictedFiles(): Promise<JJResult & { files?: string[] }>
}

export class JJWrapperError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'JJWrapperError'
  }
}

export function createJJWrapper(workingDir: string, jjPath = 'jj'): JJWrapper {

  function validateChangeId(changeId: string): void {
    if (!changeId || changeId.trim() === '') {
      throw new JJWrapperError('Change ID cannot be empty')
    }
    if (changeId.includes(' ') || changeId.includes('\n')) {
      throw new JJWrapperError('Invalid change ID format')
    }
  }

  function validateBookmarkName(name: string): void {
    if (!name || name.trim() === '') {
      throw new JJWrapperError('Bookmark name cannot be empty')
    }
    if (name.includes('/') || name.includes(' ')) {
      throw new JJWrapperError('Invalid bookmark name')
    }
  }

  function buildCommand(args: string[]): string {
    return `${jjPath} ${args.join(' ')}`
  }

  return {
    async execute(args: string[], options: JJExecuteOptions = {}): Promise<JJResult> {
      try {
        const command = buildCommand(args)
        const cwd = options.workingDir || workingDir

        const proc = Bun.spawn([jjPath, ...args], {
          cwd,
          stdout: 'pipe',
          stderr: 'pipe'
        })

        // Handle timeout if specified
        if (options.timeout) {
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Command timeout')), options.timeout)
          })

          await Promise.race([proc.exited, timeoutPromise])
        } else {
          await proc.exited
        }

        const stdout = await new Response(proc.stdout).text()
        const stderr = await new Response(proc.stderr).text()

        if (proc.exitCode !== 0) {
          return {
            success: false,
            stdout,
            stderr,
            exitCode: proc.exitCode,
            error: stderr || 'Command failed'
          }
        }

        return {
          success: true,
          stdout,
          stderr,
          exitCode: 0
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          exitCode: -1
        }
      }
    },

    async createChangeset(message: string, options: { parents?: string[] } = {}): Promise<JJResult> {
      const args = ['new', '-m', message]
      if (options.parents && options.parents.length > 0) {
        args.push(...options.parents.flatMap(parent => ['-r', parent]))
      }
      return this.execute(args)
    },

    async editChangeset(changeId: string): Promise<JJResult> {
      validateChangeId(changeId)
      return this.execute(['edit', changeId])
    },

    async abandonChangeset(changeId: string): Promise<JJResult> {
      validateChangeId(changeId)
      return this.execute(['abandon', changeId])
    },

    async squashChangeset(changeId: string, target?: string): Promise<JJResult> {
      validateChangeId(changeId)
      const args = ['squash', '-r', changeId]
      if (target) {
        validateChangeId(target)
        args.push('-d', target)
      }
      return this.execute(args)
    },

    async describeChangeset(changeId: string, message: string): Promise<JJResult> {
      validateChangeId(changeId)
      return this.execute(['describe', changeId, '-m', message])
    },

    async duplicateChangeset(changeId: string): Promise<JJResult> {
      validateChangeId(changeId)
      return this.execute(['duplicate', changeId])
    },

    async getStatus(): Promise<JJResult & { output?: string }> {
      const result = await this.execute(['status'])
      return {
        ...result,
        output: result.stdout
      }
    },

    async getDiffStats(): Promise<JJResult & { output?: string }> {
      const result = await this.execute(['diff', '--stat'])
      return {
        ...result,
        output: result.stdout
      }
    },

    async getDiff(changeId?: string): Promise<JJResult & { output?: string }> {
      const args = ['diff']
      if (changeId) {
        validateChangeId(changeId)
        args.push('-r', changeId)
      }
      const result = await this.execute(args)
      return {
        ...result,
        output: result.stdout
      }
    },

    async getChangedFiles(changeId: string): Promise<JJResult & { files?: string[] }> {
      validateChangeId(changeId)
      const result = await this.execute(['log', '-r', changeId, '--no-graph', '-T', 'files'])

      if (result.success && result.stdout) {
        const files = result.stdout.trim().split('\n').filter(line => line.trim() !== '')
          .map(line => {
            // Remove status prefix (M, A, D)
            return line.replace(/^[MAD]\s+/, '').trim()
          })

        return {
          ...result,
          files
        }
      }

      return result
    },

    async getChangeId(revision = '@'): Promise<JJResult & { changeId?: string }> {
      const result = await this.execute(['log', '-r', revision, '--no-graph', '-T', 'change_id'])

      if (result.success && result.stdout) {
        return {
          ...result,
          changeId: result.stdout.trim()
        }
      }

      return result
    },

    async getCommitId(revision = '@'): Promise<JJResult & { commitId?: string }> {
      const result = await this.execute(['log', '-r', revision, '--no-graph', '-T', 'commit_id'])

      if (result.success && result.stdout) {
        return {
          ...result,
          commitId: result.stdout.trim()
        }
      }

      return result
    },

    async getDescription(revision = '@'): Promise<JJResult & { description?: string }> {
      const result = await this.execute(['log', '-r', revision, '--no-graph', '-T', 'description'])

      if (result.success && result.stdout) {
        return {
          ...result,
          description: result.stdout.trim()
        }
      }

      return result
    },

    async getLog(options: JJLogOptions = {}): Promise<JJResult & { entries?: JJLogEntry[] }> {
      const args = ['log']

      if (options.limit) {
        args.push('--limit', String(options.limit))
      }

      if (options.revisions) {
        args.push('-r', options.revisions)
      }

      if (options.noGraph !== false) {
        args.push('--no-graph')
      }

      const template = options.template || 'change_id|description|committer_timestamp|author.email'
      args.push('-T', template)

      const result = await this.execute(args)

      if (result.success && result.stdout) {
        const entries = result.stdout.trim().split('\n')
          .filter(line => line.trim() !== '')
          .map(line => {
            const [changeId, description, timestamp, author] = line.split('|')
            return {
              changeId: changeId?.trim() || '',
              description: description?.trim() || '',
              author: author?.trim() || '',
              timestamp: new Date(timestamp?.trim() || Date.now()),
              parentIds: [] // Would need separate call to get this
            }
          })

        return {
          ...result,
          entries
        }
      }

      return result
    },

    async createBookmark(name: string, changeId?: string): Promise<JJResult> {
      validateBookmarkName(name)
      const args = ['bookmark', 'create', name]
      if (changeId) {
        validateChangeId(changeId)
        args.push('-r', changeId)
      }
      return this.execute(args)
    },

    async moveBookmark(name: string, changeId: string): Promise<JJResult> {
      validateBookmarkName(name)
      validateChangeId(changeId)
      return this.execute(['bookmark', 'set', name, '-r', changeId])
    },

    async deleteBookmark(name: string): Promise<JJResult> {
      validateBookmarkName(name)
      return this.execute(['bookmark', 'delete', name])
    },

    async listBookmarks(): Promise<JJResult & { bookmarks?: JJBookmarkInfo[] }> {
      const result = await this.execute(['bookmark', 'list'])

      if (result.success && result.stdout) {
        const bookmarks = result.stdout.trim().split('\n')
          .filter(line => line.trim() !== '')
          .map(line => {
            // Parse format: "name: changeId description"
            const colonIndex = line.indexOf(':')
            if (colonIndex === -1) return null

            const name = line.substring(0, colonIndex).trim()
            const rest = line.substring(colonIndex + 1).trim()
            const spaceIndex = rest.indexOf(' ')
            const changeId = spaceIndex === -1 ? rest : rest.substring(0, spaceIndex)
            const description = spaceIndex === -1 ? undefined : rest.substring(spaceIndex + 1).trim()

            return {
              name,
              changeId,
              description,
              isRemote: name.startsWith('@')
            }
          })
          .filter(bookmark => bookmark !== null) as JJBookmarkInfo[]

        return {
          ...result,
          bookmarks
        }
      }

      return result
    },

    async getRoot(): Promise<JJResult & { root?: string }> {
      const result = await this.execute(['root'])

      if (result.success && result.stdout) {
        return {
          ...result,
          root: result.stdout.trim()
        }
      }

      return result
    },

    async isRepo(): Promise<boolean> {
      const result = await this.execute(['root'], { quiet: true })
      return result.success
    },

    async getWorkingCopyChangeId(): Promise<JJResult & { changeId?: string }> {
      return this.getChangeId('@')
    },

    async rebase(changeId: string, destination: string): Promise<JJResult> {
      validateChangeId(changeId)
      validateChangeId(destination)
      return this.execute(['rebase', '-r', changeId, '-d', destination])
    },

    async resolveConflicts(files: string[]): Promise<JJResult> {
      if (files.length === 0) {
        throw new JJWrapperError('No files specified for conflict resolution')
      }
      return this.execute(['resolve', ...files])
    },

    async getConflictedFiles(): Promise<JJResult & { files?: string[] }> {
      const result = await this.execute(['resolve', '--list'])

      if (result.success && result.stdout) {
        const files = result.stdout.trim().split('\n')
          .filter(line => line.trim() !== '')
          .map(line => line.trim())

        return {
          ...result,
          files
        }
      }

      return result
    }
  }
}