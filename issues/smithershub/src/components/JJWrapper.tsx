/**
 * JJWrapper React component
 * Provides UI for JJ snapshot management and integrates with useJJSnapshots hook
 * Follows project patterns: no useState, uses hooks for state management
 */

import React from 'react'
import { useJJSnapshots } from '../hooks/useJJSnapshots'
import { useMount } from '../reconciler/hooks'
import type { ExecFunction } from '../vcs/repoVerifier'
import type { JJSnapshot } from '../vcs/jjClient'

export interface JJWrapperProps {
  exec: ExecFunction
  children?: React.ReactNode
  autoLoadSnapshots?: boolean
  maxSnapshots?: number
}

/**
 * Snapshot item component for displaying individual snapshots
 */
const SnapshotItem: React.FC<{
  snapshot: JJSnapshot
  onRestore: (id: string) => void
  disabled: boolean
}> = ({ snapshot, onRestore, disabled }) => {
  const isAutoSnapshot = snapshot.isAutoSnapshot
  const truncatedMessage = snapshot.message.length > 80
    ? `${snapshot.message.substring(0, 80)}...`
    : snapshot.message

  return (
    <div className={`snapshot-item ${isAutoSnapshot ? 'auto-snapshot' : 'manual-snapshot'}`}>
      <div className="snapshot-info">
        <span className="snapshot-id">{snapshot.id}</span>
        <span className="snapshot-message" title={snapshot.message}>
          {truncatedMessage}
        </span>
      </div>
      <button
        onClick={() => onRestore(snapshot.id)}
        disabled={disabled}
        className="restore-button"
        aria-label={`Restore snapshot ${snapshot.id}`}
      >
        Restore
      </button>
    </div>
  )
}

/**
 * Confirmation dialog for destructive operations
 */
const ConfirmDialog: React.FC<{
  isOpen: boolean
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
}> = ({ isOpen, title, message, onConfirm, onCancel }) => {
  if (!isOpen) return null

  return (
    <div className="confirm-dialog-overlay">
      <div className="confirm-dialog">
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="confirm-actions">
          <button onClick={onConfirm} className="confirm-button">
            Confirm
          </button>
          <button onClick={onCancel} className="cancel-button">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Main JJWrapper component
 */
export const JJWrapper: React.FC<JJWrapperProps> = ({
  exec,
  children,
  autoLoadSnapshots = true,
  maxSnapshots = 20
}) => {
  const jjHook = useJJSnapshots(exec)
  const [confirmDialog, setConfirmDialog] = React.useState<{
    isOpen: boolean
    title: string
    message: string
    action: () => void
  }>({
    isOpen: false,
    title: '',
    message: '',
    action: () => {}
  })

  // Auto-load snapshots on mount
  useMount(() => {
    if (autoLoadSnapshots) {
      jjHook.loadSnapshots(maxSnapshots)
    }
  })

  const showConfirmDialog = (title: string, message: string, action: () => void) => {
    setConfirmDialog({
      isOpen: true,
      title,
      message,
      action
    })
  }

  const hideConfirmDialog = () => {
    setConfirmDialog(prev => ({ ...prev, isOpen: false }))
  }

  const handleCreateSnapshot = async () => {
    const timestamp = new Date().toISOString()
    await jjHook.createSnapshot(`Manual snapshot at ${timestamp}`)
  }

  const handleRestoreSnapshot = (snapshotId: string) => {
    showConfirmDialog(
      'Restore Snapshot',
      `Are you sure you want to restore to snapshot ${snapshotId}? This will change your working directory.`,
      async () => {
        hideConfirmDialog()
        await jjHook.restoreSnapshot(snapshotId)
      }
    )
  }

  const handleUndoLast = () => {
    showConfirmDialog(
      'Undo Last Snapshot',
      'Are you sure you want to undo the last snapshot operation? This cannot be easily reverted.',
      async () => {
        hideConfirmDialog()
        await jjHook.undoLastSnapshot()
      }
    )
  }

  const handleToggleAutoSnapshot = () => {
    jjHook.setAutoSnapshotEnabled(!jjHook.autoSnapshotEnabled)
  }

  const handleRefreshSnapshots = async () => {
    await jjHook.loadSnapshots(maxSnapshots)
  }

  const isOperationRunning = jjHook.status === 'running'
  const hasError = jjHook.status === 'error'

  return (
    <div className="jj-wrapper">
      {/* Main content area */}
      <div className="jj-content">
        {children}
      </div>

      {/* JJ Controls Panel */}
      <div className="jj-controls">
        <div className="jj-header">
          <h2>JJ Snapshots</h2>
          <div className="jj-status">
            {isOperationRunning && (
              <span className="status-running">
                {jjHook.status === 'running' ? 'Creating snapshot...' : 'Operation in progress...'}
              </span>
            )}
            {hasError && (
              <span className="status-error error" title={jjHook.error || 'Unknown error'}>
                {jjHook.error}
              </span>
            )}
            {jjHook.status === 'idle' && jjHook.lastSnapshot && (
              <span className="status-success">
                Snapshot created successfully
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="jj-actions">
          <button
            onClick={handleCreateSnapshot}
            disabled={isOperationRunning}
            className="primary-button"
          >
            Create Snapshot
          </button>

          <button
            onClick={handleToggleAutoSnapshot}
            className={`toggle-button ${jjHook.autoSnapshotEnabled ? 'enabled' : 'disabled'}`}
          >
            Auto-snapshot: {jjHook.autoSnapshotEnabled ? 'Enabled' : 'Disabled'}
          </button>

          <button
            onClick={handleRefreshSnapshots}
            disabled={isOperationRunning}
            className="secondary-button"
          >
            Refresh
          </button>

          <button
            onClick={handleUndoLast}
            disabled={isOperationRunning || jjHook.snapshots.length === 0}
            className="danger-button"
          >
            Undo Last
          </button>
        </div>

        {/* Snapshots list */}
        <div className="jj-snapshots">
          <h3>Recent Snapshots ({jjHook.snapshots.length})</h3>

          {jjHook.snapshots.length === 0 ? (
            <div className="no-snapshots">
              No snapshots found. Create your first snapshot above.
            </div>
          ) : (
            <div className="snapshots-list">
              {jjHook.snapshots.map(snapshot => (
                <SnapshotItem
                  key={snapshot.id}
                  snapshot={snapshot}
                  onRestore={handleRestoreSnapshot}
                  disabled={isOperationRunning}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.action}
        onCancel={hideConfirmDialog}
      />

      {/* Basic styling */}
      <style jsx>{`
        .jj-wrapper {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          max-width: 1200px;
          margin: 0 auto;
          padding: 1rem;
        }

        .jj-content {
          flex: 1;
        }

        .jj-controls {
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 1rem;
          background: #f9f9f9;
        }

        .jj-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .jj-header h2 {
          margin: 0;
          color: #333;
        }

        .jj-status {
          font-size: 0.9rem;
        }

        .status-running {
          color: #666;
          font-style: italic;
        }

        .status-error {
          color: #dc3545;
          font-weight: bold;
        }

        .status-success {
          color: #28a745;
        }

        .jj-actions {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1rem;
          flex-wrap: wrap;
        }

        .primary-button, .secondary-button, .danger-button, .toggle-button {
          padding: 0.5rem 1rem;
          border: 1px solid #ccc;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.9rem;
        }

        .primary-button {
          background: #007bff;
          color: white;
          border-color: #007bff;
        }

        .secondary-button {
          background: #6c757d;
          color: white;
          border-color: #6c757d;
        }

        .danger-button {
          background: #dc3545;
          color: white;
          border-color: #dc3545;
        }

        .toggle-button.enabled {
          background: #28a745;
          color: white;
          border-color: #28a745;
        }

        .toggle-button.disabled {
          background: #ffc107;
          color: black;
          border-color: #ffc107;
        }

        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .jj-snapshots h3 {
          margin: 0 0 0.5rem 0;
          color: #333;
        }

        .no-snapshots {
          color: #666;
          font-style: italic;
          padding: 1rem;
          text-align: center;
          border: 1px dashed #ccc;
          border-radius: 4px;
        }

        .snapshots-list {
          max-height: 400px;
          overflow-y: auto;
          border: 1px solid #ddd;
          border-radius: 4px;
        }

        .snapshot-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem;
          border-bottom: 1px solid #eee;
        }

        .snapshot-item:last-child {
          border-bottom: none;
        }

        .snapshot-item.auto-snapshot {
          background: #f8f9fa;
        }

        .snapshot-info {
          display: flex;
          flex-direction: column;
          flex: 1;
          gap: 0.25rem;
        }

        .snapshot-id {
          font-family: monospace;
          font-weight: bold;
          color: #495057;
        }

        .snapshot-message {
          color: #666;
          font-size: 0.9rem;
        }

        .restore-button {
          padding: 0.25rem 0.5rem;
          background: #17a2b8;
          color: white;
          border: 1px solid #17a2b8;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.8rem;
        }

        .confirm-dialog-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
        }

        .confirm-dialog {
          background: white;
          padding: 1.5rem;
          border-radius: 8px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          max-width: 400px;
          width: 90%;
        }

        .confirm-dialog h3 {
          margin: 0 0 1rem 0;
          color: #333;
        }

        .confirm-dialog p {
          margin: 0 0 1.5rem 0;
          color: #666;
        }

        .confirm-actions {
          display: flex;
          gap: 0.5rem;
          justify-content: flex-end;
        }

        .confirm-button {
          padding: 0.5rem 1rem;
          background: #dc3545;
          color: white;
          border: 1px solid #dc3545;
          border-radius: 4px;
          cursor: pointer;
        }

        .cancel-button {
          padding: 0.5rem 1rem;
          background: #6c757d;
          color: white;
          border: 1px solid #6c757d;
          border-radius: 4px;
          cursor: pointer;
        }

        .error {
          background: #f8d7da;
          border: 1px solid #f5c6cb;
          border-radius: 4px;
          padding: 0.5rem;
          margin: 0.5rem 0;
        }
      `}</style>
    </div>
  )
}