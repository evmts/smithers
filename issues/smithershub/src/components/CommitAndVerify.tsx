/**
 * CommitAndVerify - React component wrapper for commit operations with post-commit verification
 * Runs `jj status` after commit and fails loudly if working copy has changes
 */

import React, { useRef } from 'react'
import { useJJ, type JJHook } from '../hooks/useJJ'
import { type ExecFunction } from '../vcs/repoVerifier'

export interface CommitAndVerifyProps {
  /** Function to execute shell commands (injected for testability) */
  exec: ExecFunction
  /** Called when commit operation starts */
  onCommitStart?: () => void
  /** Called when commit operation completes (before verification) */
  onCommitComplete?: () => void
  /** Called when verification passes */
  onVerificationSuccess?: () => void
  /** Called when verification fails */
  onVerificationFailure?: (error: string, changes?: string[]) => void
  /** Called for any errors during the process */
  onError?: (error: string) => void
  /** Children render prop - provides commit function and state */
  children: (params: {
    commit: (message: string) => Promise<void>
    isCommitting: boolean
    isVerifying: boolean
    lastVerification: JJHook['lastResult']
    error: string | null
  }) => React.ReactNode
}

/**
 * Wrapper component that handles commit + post-commit verification workflow
 * Uses render prop pattern for maximum flexibility in UI presentation
 */
export function CommitAndVerify({
  exec,
  onCommitStart,
  onCommitComplete,
  onVerificationSuccess,
  onVerificationFailure,
  onError,
  children
}: CommitAndVerifyProps): React.ReactElement {
  const jjHook = useJJ(exec)
  const isCommittingRef = useRef(false)

  const commit = async (message: string): Promise<void> => {
    if (isCommittingRef.current || jjHook.status === 'running') {
      throw new Error('Commit operation already in progress')
    }

    if (!message.trim()) {
      throw new Error('Commit message is required')
    }

    try {
      isCommittingRef.current = true
      onCommitStart?.()

      // Execute the commit command
      await exec(`jj commit -m "${message.replace(/"/g, '\\"')}"`)

      onCommitComplete?.()

      // Perform post-commit verification
      const verificationResult = await jjHook.verifyPostCommit()

      if (verificationResult.verified) {
        onVerificationSuccess?.()
      } else {
        onVerificationFailure?.(verificationResult.message, verificationResult.changes)
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      onError?.(errorMessage)
      throw error
    } finally {
      isCommittingRef.current = false
    }
  }

  return (
    <>
      {children({
        commit,
        isCommitting: isCommittingRef.current,
        isVerifying: jjHook.status === 'running',
        lastVerification: jjHook.lastResult,
        error: jjHook.error
      })}
    </>
  )
}

/**
 * Simple example usage component showing basic commit UI
 * Demonstrates the brutalist terminal aesthetic from project guidelines
 */
export function BasicCommitUI({ exec }: { exec: ExecFunction }): React.ReactElement {
  const messageRef = useRef<HTMLInputElement>(null)

  return (
    <CommitAndVerify
      exec={exec}
      onCommitStart={() => console.log('Starting commit...')}
      onCommitComplete={() => console.log('Commit complete, verifying...')}
      onVerificationSuccess={() => console.log('✅ Verification passed')}
      onVerificationFailure={(error) => console.error('❌ Verification failed:', error)}
      onError={(error) => console.error('🚨 Error:', error)}
    >
      {({ commit, isCommitting, isVerifying, lastVerification, error }) => (
        <div style={{
          fontFamily: 'monospace',
          backgroundColor: '#000',
          color: '#fff',
          padding: '1rem',
          border: '1px solid #fff'
        }}>
          <h3>Commit with Verification</h3>

          <div style={{ marginBottom: '1rem' }}>
            <input
              ref={messageRef}
              type="text"
              placeholder="Commit message..."
              disabled={isCommitting || isVerifying}
              style={{
                fontFamily: 'monospace',
                backgroundColor: '#000',
                color: '#fff',
                border: '1px solid #fff',
                padding: '0.25rem 0.5rem',
                width: '100%',
                marginBottom: '0.5rem'
              }}
            />

            <button
              onClick={async () => {
                if (messageRef.current?.value) {
                  try {
                    await commit(messageRef.current.value)
                    messageRef.current.value = ''
                  } catch (err) {
                    // Error handled by onError callback
                  }
                }
              }}
              disabled={isCommitting || isVerifying}
              style={{
                fontFamily: 'monospace',
                backgroundColor: '#000',
                color: '#fff',
                border: '1px solid #fff',
                padding: '0.25rem 0.5rem',
                cursor: isCommitting || isVerifying ? 'not-allowed' : 'pointer'
              }}
            >
              {isCommitting ? 'Committing...' : isVerifying ? 'Verifying...' : 'Commit'}
            </button>
          </div>

          {/* Status display */}
          {lastVerification && (
            <div style={{
              marginTop: '1rem',
              padding: '0.5rem',
              border: `1px solid ${lastVerification.verified ? '#0f0' : '#f00'}`,
              color: lastVerification.verified ? '#0f0' : '#f00'
            }}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                {lastVerification.message}
              </pre>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div style={{
              marginTop: '1rem',
              padding: '0.5rem',
              border: '1px solid #f00',
              color: '#f00'
            }}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                {error}
              </pre>
            </div>
          )}
        </div>
      )}
    </CommitAndVerify>
  )
}