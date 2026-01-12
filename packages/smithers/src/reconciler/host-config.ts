import type { SmithersNode } from '../core/types.js'

/**
 * React Reconciler Host Config for PluDom
 *
 * This config tells React how to manage our custom SmithersNode tree.
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
    rootContainer: SmithersNode,
    hostContext: unknown,
    internalHandle: unknown
  ): SmithersNode {
    const node: SmithersNode = {
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
    rootContainer: SmithersNode,
    hostContext: unknown,
    internalHandle: unknown
  ): SmithersNode {
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
  appendInitialChild(parent: SmithersNode, child: SmithersNode): void {
    child.parent = parent
    parent.children.push(child)
  },

  /**
   * Called after instance is created but before children are appended
   */
  finalizeInitialChildren(
    instance: SmithersNode,
    type: string,
    props: Record<string, unknown>,
    rootContainer: SmithersNode,
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
  appendChild(parent: SmithersNode, child: SmithersNode): void {
    child.parent = parent
    parent.children.push(child)
  },

  /**
   * Insert a child before another child
   */
  insertBefore(parent: SmithersNode, child: SmithersNode, beforeChild: SmithersNode): void {
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
  removeChild(parent: SmithersNode, child: SmithersNode): void {
    const index = parent.children.indexOf(child)
    if (index !== -1) {
      parent.children.splice(index, 1)
      child.parent = null
    }
  },

  /**
   * Remove a child from a container (root level)
   */
  removeChildFromContainer(container: SmithersNode, child: SmithersNode): void {
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
    instance: SmithersNode,
    type: string,
    oldProps: Record<string, unknown>,
    newProps: Record<string, unknown>,
    rootContainer: SmithersNode,
    hostContext: unknown
  ): null | Record<string, unknown> {
    const isVerbose = process.env.VERBOSE_RECONCILER === 'true'
    if (isVerbose) {
      console.log(`[HOST_CONFIG] prepareUpdate for type="${type}"`)
      console.log(`[HOST_CONFIG]   instance.type:`, instance.type)
      console.log(`[HOST_CONFIG]   oldProps keys:`, Object.keys(oldProps))
      console.log(`[HOST_CONFIG]   newProps typeof:`, typeof newProps)
      console.log(`[HOST_CONFIG]   newProps keys:`, Object.keys(newProps).slice(0, 10))
      console.log(`[HOST_CONFIG]   newProps.pendingProps:`, (newProps as any).pendingProps)
    }

    // React 19 sometimes passes the fiber object as newProps
    // Check if newProps looks like a fiber and extract pendingProps if so
    let actualNewProps = newProps
    if ((newProps as any).pendingProps !== undefined) {
      actualNewProps = (newProps as any).pendingProps
      if (isVerbose) {
        console.log(`[HOST_CONFIG]   extracted pendingProps keys:`, Object.keys(actualNewProps))
      }
    }

    // Check if any props changed (including functions)
    const oldKeys = Object.keys(oldProps)
    const newKeys = Object.keys(actualNewProps)

    // If key count differs, props changed
    if (oldKeys.length !== newKeys.length) {
      if (isVerbose) {
        console.log(`[HOST_CONFIG]   props changed (different key count)`)
      }
      return actualNewProps
    }

    // Check each prop for changes
    for (const key of newKeys) {
      if (oldProps[key] !== actualNewProps[key]) {
        if (isVerbose) {
          console.log(`[HOST_CONFIG]   props changed (key "${key}" changed)`)
        }
        return actualNewProps
      }
    }

    if (isVerbose) {
      console.log(`[HOST_CONFIG]   no props changed`)
    }
    return null
  },

  /**
   * Commit the update to the instance
   */
  commitUpdate(
    instance: SmithersNode,
    updatePayload: Record<string, unknown>,
    type: string,
    prevProps: Record<string, unknown>,
    nextProps: Record<string, unknown>,
    internalHandle: unknown
  ): void {
    // DEBUG: Log what we're receiving
    const isVerbose = process.env.VERBOSE_RECONCILER === 'true'
    if (isVerbose) {
      console.log(`[HOST_CONFIG] commitUpdate for ${type}`)
      console.log(`[HOST_CONFIG]   updatePayload keys:`, Object.keys(updatePayload))
      console.log(`[HOST_CONFIG]   nextProps keys:`, Object.keys(nextProps).slice(0, 5))
      console.log(`[HOST_CONFIG]   nextProps.pendingProps:`, (nextProps as any).pendingProps)
    }

    // React 19 passes the fiber as nextProps
    // Extract the actual props from fiber.pendingProps
    let actualProps = updatePayload
    if ((nextProps as any).pendingProps !== undefined) {
      actualProps = (nextProps as any).pendingProps
      if (isVerbose) {
        console.log(`[HOST_CONFIG]   using pendingProps, keys:`, Object.keys(actualProps))
      }
    }

    instance.props = { ...actualProps }

    // Don't clear execution status - let the execution loop handle it
    // via content hashing and external state tracking
  },

  /**
   * Update text content
   */
  commitTextUpdate(textInstance: SmithersNode, oldText: string, newText: string): void {
    textInstance.props.value = newText
  },

  // ====================
  // Lifecycle
  // ====================

  /**
   * Called before commit phase
   */
  prepareForCommit(containerInfo: SmithersNode): Record<string, unknown> | null {
    return null
  },

  /**
   * Called after commit phase completes
   */
  resetAfterCommit(containerInfo: SmithersNode): void {
    // Nothing to do
  },

  /**
   * Get the root container info
   */
  getRootHostContext(rootContainer: SmithersNode): unknown {
    return {}
  },

  /**
   * Get child context from parent
   */
  getChildHostContext(
    parentHostContext: unknown,
    type: string,
    rootContainer: SmithersNode
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
  clearContainer(container: SmithersNode): void {
    container.children = []
  },

  /**
   * Append child to container
   */
  appendChildToContainer(container: SmithersNode, child: SmithersNode): void {
    child.parent = container
    container.children.push(child)
  },

  /**
   * Insert in container before child
   */
  insertInContainerBefore(
    container: SmithersNode,
    child: SmithersNode,
    beforeChild: SmithersNode
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

  getPublicInstance(instance: SmithersNode): SmithersNode {
    return instance
  },

  // ====================
  // Prepare Portal Mount
  // ====================

  preparePortalMount(containerInfo: SmithersNode): void {
    // Not supporting portals yet
  },

  // ====================
  // Unused (but required by type)
  // ====================

  hideInstance(instance: SmithersNode): void {
    // Not implementing visibility
  },

  unhideInstance(instance: SmithersNode, props: Record<string, unknown>): void {
    // Not implementing visibility
  },

  hideTextInstance(textInstance: SmithersNode): void {
    // Not implementing visibility
  },

  unhideTextInstance(textInstance: SmithersNode, text: string): void {
    // Not implementing visibility
  },

  /**
   * Detach deleted instance
   */
  detachDeletedInstance(node: SmithersNode): void {
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
  prepareScopeUpdate(scopeInstance: unknown, instance: SmithersNode): void {
    // Nothing to do
  },

  /**
   * Get instance from scope
   */
  getInstanceFromScope(scopeInstance: unknown): SmithersNode | null {
    return null
  },

  /**
   * Get instance from node
   */
  getInstanceFromNode(node: unknown): SmithersNode | null {
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
