import { discoverScripts, type DiscoverOptions } from './discover.js'
import { run, resume, cancel, createWorkflow, type RunOptions, type ResumeOptions, type CreateWorkflowOptions } from './runner.js'
import { status, frames, type FramesOptions } from './status.js'
import type { ScriptInfo, ExecutionStatus, CreateWorkflowResult, RunResult, Frame } from './types.js'

export interface SmithersControlPlane {
  discoverScripts(opts?: DiscoverOptions): Promise<ScriptInfo[]>
  createWorkflow(opts: { name: string; content: string; overwrite?: boolean }): Promise<CreateWorkflowResult>
  run(opts: { script: string; name?: string }): Promise<RunResult>
  resume(opts?: { executionId?: string }): Promise<RunResult>
  status(executionId: string): Promise<ExecutionStatus>
  frames(executionId: string, opts?: { since?: number; limit?: number }): Promise<{ frames: Frame[]; cursor: number }>
  cancel(executionId: string): Promise<void>
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
      cancel({ executionId, cwd })
  }
}

export * from './types.js'
export { discoverScripts } from './discover.js'
export { run, resume, cancel, createWorkflow } from './runner.js'
export { status, frames } from './status.js'
