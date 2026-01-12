import { Component } from 'solid-js'

interface ConnectionStatusProps {
  isConnected: boolean
}

export const ConnectionStatus: Component<ConnectionStatusProps> = (props) => {
  return (
    <div class="connection-status">
      <div class={`status-indicator ${props.isConnected ? 'connected' : 'disconnected'}`} />
      <span class="status-text">
        {props.isConnected ? 'Connected to CLI' : 'Waiting for CLI connection...'}
      </span>

      <style>{`
        .connection-status {
          position: fixed;
          bottom: 12px;
          right: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          background: #16162a;
          border: 1px solid #333;
          border-radius: 6px;
          font-size: 12px;
        }

        .status-indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .status-indicator.connected {
          background: #27ae60;
          box-shadow: 0 0 6px #27ae6088;
        }

        .status-indicator.disconnected {
          background: #666;
        }

        .status-text {
          color: #888;
        }
      `}</style>
    </div>
  )
}
