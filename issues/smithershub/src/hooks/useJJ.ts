/**
 * React hook for JJ version control operations with state management
 * Provides status tracking and post-commit verification capabilities
 */

import { useRef } from 'react'
import { repoVerifier, type ExecFunction, type JJStatusResult, type VerificationResult } from '../vcs/repoVerifier'

export interface JJHookState {
  status: 'idle' | 'running' | 'error'
  error: string | null
  lastResult: VerificationResult | null
}

export interface JJHook extends JJHookState {
  getStatus: () => Promise<JJStatusResult>
  verifyPostCommit: () => Promise<VerificationResult>
}

/**
 * Hook for managing JJ operations with React state
 * Follows project patterns: no useState, use useRef for non-reactive state
 */
export function useJJ(exec: ExecFunction): JJHook {
  // Non-reactive state using useRef as per project guidelines
  const stateRef = useRef<JJHookState>({
    status: 'idle',
    error: null,
    lastResult: null
  })

  // Force re-render trigger (minimal reactive state)
  const forceUpdateRef = useRef(0)
  const forceUpdate = () => {
    forceUpdateRef.current += 1
    // In real implementation, this would trigger a re-render
    // For testing purposes, we'll assume the component re-renders
  }

  const updateState = (updates: Partial<JJHookState>) => {
    Object.assign(stateRef.current, updates)
    forceUpdate()
  }

  const getStatus = async (): Promise<JJStatusResult> => {
    if (stateRef.current.status === 'running') {
      throw new Error('JJ operation already in progress')
    }

    updateState({ status: 'running', error: null })

    try {
      const result = await repoVerifier.verifyCleanWorkingCopy(exec)
      updateState({ status: 'idle' })
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      updateState({ status: 'error', error: errorMessage })
      throw error
    }
  }

  const verifyPostCommit = async (): Promise<VerificationResult> => {
    if (stateRef.current.status === 'running') {
      throw new Error('JJ operation already in progress')
    }

    updateState({ status: 'running', error: null })

    try {
      const result = await repoVerifier.verifyPostCommit(exec)

      updateState({
        status: result.verified ? 'idle' : 'error',
        error: result.verified ? null : result.message,
        lastResult: result
      })

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorResult: VerificationResult = {
        verified: false,
        message: `🚨 VERIFICATION ERROR: ${errorMessage}`
      }

      updateState({
        status: 'error',
        error: errorMessage,
        lastResult: errorResult
      })

      return errorResult
    }
  }

  return {
    get status() { return stateRef.current.status },
    get error() { return stateRef.current.error },
    get lastResult() { return stateRef.current.lastResult },
    getStatus,
    verifyPostCommit
  }
}