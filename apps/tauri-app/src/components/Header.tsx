import { Component, Show } from 'solid-js'
import type { Session } from '../stores/execution'

interface HeaderProps {
  session: Session | null
  currentView: 'tree' | 'logs'
  onViewChange: (view: 'tree' | 'logs') => void
}

export const Header: Component<HeaderProps> = (props) => {
  const formatDuration = (startTime: number, endTime?: number) => {
    const end = endTime || Date.now()
    const duration = end - startTime
    if (duration < 1000) return `${duration}ms`
    return `${(duration / 1000).toFixed(1)}s`
  }

  const getStatusColor = (status: Session['status']) => {
    switch (status) {
      case 'running': return '#3498db'
      case 'paused': return '#f39c12'
      case 'completed': return '#27ae60'
      case 'error': return '#e74c3c'
      default: return '#666'
    }
  }

  return (
    <header class="header">
      <div class="header-left">
        <h1 class="logo">Smithers</h1>
        <Show when={props.session}>
          {(session) => (
            <div class="session-info">
              <span class="agent-file">{session().agentFile}</span>
              <span
                class="status-badge"
                style={{ background: getStatusColor(session().status) }}
              >
                {session().status}
              </span>
            </div>
          )}
        </Show>
      </div>

      <div class="header-center">
        <Show when={props.session}>
          {(session) => (
            <div class="progress-info">
              <span class="frame">Frame {session().frame}</span>
              <span class="separator">|</span>
              <span class="duration">{formatDuration(session().startTime, session().endTime)}</span>
            </div>
          )}
        </Show>
      </div>

      <div class="header-right">
        <div class="view-toggle">
          <button
            class={`toggle-btn ${props.currentView === 'tree' ? 'active' : ''}`}
            onClick={() => props.onViewChange('tree')}
          >
            Tree
          </button>
          <button
            class={`toggle-btn ${props.currentView === 'logs' ? 'active' : ''}`}
            onClick={() => props.onViewChange('logs')}
          >
            Logs
          </button>
        </div>
      </div>

      <style>{`
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 20px;
          background: #16162a;
          border-bottom: 1px solid #333;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .logo {
          font-size: 18px;
          font-weight: 600;
          color: #fff;
        }

        .session-info {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .agent-file {
          font-size: 14px;
          color: #888;
          font-family: monospace;
        }

        .status-badge {
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 4px;
          text-transform: uppercase;
          font-weight: 500;
        }

        .header-center {
          display: flex;
          align-items: center;
        }

        .progress-info {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 13px;
          color: #888;
        }

        .separator {
          color: #444;
        }

        .header-right {
          display: flex;
          align-items: center;
        }

        .view-toggle {
          display: flex;
          background: #222;
          border-radius: 6px;
          overflow: hidden;
        }

        .toggle-btn {
          padding: 6px 14px;
          border: none;
          background: transparent;
          color: #888;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .toggle-btn:hover {
          background: #2a2a3e;
        }

        .toggle-btn.active {
          background: #3498db;
          color: white;
        }
      `}</style>
    </header>
  )
}
