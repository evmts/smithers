import { discoverScripts, type DiscoverOptions } from './discover.js'
import { run, resume, cancel, createWorkflow, type RunOptions, type ResumeOptions, type CreateWorkflowOptions } from './runner.js'
import { status, frames, type FramesOptions } from './status.js'
import { glob as globFn } from './glob.js'
import { grep as grepFn, type GrepMatch } from './grep.js'
import type { ScriptInfo, ExecutionStatus, CreateWorkflowResult, RunResult, Frame } from './types.js'

export interface SmithersControlPlane {
  discoverScripts(opts?: DiscoverOptions): Promise<ScriptInfo[]>
  createWorkflow(opts: { name: string; content: string; overwrite?: boolean }): Promise<CreateWorkflowResult>
  run(opts: { script: string; name?: string }): Promise<RunResult>
  resume(opts?: { executionId?: string }): Promise<RunResult>
  status(executionId: string): Promise<ExecutionStatus>
  frames(executionId: string, opts?: { since?: number; limit?: number; maxChars?: number }): Promise<{ frames: Frame[]; cursor: number }>
  cancel(executionId: string): Promise<void>
  glob(opts: { pattern: string; limit?: number }): Promise<string[]>
  grep(opts: { pattern: string; path?: string; glob?: string; caseSensitive?: boolean }): Promise<GrepMatch[]>
}

export interface ControlPlaneOptions {
  cwd?: string
}

export function createControlPlane(opts: ControlPlaneOptions = {}): SmithersControlPlane {
  const cwd = opts.cwd ?? process.cwd()
  
  return {
    discoverScripts: (discoverOpts?: DiscoverOptions) => 
      discoverScripts({ cwd, ...discoverOpts }),
    
    createWorkflow: (workflowOpts: CreateWorkflowOptions) =>
      createWorkflow({ cwd, ...workflowOpts }),
    
    run: (runOpts: RunOptions) =>
      run({ cwd, ...runOpts }),
    
    resume: (resumeOpts?: ResumeOptions) =>
      resume({ cwd, ...resumeOpts }),
    
    status: (executionId: string) =>
      Promise.resolve(status(executionId, { cwd })),
    
    frames: (executionId: string, frameOpts?: FramesOptions) =>
      Promise.resolve(frames(executionId, { cwd, ...frameOpts })),
    
    cancel: (executionId: string) =>
      cancel({ executionId, cwd }),
    
    glob: (globOpts: { pattern: string; limit?: number }) =>
      globFn({ cwd, ...globOpts }),
    
    grep: (grepOpts: { pattern: string; path?: string; glob?: string; caseSensitive?: boolean }) =>
      grepFn({ cwd, ...grepOpts })
  }
}

export * from './types.js'
export { discoverScripts } from './discover.js'
export { run, resume, cancel, createWorkflow } from './runner.js'
export { status, frames } from './status.js'
export { glob } from './glob.js'
export { grep, type GrepMatch } from './grep.js'
