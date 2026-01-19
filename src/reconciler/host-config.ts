import Reconciler from 'react-reconciler'
import { DefaultEventPriority } from 'react-reconciler/constants.js'
import type { SmithersNode } from './types.js'
import { rendererMethods } from './methods.js'

// Track current update priority (avoids hardcoded magic numbers)
let currentUpdatePriority: number = DefaultEventPriority

// Re-export rendererMethods for backwards compatibility
export { rendererMethods }

type Props = Record<string, unknown>
type Container = SmithersNode
type Instance = SmithersNode
type TextInstance = SmithersNode
type PublicInstance = SmithersNode
type HostContext = object
type UpdatePayload = Props

function diffProps(oldProps: Props, newProps: Props): UpdatePayload | null {
  const updatePayload: Props = {}
  let hasChanges = false

  for (const key of Object.keys(newProps)) {
    if (key === 'children') continue
    if (oldProps[key] !== newProps[key]) {
      updatePayload[key] = newProps[key]
      hasChanges = true
    }
  }

  for (const key of Object.keys(oldProps)) {
    if (key === 'children') continue
    if (!(key in newProps)) {
      updatePayload[key] = undefined
      hasChanges = true
    }
  }

  return hasChanges ? updatePayload : null
}

/**
 * React Reconciler host configuration for SmithersNode trees.
 * This maps React's reconciliation operations to our SmithersNode structure.
 *
 * Note: Using type assertion because react-reconciler types don't fully match
 * the actual API requirements for React 19.
 */
const hostConfig = {
  // Core configuration
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  isPrimaryRenderer: true,

  // Optional capability flags
  warnsIfNotActing: false,
  supportsResources: false,
  supportsSingletons: false,

  // Timing
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1 as const,

  // Context
  getRootHostContext(): HostContext {
    return {}
  },

  getChildHostContext(parentHostContext: HostContext): HostContext {
    return parentHostContext
  },

  // Instance creation
  createInstance(type: string, props: Props): Instance {
    const node = rendererMethods.createElement(type)

    // Debug: check for weird props that look like spread type string
    const propKeys = Object.keys(props)
    if (propKeys.some(k => /^\d+$/.test(k))) {
      console.error(`[DEBUG] createInstance("${type}") received numeric props:`, props)
      console.trace()
    }

    // Apply all props
    for (const [key, value] of Object.entries(props)) {
      if (key !== 'children') {
        rendererMethods.setProperty(node, key, value)
      }
    }

    return node
  },

  createTextInstance(text: string): TextInstance {
    return rendererMethods.createTextNode(text)
  },

  // Tree manipulation (mutation mode)
  appendChild(parent: Container, child: Instance | TextInstance): void {
    rendererMethods.insertNode(parent, child)
  },

  appendInitialChild(parent: Instance, child: Instance | TextInstance): void {
    rendererMethods.insertNode(parent, child)
  },

  appendChildToContainer(container: Container, child: Instance | TextInstance): void {
    rendererMethods.insertNode(container, child)
  },

  insertBefore(
    parent: Container,
    child: Instance | TextInstance,
    beforeChild: Instance | TextInstance
  ): void {
    rendererMethods.insertNode(parent, child, beforeChild)
  },

  insertInContainerBefore(
    container: Container,
    child: Instance | TextInstance,
    beforeChild: Instance | TextInstance
  ): void {
    rendererMethods.insertNode(container, child, beforeChild)
  },

  removeChild(parent: Container, child: Instance | TextInstance): void {
    rendererMethods.removeNode(parent, child)
  },

  removeChildFromContainer(container: Container, child: Instance | TextInstance): void {
    rendererMethods.removeNode(container, child)
  },

  // Updates
  prepareUpdate(
    _instance: Instance,
    _type: string,
    oldProps: Props,
    newProps: Props
  ): UpdatePayload | null {
    return diffProps(oldProps, newProps)
  },

  commitUpdate(
    instance: Instance,
    updatePayloadOrType: UpdatePayload | string,
    typeOrOldProps: string | Props,
    oldPropsOrNewProps: Props,
    newPropsOrHandle: Props | unknown
  ): void {
    let updatePayload: UpdatePayload | null

    if (typeof updatePayloadOrType === 'string') {
      updatePayload = diffProps(typeOrOldProps as Props, oldPropsOrNewProps as Props)
    } else {
      updatePayload = updatePayloadOrType
    }

    if (!updatePayload) {
      return
    }

    for (const [key, value] of Object.entries(updatePayload)) {
      if (value === undefined) {
        delete instance.props[key]
      } else {
        rendererMethods.setProperty(instance, key, value)
      }
    }
  },

  commitTextUpdate(
    textInstance: TextInstance,
    _oldText: string,
    newText: string
  ): void {
    rendererMethods.replaceText(textInstance, newText)
  },

  // Finalization
  finalizeInitialChildren(): boolean {
    return false
  },

  prepareForCommit(): Record<string, unknown> | null {
    return null
  },

  resetAfterCommit(): void {
    // No-op
  },

  // Required methods
  getPublicInstance(instance: Instance): PublicInstance {
    return instance
  },

  shouldSetTextContent(): boolean {
    return false
  },

  clearContainer(container: Container): void {
    // Detach all children first to avoid stale parent pointers
    for (const child of container.children) {
      child.parent = null
    }
    container.children.length = 0 // Preserve array reference
  },

  // Event handling (not used for Smithers)
  preparePortalMount(): void {
    // No-op
  },

  // Detach/attach (for offscreen trees)
  detachDeletedInstance(): void {
    // No-op
  },

  // Required for newer React versions
  getCurrentEventPriority(): number {
    return currentUpdatePriority
  },

  getInstanceFromNode(): null {
    return null
  },

  beforeActiveInstanceBlur(): void {
    // No-op
  },

  afterActiveInstanceBlur(): void {
    // No-op
  },

  prepareScopeUpdate(): void {
    // No-op
  },

  getInstanceFromScope(): null {
    return null
  },

  setCurrentUpdatePriority(priority: number): void {
    currentUpdatePriority = priority
  },

  getCurrentUpdatePriority(): number {
    return currentUpdatePriority
  },

  resolveUpdatePriority(): number {
    return currentUpdatePriority
  },

  // For microtasks (React 18+)
  supportsMicrotasks: true,
  scheduleMicrotask:
    typeof queueMicrotask === 'function'
      ? queueMicrotask
      : (callback: () => void) => Promise.resolve().then(callback),

  // For hiding/unhiding instances (Suspense boundaries)
  hideInstance(): void {
    // No-op
  },

  hideTextInstance(): void {
    // No-op
  },

  unhideInstance(): void {
    // No-op
  },

  unhideTextInstance(): void {
    // No-op
  },

  // Resources (React 19+)
  NotPendingTransition: null,
  resetFormInstance(): void {
    // No-op
  },
  requestPostPaintCallback(): void {
    // No-op
  },
  shouldAttemptEagerTransition(): boolean {
    return false
  },
  maySuspendCommit(): boolean {
    return false
  },
  preloadInstance(): boolean {
    return true
  },
  startSuspendingCommit(): void {
    // No-op
  },
  suspendInstance(): void {
    // No-op
  },
  waitForCommitToBeReady(): null {
    return null
  },
}

/**
 * Create the React Reconciler instance
 */
export const SmithersReconciler = Reconciler(hostConfig)

// Enable concurrent features
SmithersReconciler.injectIntoDevTools({
  findFiberByHostInstance: () => null,
  bundleType: process.env.NODE_ENV === 'development' ? 1 : 0,
  version: '19.0.0',
  rendererPackageName: 'smithers-react-renderer',
})

export type { SmithersNode }
