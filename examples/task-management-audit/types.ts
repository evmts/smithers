/**
 * Type definitions for Task Management Audit
 */

export interface WorktreeInfo {
  name: string
  branch: string
  merged: boolean
}

export interface IssueInfo {
  name: string
  hasWorktree: boolean
  implemented: boolean
}

export interface TodoItem {
  id: string
  category: string
  description: string
  implemented: boolean
}

export interface RootMdFile {
  path: string
  hasContent: boolean
}

export interface AuditState {
  worktrees: WorktreeInfo[]
  issues: IssueInfo[]
  todoItems: TodoItem[]
  rootMdFiles: RootMdFile[]
  scanned: boolean
}
