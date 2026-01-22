import Reconciler from 'react-reconciler'
import { DefaultEventPriority } from 'react-reconciler/constants.js'
import { createContext } from 'react'
import type { SmithersNode } from './types.js'
import { rendererMethods } from './methods.js'

let currentUpdatePriority: number = DefaultEventPriority

const now = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()

const NotPendingTransition = null
const HostTransitionContext = createContext(NotPendingTransition)

const schedulePostPaint =
  typeof queueMicrotask === 'function'
    ? queueMicrotask
    : (cb: () => void) => Promise.resolve().then(cb)

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
    if (!Object.is(oldProps[key], newProps[key])) {
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

const hostConfig = {
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  isPrimaryRenderer:
    process.env['SMITHERS_PRIMARY_RENDERER'] === 'true' ||
    process.env['SMITHERS_PRIMARY_RENDERER'] === '1',

  warnsIfNotActing: false,
  supportsResources: false,
  supportsSingletons: false,

  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1 as const,

  getRootHostContext(): HostContext {
    return {}
  },

  getChildHostContext(parentHostContext: HostContext): HostContext {
    return parentHostContext
  },

  createInstance(type: string, props: Props): Instance {
    const node = rendererMethods.createElement(type)
    for (const [key, value] of Object.entries(props)) {
      if (key !== 'children') rendererMethods.setProperty(node, key, value)
    }
    return node
  },

  createTextInstance(text: string): TextInstance {
    return rendererMethods.createTextNode(text)
  },

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
    _newPropsOrHandle: Props | unknown
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
        if (key === '__smithersKey' || key === 'key') {
          delete instance.key
        } else {
          delete instance.props[key]
        }
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

  finalizeInitialChildren(): boolean {
    return false
  },

  prepareForCommit(): Record<string, unknown> | null {
    return null
  },

  resetAfterCommit(): void {},

  getPublicInstance(instance: Instance): PublicInstance {
    return instance
  },

  shouldSetTextContent(): boolean {
    return false
  },

  clearContainer(container: Container): void {
    const children = [...container.children]
    for (const child of children) {
      rendererMethods.removeNode(container, child)
    }
    container.children.length = 0
  },

  preparePortalMount(): void {},
  detachDeletedInstance(): void {},

  getCurrentEventPriority(): number {
    return currentUpdatePriority
  },

  getInstanceFromNode(): null { return null },
  beforeActiveInstanceBlur(): void {},
  afterActiveInstanceBlur(): void {},
  prepareScopeUpdate(): void {},
  getInstanceFromScope(): null { return null },

  setCurrentUpdatePriority(priority: number): void {
    currentUpdatePriority = priority
  },

  getCurrentUpdatePriority(): number {
    return currentUpdatePriority
  },

  resolveUpdatePriority(): number { return currentUpdatePriority },

  supportsMicrotasks: true,
  scheduleMicrotask:
    typeof queueMicrotask === 'function'
      ? queueMicrotask
      : (callback: () => void) => Promise.resolve().then(callback),

  hideInstance(): void {},
  hideTextInstance(): void {},
  unhideInstance(): void {},
  unhideTextInstance(): void {},

  NotPendingTransition,
  HostTransitionContext,
  resetFormInstance(): void {},
  requestPostPaintCallback(callback: (time: number) => void): void {
    schedulePostPaint(() => callback(now()))
  },
  trackSchedulerEvent(): void {},
  resolveEventType(): null | string { return null },
  resolveEventTimeStamp(): number { return now() },
  shouldAttemptEagerTransition(): boolean { return false },
  maySuspendCommit(): boolean { return false },
  preloadInstance(): boolean { return true },
  startSuspendingCommit(): void {},
  suspendInstance(): void {},
  waitForCommitToBeReady(): null { return null },
}

export const SmithersReconciler = Reconciler(hostConfig)

SmithersReconciler.injectIntoDevTools({
  findFiberByHostInstance: () => null,
  bundleType: process.env.NODE_ENV === 'development' ? 1 : 0,
  version: '19.0.0',
  rendererPackageName: 'smithers-react-renderer',
})

export type { SmithersNode }
