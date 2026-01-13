import { createRenderer } from 'solid-js/universal'

/**
 * Execution state attached to a SmithersNode during the Ralph Wiggum loop.
 * Tracks the node's progress through pending -> running -> complete/error.
 */
export interface ExecutionState {
  status: 'pending' | 'running' | 'complete' | 'error'
  result?: unknown
  error?: Error
  /** Hash of node content for change detection during re-renders */
  contentHash?: string
}

/**
 * Internal node representation for the Smithers renderer.
 *
 * This is the core data structure that both React and Solid renderers
 * produce. The Ralph Wiggum execution loop operates on trees of these nodes.
 *
 * @example
 * ```typescript
 * const node: SmithersNode = {
 *   type: 'claude',
 *   props: { model: 'claude-3-opus', maxTurns: 10 },
 *   children: [
 *     { type: 'TEXT', props: { value: 'Hello world' }, children: [], parent: null }
 *   ],
 *   parent: null,
 *   _execution: { status: 'pending' }
 * }
 * ```
 */
export interface SmithersNode {
  /** Node type: 'claude', 'phase', 'step', 'TEXT', etc. */
  type: string
  /** Props passed to the component */
  props: Record<string, unknown>
  /** Child nodes */
  children: SmithersNode[]
  /** Reference to parent node (null for root) */
  parent: SmithersNode | null
  /** Runtime execution state (populated during Ralph Wiggum loop) */
  _execution?: ExecutionState
}

/**
 * Creates a Solid universal renderer that builds SmithersNode trees.
 *
 * This renderer implements the same tree structure as the React reconciler
 * in `@evmts/smithers`, allowing Solid components to be used for authoring
 * AI agent prompts with JSX.
 *
 * The renderer supports all standard tree operations:
 * - Element creation (createElement, createTextNode)
 * - Tree manipulation (insertNode, removeNode)
 * - Property updates (setProperty, replaceText)
 * - Tree traversal (getParentNode, getFirstChild, getNextSibling)
 *
 * @returns The Solid renderer with render, effect, memo, and createComponent utilities
 *
 * @example
 * ```typescript
 * import { createSmithersSolidRenderer } from '@evmts/smithers-solid'
 *
 * const { render } = createSmithersSolidRenderer()
 *
 * const root: SmithersNode = {
 *   type: 'root',
 *   props: {},
 *   children: [],
 *   parent: null,
 * }
 *
 * render(() => <Claude>Hello world</Claude>, root)
 * ```
 */
export function createSmithersSolidRenderer() {
  return createRenderer<SmithersNode>({
    /**
     * Creates a new element node of the given type.
     *
     * Called when Solid encounters a JSX element like `<Claude>` or `<Phase>`.
     * The props are set separately via setProperty calls.
     *
     * @param type - The element type (e.g., 'claude', 'phase', 'step')
     * @returns A new SmithersNode with empty props and children
     */
    createElement(type: string): SmithersNode {
      return {
        type,
        props: {},
        children: [],
        parent: null,
      }
    },

    /**
     * Creates a text node for string content.
     *
     * Called when Solid encounters a text child in JSX.
     * Text nodes have type 'TEXT' with the text stored in props.value.
     *
     * @param text - The text content
     * @returns A SmithersNode of type 'TEXT' with the text as props.value
     */
    createTextNode(text: string): SmithersNode {
      return {
        type: 'TEXT',
        props: { value: text },
        children: [],
        parent: null,
      }
    },

    /**
     * Updates the text content of a text node.
     *
     * Called when Solid detects a change to text content.
     *
     * @param node - The text node to update (must have type 'TEXT')
     * @param text - The new text content
     */
    replaceText(node: SmithersNode, text: string): void {
      node.props.value = text
    },

    /**
     * Sets a property on a node.
     *
     * Called for each prop on a JSX element. The 'children' prop is
     * handled separately by insertNode, so it's skipped here.
     *
     * @param node - The node to update
     * @param name - The property name
     * @param value - The property value
     */
    setProperty(node: SmithersNode, name: string, value: unknown): void {
      // Children are handled by insertNode, not as a prop
      if (name !== 'children') {
        node.props[name] = value
      }
    },

    /**
     * Inserts a node into the tree.
     *
     * Called when Solid needs to add a child to a parent. If an anchor
     * is provided, the node is inserted before it; otherwise it's appended.
     *
     * This handles both initial mounting and subsequent updates.
     *
     * @param parent - The parent node to insert into
     * @param node - The node to insert
     * @param anchor - Optional node to insert before (for ordering)
     */
    insertNode(parent: SmithersNode, node: SmithersNode, anchor?: SmithersNode): void {
      node.parent = parent
      if (anchor) {
        const idx = parent.children.indexOf(anchor)
        if (idx !== -1) {
          parent.children.splice(idx, 0, node)
          return
        }
      }
      parent.children.push(node)
    },

    /**
     * Removes a node from its parent.
     *
     * Called when Solid needs to unmount a component or remove an element.
     * Clears the parent reference and removes from parent's children array.
     *
     * @param parent - The parent node to remove from
     * @param node - The node to remove
     */
    removeNode(parent: SmithersNode, node: SmithersNode): void {
      const idx = parent.children.indexOf(node)
      if (idx >= 0) {
        parent.children.splice(idx, 1)
      }
      node.parent = null
    },

    /**
     * Checks if a node is a text node.
     *
     * Used by Solid to determine how to handle node updates.
     * Text nodes require different update logic (replaceText vs setProperty).
     *
     * @param node - The node to check
     * @returns True if the node is a text node (type === 'TEXT')
     */
    isTextNode(node: SmithersNode): boolean {
      return node.type === 'TEXT'
    },

    /**
     * Gets the parent of a node.
     *
     * Used by Solid for tree traversal during reconciliation.
     *
     * @param node - The node to get the parent of
     * @returns The parent node, or undefined if this is a root
     */
    getParentNode(node: SmithersNode): SmithersNode | undefined {
      return node.parent ?? undefined
    },

    /**
     * Gets the first child of a node.
     *
     * Used by Solid for tree traversal during reconciliation.
     *
     * @param node - The node to get the first child of
     * @returns The first child node, or undefined if no children
     */
    getFirstChild(node: SmithersNode): SmithersNode | undefined {
      return node.children[0]
    },

    /**
     * Gets the next sibling of a node.
     *
     * Used by Solid for tree traversal during reconciliation.
     * Finds this node's position in its parent's children array
     * and returns the next element.
     *
     * @param node - The node to get the next sibling of
     * @returns The next sibling node, or undefined if last child or no parent
     */
    getNextSibling(node: SmithersNode): SmithersNode | undefined {
      if (!node.parent) return undefined
      const idx = node.parent.children.indexOf(node)
      if (idx === -1) return undefined
      return node.parent.children[idx + 1]
    },
  })
}

/**
 * Pre-instantiated renderer for convenience.
 *
 * Most applications can use this singleton instead of calling
 * createSmithersSolidRenderer() directly.
 */
export const smithersRenderer = createSmithersSolidRenderer()

/**
 * Render function from the default renderer.
 *
 * Renders a Solid component tree into a SmithersNode root.
 *
 * @example
 * ```typescript
 * import { render, SmithersNode } from '@evmts/smithers-solid'
 *
 * const root: SmithersNode = {
 *   type: 'root',
 *   props: {},
 *   children: [],
 *   parent: null,
 * }
 *
 * render(() => <Claude>Hello</Claude>, root)
 * console.log(root.children) // SmithersNode[]
 * ```
 */
export const { render, effect, memo, createComponent } = smithersRenderer
