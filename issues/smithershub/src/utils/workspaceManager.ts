/**
 * Workspace Manager - handles workspace creation, task execution, and cleanup
 * Provides isolated environments for parallel task execution with timeout management
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawn } from 'node:child_process'

export interface ExecutionResult {
  success: boolean
  stdout: string
  stderr: string
  exitCode: number
  duration: number
}

export interface TaskResult {
  success: boolean
  output: string
  duration: number
  error?: string
}

export interface WorkspaceConfig {
  baseDir?: string
  isolationMode?: 'directory' | 'container' | 'none'
  timeout?: number
  maxMemory?: number
  maxCpu?: number
}

export class WorkspaceManager {
  private baseDir: string
  private activeWorkspaces = new Map<string, string>()
  private runningProcesses = new Map<string, AbortController>()

  constructor(config: WorkspaceConfig = {}) {
    this.baseDir = config.baseDir || path.join(process.cwd(), '.workspaces')
    this.ensureBaseDir()
  }

  private ensureBaseDir(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true })
    }
  }

  /**
   * Create an isolated workspace for task execution
   */
  async createWorkspace(taskId: string): Promise<string> {
    const workspacePath = path.join(this.baseDir, taskId)

    // Clean up existing workspace
    if (fs.existsSync(workspacePath)) {
      fs.rmSync(workspacePath, { recursive: true, force: true })
    }

    // Create new workspace
    fs.mkdirSync(workspacePath, { recursive: true })

    // Copy base configuration files if they exist
    const configFiles = ['package.json', 'tsconfig.json', 'bun.lockb', '.env']
    const projectRoot = process.cwd()

    for (const file of configFiles) {
      const sourcePath = path.join(projectRoot, file)
      const targetPath = path.join(workspacePath, file)

      if (fs.existsSync(sourcePath)) {
        try {
          fs.copyFileSync(sourcePath, targetPath)
        } catch (error) {
          // Ignore copy errors for optional files
          console.warn(`Failed to copy ${file}:`, (error as Error).message)
        }
      }
    }

    // Create basic directory structure
    const dirs = ['src', 'tests', 'lib', 'dist']
    for (const dir of dirs) {
      const dirPath = path.join(workspacePath, dir)
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true })
      }
    }

    this.activeWorkspaces.set(taskId, workspacePath)
    return workspacePath
  }

  /**
   * Execute a command in the workspace
   */
  async executeCommand(
    command: string,
    workspacePath: string,
    options: {
      timeout?: number
      env?: Record<string, string>
      cwd?: string
    } = {}
  ): Promise<ExecutionResult> {
    const startTime = Date.now()
    const timeout = options.timeout || 30000
    const cwd = options.cwd || workspacePath

    return new Promise((resolve, reject) => {
      const abortController = new AbortController()
      const processId = `${workspacePath}_${Date.now()}`
      this.runningProcesses.set(processId, abortController)

      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        abortController.abort()
        this.runningProcesses.delete(processId)
        resolve({
          success: false,
          stdout: '',
          stderr: 'Command timed out',
          exitCode: -1,
          duration: timeout
        })
      }, timeout)

      const [cmd, ...args] = command.split(' ')
      const childProcess = spawn(cmd, args, {
        cwd,
        env: { ...process.env, ...options.env },
        signal: abortController.signal,
        stdio: ['ignore', 'pipe', 'pipe']
      })

      let stdout = ''
      let stderr = ''

      if (childProcess.stdout) {
        childProcess.stdout.on('data', (data: Buffer) => {
          stdout += data.toString()
        })
      }

      if (childProcess.stderr) {
        childProcess.stderr.on('data', (data: Buffer) => {
          stderr += data.toString()
        })
      }

      childProcess.on('close', (exitCode) => {
        clearTimeout(timeoutHandle)
        this.runningProcesses.delete(processId)

        const duration = Date.now() - startTime
        resolve({
          success: exitCode === 0,
          stdout,
          stderr,
          exitCode: exitCode || 0,
          duration
        })
      })

      childProcess.on('error', (error) => {
        clearTimeout(timeoutHandle)
        this.runningProcesses.delete(processId)

        const duration = Date.now() - startTime
        resolve({
          success: false,
          stdout,
          stderr: error.message,
          exitCode: -1,
          duration
        })
      })
    })
  }

  /**
   * Execute a task with implementation function
   */
  async executeTask(
    taskId: string,
    implementation: () => Promise<string>,
    options: {
      timeout?: number
      retries?: number
    } = {}
  ): Promise<TaskResult> {
    const startTime = Date.now()
    const timeout = options.timeout || 60000
    const retries = options.retries || 0

    const executeWithRetry = async (attempt: number): Promise<TaskResult> => {
      return new Promise((resolve) => {
        const abortController = new AbortController()
        this.runningProcesses.set(taskId, abortController)

        // Set up timeout
        const timeoutHandle = setTimeout(() => {
          abortController.abort()
          this.runningProcesses.delete(taskId)
          resolve({
            success: false,
            output: '',
            duration: timeout,
            error: `Task timeout after ${timeout}ms`
          })
        }, timeout)

        // Execute implementation
        implementation()
          .then((result) => {
            clearTimeout(timeoutHandle)
            this.runningProcesses.delete(taskId)

            const duration = Date.now() - startTime
            resolve({
              success: true,
              output: result,
              duration
            })
          })
          .catch(async (error) => {
            clearTimeout(timeoutHandle)
            this.runningProcesses.delete(taskId)

            if (attempt < retries) {
              // Wait before retry
              await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
              return executeWithRetry(attempt + 1)
            }

            const duration = Date.now() - startTime
            resolve({
              success: false,
              output: '',
              duration,
              error: error.message
            })
          })
      })
    }

    return executeWithRetry(0)
  }

  /**
   * Get task execution status
   */
  getTaskStatus(taskId: string): 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled' {
    if (this.runningProcesses.has(taskId)) {
      return 'running'
    }

    const workspacePath = this.activeWorkspaces.get(taskId)
    if (!workspacePath) {
      return 'pending'
    }

    // Check for status files (could be created by task implementation)
    const statusFile = path.join(workspacePath, '.task-status')
    if (fs.existsSync(statusFile)) {
      try {
        const status = fs.readFileSync(statusFile, 'utf8').trim()
        return status as any
      } catch {
        return 'completed'
      }
    }

    return 'completed'
  }

  /**
   * Cancel a running task
   */
  async cancelTask(taskId: string): Promise<boolean> {
    const abortController = this.runningProcesses.get(taskId)
    if (abortController) {
      abortController.abort()
      this.runningProcesses.delete(taskId)

      // Mark as cancelled in workspace
      const workspacePath = this.activeWorkspaces.get(taskId)
      if (workspacePath) {
        try {
          fs.writeFileSync(path.join(workspacePath, '.task-status'), 'cancelled')
        } catch {
          // Ignore write errors
        }
      }

      return true
    }

    return false
  }

  /**
   * Install dependencies in workspace
   */
  async installDependencies(workspacePath: string, packageManager: 'bun' | 'npm' | 'yarn' = 'bun'): Promise<ExecutionResult> {
    const commands = {
      bun: 'bun install',
      npm: 'npm install',
      yarn: 'yarn install'
    }

    return this.executeCommand(commands[packageManager], workspacePath, {
      timeout: 120000 // 2 minutes for dependency installation
    })
  }

  /**
   * Run tests in workspace
   */
  async runTests(
    workspacePath: string,
    options: {
      testCommand?: string
      testFiles?: string[]
      coverage?: boolean
      timeout?: number
    } = {}
  ): Promise<ExecutionResult> {
    const testCommand = options.testCommand || 'bun test'
    const timeout = options.timeout || 60000

    let command = testCommand

    if (options.testFiles && options.testFiles.length > 0) {
      command += ` ${options.testFiles.join(' ')}`
    }

    if (options.coverage) {
      // Add coverage flags based on test runner
      if (testCommand.includes('bun')) {
        command += ' --coverage'
      } else if (testCommand.includes('jest')) {
        command += ' --coverage'
      } else if (testCommand.includes('vitest')) {
        command += ' --coverage'
      }
    }

    return this.executeCommand(command, workspacePath, { timeout })
  }

  /**
   * Copy files between workspaces or from project
   */
  async copyFiles(source: string, target: string, files: string[]): Promise<void> {
    for (const file of files) {
      const sourcePath = path.resolve(source, file)
      const targetPath = path.resolve(target, file)

      if (fs.existsSync(sourcePath)) {
        // Ensure target directory exists
        const targetDir = path.dirname(targetPath)
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true })
        }

        // Copy file
        fs.copyFileSync(sourcePath, targetPath)
      }
    }
  }

  /**
   * Watch for file changes in workspace
   */
  watchWorkspace(
    workspacePath: string,
    callback: (eventType: string, filename: string) => void
  ): () => void {
    const watcher = fs.watch(workspacePath, { recursive: true }, callback)

    return () => {
      watcher.close()
    }
  }

  /**
   * Get workspace information
   */
  getWorkspaceInfo(workspacePath: string): {
    size: number
    fileCount: number
    lastModified: Date
  } {
    if (!fs.existsSync(workspacePath)) {
      return { size: 0, fileCount: 0, lastModified: new Date(0) }
    }

    const getDirectoryInfo = (dirPath: string) => {
      let totalSize = 0
      let fileCount = 0
      let lastModified = new Date(0)

      const entries = fs.readdirSync(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)

        if (entry.isDirectory()) {
          const subInfo = getDirectoryInfo(fullPath)
          totalSize += subInfo.size
          fileCount += subInfo.fileCount
          if (subInfo.lastModified > lastModified) {
            lastModified = subInfo.lastModified
          }
        } else {
          const stats = fs.statSync(fullPath)
          totalSize += stats.size
          fileCount += 1
          if (stats.mtime > lastModified) {
            lastModified = stats.mtime
          }
        }
      }

      return { size: totalSize, fileCount, lastModified }
    }

    return getDirectoryInfo(workspacePath)
  }

  /**
   * Clean up workspace
   */
  async cleanupWorkspace(taskId: string): Promise<boolean> {
    const workspacePath = this.activeWorkspaces.get(taskId)
    if (!workspacePath) {
      return false
    }

    try {
      // Cancel any running processes
      await this.cancelTask(taskId)

      // Remove workspace directory
      if (fs.existsSync(workspacePath)) {
        fs.rmSync(workspacePath, { recursive: true, force: true })
      }

      this.activeWorkspaces.delete(taskId)
      return true
    } catch (error) {
      console.error(`Failed to cleanup workspace for ${taskId}:`, error)
      return false
    }
  }

  /**
   * Clean up all workspaces
   */
  async cleanupAllWorkspaces(): Promise<void> {
    const taskIds = Array.from(this.activeWorkspaces.keys())

    await Promise.all(
      taskIds.map(taskId => this.cleanupWorkspace(taskId))
    )

    // Clean up any remaining processes
    for (const [taskId, controller] of this.runningProcesses) {
      controller.abort()
      this.runningProcesses.delete(taskId)
    }
  }

  /**
   * Get list of active workspaces
   */
  getActiveWorkspaces(): Array<{ taskId: string; path: string; status: string }> {
    return Array.from(this.activeWorkspaces.entries()).map(([taskId, path]) => ({
      taskId,
      path,
      status: this.getTaskStatus(taskId)
    }))
  }
}