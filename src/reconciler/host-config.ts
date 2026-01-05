import type { PluNode } from '../core/types.js'

/**
 * React Reconciler Host Config for PluDom
 *
 * This config tells React how to manage our custom PluNode tree.
 * We use mutation mode (supportsMutation: true) where nodes are modified in place.
 */

export const hostConfig = {
  // ====================
  // Core Configuration
  // ====================

  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,

  // ====================
  // Node Creation
  // ====================

  /**
   * Create an element node (e.g., <claude>, <phase>, <step>)
   */
  createInstance(
    type: string,
    props: Record<string, unknown>,
    rootContainer: PluNode,
    hostContext: unknown,
    internalHandle: unknown
  ): PluNode {
    const node: PluNode = {
      type,
      props: { ...props },
      children: [],
      parent: null,
    }
    return node
  },

  /**
   * Create a text node (for string children)
   */
  createTextInstance(
    text: string,
    rootContainer: PluNode,
    hostContext: unknown,
    internalHandle: unknown
  ): PluNode {
    return {
      type: 'TEXT',
      props: { value: text },
      children: [],
      parent: null,
    }
  },

  // ====================
  // Tree Manipulation (Initial)
  // ====================

  /**
   * Append a child to a parent during initial render
   */
  appendInitialChild(parent: PluNode, child: PluNode): void {
    child.parent = parent
    parent.children.push(child)
  },

  /**
   * Called after instance is created but before children are appended
   */
  finalizeInitialChildren(
    instance: PluNode,
    type: string,
    props: Record<string, unknown>,
    rootContainer: PluNode,
    hostContext: unknown
  ): boolean {
    // Return true if we need commitMount to be called (we don't)
    return false
  },

  // ====================
  // Tree Manipulation (Updates)
  // ====================

  /**
   * Append a child to a parent during updates
   */
  appendChild(parent: PluNode, child: PluNode): void {
    child.parent = parent
    parent.children.push(child)
  },

  /**
   * Insert a child before another child
   */
  insertBefore(parent: PluNode, child: PluNode, beforeChild: PluNode): void {
    child.parent = parent
    const index = parent.children.indexOf(beforeChild)
    if (index !== -1) {
      parent.children.splice(index, 0, child)
    } else {
      parent.children.push(child)
    }
  },

  /**
   * Remove a child from its parent
   */
  removeChild(parent: PluNode, child: PluNode): void {
    const index = parent.children.indexOf(child)
    if (index !== -1) {
      parent.children.splice(index, 1)
      child.parent = null
    }
  },

  /**
   * Remove a child from a container (root level)
   */
  removeChildFromContainer(container: PluNode, child: PluNode): void {
    const index = container.children.indexOf(child)
    if (index !== -1) {
      container.children.splice(index, 1)
      child.parent = null
    }
  },

  // ====================
  // Updates
  // ====================

  /**
   * Prepare an update payload
   * Returns null if no update needed, otherwise returns an update payload
   */
  prepareUpdate(
    instance: PluNode,
    type: string,
    oldProps: Record<string, unknown>,
    newProps: Record<string, unknown>,
    rootContainer: PluNode,
    hostContext: unknown
  ): null | Record<string, unknown> {
    // Simple approach: if props changed, return newProps as the update payload
    if (JSON.stringify(oldProps) !== JSON.stringify(newProps)) {
      return newProps
    }
    return null
  },

  /**
   * Commit the update to the instance
   */
  commitUpdate(
    instance: PluNode,
    updatePayload: Record<string, unknown>,
    type: string,
    prevProps: Record<string, unknown>,
    nextProps: Record<string, unknown>,
    internalHandle: unknown
  ): void {
    instance.props = { ...nextProps }
  },

  /**
   * Update text content
   */
  commitTextUpdate(textInstance: PluNode, oldText: string, newText: string): void {
    textInstance.props.value = newText
  },

  // ====================
  // Lifecycle
  // ====================

  /**
   * Called before commit phase
   */
  prepareForCommit(containerInfo: PluNode): Record<string, unknown> | null {
    return null
  },

  /**
   * Called after commit phase completes
   */
  resetAfterCommit(containerInfo: PluNode): void {
    // Nothing to do
  },

  /**
   * Get the root container info
   */
  getRootHostContext(rootContainer: PluNode): unknown {
    return {}
  },

  /**
   * Get child context from parent
   */
  getChildHostContext(
    parentHostContext: unknown,
    type: string,
    rootContainer: PluNode
  ): unknown {
    return parentHostContext
  },

  // ====================
  // Utilities
  // ====================

  /**
   * Should set text content directly (optimization for text-only children)
   */
  shouldSetTextContent(type: string, props: Record<string, unknown>): boolean {
    return false
  },

  /**
   * Clear container before mounting
   */
  clearContainer(container: PluNode): void {
    container.children = []
  },

  /**
   * Append child to container
   */
  appendChildToContainer(container: PluNode, child: PluNode): void {
    child.parent = container
    container.children.push(child)
  },

  /**
   * Insert in container before child
   */
  insertInContainerBefore(
    container: PluNode,
    child: PluNode,
    beforeChild: PluNode
  ): void {
    child.parent = container
    const index = container.children.indexOf(beforeChild)
    if (index !== -1) {
      container.children.splice(index, 0, child)
    } else {
      container.children.push(child)
    }
  },

  // ====================
  // Scheduling
  // ====================

  /**
   * Get current time (for scheduling)
   */
  now: Date.now,

  /**
   * Request immediate callback
   */
  scheduleTimeout: setTimeout,

  /**
   * Cancel timeout
   */
  cancelTimeout: clearTimeout,

  /**
   * No-op timeout for deferring
   */
  noTimeout: -1,

  /**
   * Whether we're running in a browser
   */
  isPrimaryRenderer: true,

  /**
   * Whether this is a test renderer
   */
  supportsMicrotasks: false,

  /**
   * Schedule microtask (not used)
   */
  scheduleMicrotask:
    typeof queueMicrotask !== 'undefined'
      ? queueMicrotask
      : (callback: () => void) => Promise.resolve().then(callback),

  // ====================
  // Public Instances (for refs)
  // ====================

  getPublicInstance(instance: PluNode): PluNode {
    return instance
  },

  // ====================
  // Prepare Portal Mount
  // ====================

  preparePortalMount(containerInfo: PluNode): void {
    // Not supporting portals yet
  },

  // ====================
  // Unused (but required by type)
  // ====================

  hideInstance(instance: PluNode): void {
    // Not implementing visibility
  },

  unhideInstance(instance: PluNode, props: Record<string, unknown>): void {
    // Not implementing visibility
  },

  hideTextInstance(textInstance: PluNode): void {
    // Not implementing visibility
  },

  unhideTextInstance(textInstance: PluNode, text: string): void {
    // Not implementing visibility
  },

  /**
   * Detach deleted instance
   */
  detachDeletedInstance(node: PluNode): void {
    // Nothing to do
  },

  /**
   * Get current event priority (for scheduling)
   */
  getCurrentEventPriority(): number {
    return 0
  },

  /**
   * Resolve update priority (for scheduling)
   */
  resolveUpdatePriority(): number {
    return 0
  },

  /**
   * Before active instance blur (for focus management)
   */
  beforeActiveInstanceBlur(): void {
    // Nothing to do
  },

  /**
   * After active instance blur (for focus management)
   */
  afterActiveInstanceBlur(): void {
    // Nothing to do
  },

  /**
   * Prepare scope update
   */
  prepareScopeUpdate(scopeInstance: unknown, instance: PluNode): void {
    // Nothing to do
  },

  /**
   * Get instance from scope
   */
  getInstanceFromScope(scopeInstance: unknown): PluNode | null {
    return null
  },

  /**
   * Get instance from node
   */
  getInstanceFromNode(node: unknown): PluNode | null {
    return null
  },

  /**
   * Track scheduler event (required for profiling)
   */
  trackSchedulerEvent(): void {
    // No-op for now
  },

  /**
   * Resolve event type
   */
  resolveEventType(): null {
    return null
  },

  /**
   * Resolve event timestamp
   */
  resolveEventTimeStamp(): number {
    return Date.now()
  },

  /**
   * Set current update priority
   */
  setCurrentUpdatePriority(priority: number): void {
    // No-op
  },

  /**
   * Get current update priority
   */
  getCurrentUpdatePriority(): number {
    return 0
  },

  /**
   * Reset form instance
   */
  resetFormInstance(form: unknown): void {
    // No-op
  },

  /**
   * Request post paint callback
   */
  requestPostPaintCallback(callback: () => void): void {
    // Call immediately since we're not painting
    callback()
  },

  /**
   * Should attempt eager transition
   */
  shouldAttemptEagerTransition(): boolean {
    return false
  },

  /**
   * May suspend commit
   */
  maySuspendCommit(type: string, props: Record<string, unknown>): boolean {
    return false
  },

  /**
   * Preload instance
   */
  preloadInstance(type: string, props: Record<string, unknown>): boolean {
    return true
  },

  /**
   * Start suspending commit
   */
  startSuspendingCommit(): void {
    // No-op
  },

  /**
   * Suspend instance
   */
  suspendInstance(type: string, props: Record<string, unknown>): void {
    // No-op
  },

  /**
   * Wait for commit to be ready
   */
  waitForCommitToBeReady(suspenseInstance: unknown): null {
    return null
  },
}
