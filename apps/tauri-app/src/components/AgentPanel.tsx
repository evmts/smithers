import { Component, Show, createMemo } from 'solid-js'
import { useExecutionStore, type Session } from '../stores/execution'

interface AgentPanelProps {
  nodePath: string
  session: Session | null
}

export const AgentPanel: Component<AgentPanelProps> = (props) => {
  const store = useExecutionStore()

  const nodeOutput = createMemo(() => {
    if (!props.session) return null
    return store.getNodeOutput(props.session.id, props.nodePath)
  })

  const tree = createMemo(() => store.tree())

  const nodeInfo = createMemo(() => {
    const t = tree()
    if (!t) return null
    return findNodeByPath(t, props.nodePath)
  })

  const statusColor = createMemo(() => {
    const output = nodeOutput()
    if (!output) return '#666'
    switch (output.status) {
      case 'running': return '#3498db'
      case 'complete': return '#27ae60'
      case 'error': return '#e74c3c'
      default: return '#666'
    }
  })

  return (
    <div class="agent-panel">
      <div class="panel-header">
        <div class="node-path">{props.nodePath}</div>
        <Show when={nodeOutput()}>
          {(output) => (
            <span
              class="status-badge"
              style={{ background: statusColor() }}
            >
              {output().status}
            </span>
          )}
        </Show>
      </div>

      <Show when={nodeInfo()}>
        {(info) => (
          <div class="section">
            <h3>Node Info</h3>
            <div class="info-grid">
              <div class="info-label">Type</div>
              <div class="info-value">{info().type}</div>
              <Show when={info().props.name}>
                <div class="info-label">Name</div>
                <div class="info-value">{info().props.name as string}</div>
              </Show>
              <Show when={info().executionStatus}>
                <div class="info-label">Status</div>
                <div class="info-value">{info().executionStatus}</div>
              </Show>
            </div>
          </div>
        )}
      </Show>

      <Show when={nodeInfo()?.props.children}>
        {(children) => (
          <div class="section">
            <h3>Prompt</h3>
            <div class="prompt-content">
              {String(children())}
            </div>
          </div>
        )}
      </Show>

      <Show when={nodeOutput()}>
        {(output) => (
          <div class="section">
            <h3>Output</h3>
            <div class="output-content">
              {output().output || 'No output yet...'}
            </div>
            <Show when={output().error}>
              <div class="error-content">
                <strong>Error:</strong> {output().error}
              </div>
            </Show>
          </div>
        )}
      </Show>

      <style>{`
        .agent-panel {
          padding: 16px;
        }

        .panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
          padding-bottom: 12px;
          border-bottom: 1px solid #333;
        }

        .node-path {
          font-family: monospace;
          font-size: 13px;
          color: #888;
        }

        .status-badge {
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 4px;
          text-transform: uppercase;
          font-weight: 500;
        }

        .section {
          margin-bottom: 20px;
        }

        .section h3 {
          font-size: 12px;
          text-transform: uppercase;
          color: #666;
          margin-bottom: 8px;
          letter-spacing: 0.5px;
        }

        .info-grid {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 4px 12px;
          font-size: 13px;
        }

        .info-label {
          color: #666;
        }

        .info-value {
          color: #ddd;
          font-family: monospace;
        }

        .prompt-content,
        .output-content {
          background: #16162a;
          border-radius: 6px;
          padding: 12px;
          font-family: monospace;
          font-size: 13px;
          line-height: 1.5;
          white-space: pre-wrap;
          word-wrap: break-word;
          max-height: 300px;
          overflow: auto;
        }

        .prompt-content {
          color: #a8b2c0;
        }

        .output-content {
          color: #27ae60;
        }

        .error-content {
          background: #e74c3c22;
          border: 1px solid #e74c3c44;
          border-radius: 6px;
          padding: 12px;
          margin-top: 12px;
          font-size: 13px;
          color: #e74c3c;
        }
      `}</style>
    </div>
  )
}

// Helper function to find a node by path
function findNodeByPath(
  node: { path: string; children: any[] },
  targetPath: string
): any | null {
  if (node.path === targetPath) return node
  for (const child of node.children) {
    const found = findNodeByPath(child, targetPath)
    if (found) return found
  }
  return null
}
