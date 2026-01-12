import { Component, For, Show, createSignal, createMemo } from 'solid-js'
import type { SmithersNodeSnapshot } from '@evmts/smithers-protocol'

interface TreeNodeProps {
  node: SmithersNodeSnapshot
  depth: number
  expanded: Set<string>
  selectedPath: string | null
  onToggle: (path: string) => void
  onSelect: (path: string) => void
}

const TreeNode: Component<TreeNodeProps> = (props) => {
  const statusIcon = createMemo(() => {
    switch (props.node.executionStatus) {
      case 'pending': return '[ ]'
      case 'running': return '[~]'
      case 'complete': return '[x]'
      case 'error': return '[!]'
      default: return '   '
    }
  })

  const statusColor = createMemo(() => {
    switch (props.node.executionStatus) {
      case 'running': return '#3498db'
      case 'complete': return '#27ae60'
      case 'error': return '#e74c3c'
      default: return '#666'
    }
  })

  const isSelected = () => props.selectedPath === props.node.path
  const isExpanded = () => props.expanded.has(props.node.path)
  const hasChildren = () => props.node.children.length > 0

  const nodeName = createMemo(() => {
    const name = props.node.props.name as string | undefined
    return name ? `[${name}]` : ''
  })

  return (
    <div class="tree-node">
      <div
        class={`tree-row ${isSelected() ? 'selected' : ''}`}
        style={{ "padding-left": `${props.depth * 16 + 8}px` }}
        onClick={() => props.onSelect(props.node.path)}
      >
        <Show when={hasChildren()}>
          <button
            class="expand-btn"
            onClick={(e) => {
              e.stopPropagation()
              props.onToggle(props.node.path)
            }}
          >
            {isExpanded() ? '▼' : '▶'}
          </button>
        </Show>
        <Show when={!hasChildren()}>
          <span class="expand-placeholder" />
        </Show>

        <span class="status-icon" style={{ color: statusColor() }}>
          {statusIcon()}
        </span>
        <span class="node-type">{props.node.type}</span>
        <Show when={nodeName()}>
          <span class="node-name">{nodeName()}</span>
        </Show>
      </div>

      <Show when={isExpanded()}>
        <For each={props.node.children}>
          {(child) => (
            <TreeNode
              node={child}
              depth={props.depth + 1}
              expanded={props.expanded}
              selectedPath={props.selectedPath}
              onToggle={props.onToggle}
              onSelect={props.onSelect}
            />
          )}
        </For>
      </Show>

      <style>{`
        .tree-node {
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
          font-size: 13px;
        }

        .tree-row {
          display: flex;
          align-items: center;
          padding: 4px 8px;
          cursor: pointer;
          transition: background 0.1s;
        }

        .tree-row:hover {
          background: #2a2a3e;
        }

        .tree-row.selected {
          background: #3498db33;
        }

        .expand-btn {
          width: 16px;
          height: 16px;
          border: none;
          background: transparent;
          color: #666;
          cursor: pointer;
          padding: 0;
          font-size: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .expand-btn:hover {
          color: #fff;
        }

        .expand-placeholder {
          width: 16px;
        }

        .status-icon {
          margin: 0 8px;
          font-size: 11px;
        }

        .node-type {
          color: #ddd;
        }

        .node-name {
          color: #666;
          margin-left: 6px;
        }
      `}</style>
    </div>
  )
}

interface ExecutionTreeProps {
  tree: SmithersNodeSnapshot | null
  selectedPath: string | null
  onSelectNode: (path: string | null) => void
}

export const ExecutionTree: Component<ExecutionTreeProps> = (props) => {
  const [expanded, setExpanded] = createSignal(new Set<string>(['ROOT']))

  const toggleExpanded = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  return (
    <div class="execution-tree">
      <Show
        when={props.tree}
        fallback={
          <div class="no-tree">
            <p>Waiting for execution...</p>
            <p class="hint">Run an agent with the CLI to see the execution tree</p>
          </div>
        }
      >
        {(tree) => (
          <TreeNode
            node={tree()}
            depth={0}
            expanded={expanded()}
            selectedPath={props.selectedPath}
            onToggle={toggleExpanded}
            onSelect={(path) => props.onSelectNode(path)}
          />
        )}
      </Show>

      <style>{`
        .execution-tree {
          padding: 8px;
        }

        .no-tree {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 200px;
          color: #666;
        }

        .no-tree .hint {
          font-size: 12px;
          margin-top: 8px;
          color: #555;
        }
      `}</style>
    </div>
  )
}
