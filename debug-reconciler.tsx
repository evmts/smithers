import ReactReconciler from 'react-reconciler'
import { createElement } from 'react'

// Minimal host config
const hostConfig = {
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,

  createInstance(type, props) {
    console.log('[createInstance]', type, props)
    return { type, props, children: [] }
  },

  createTextInstance(text) {
    console.log('[createTextInstance]', text)
    return { type: 'TEXT', value: text, children: [] }
  },

  appendInitialChild(parent, child) {
    console.log('[appendInitialChild]', parent.type, '<-', child.type || child.value)
    parent.children.push(child)
  },

  appendChild(parent, child) {
    console.log('[appendChild]', parent.type, '<-', child.type || child.value)
    parent.children.push(child)
  },

  appendChildToContainer(container, child) {
    console.log('[appendChildToContainer]', container.type, '<-', child.type || child.value)
    container.children.push(child)
  },

  finalizeInitialChildren() { return false },
  prepareUpdate() { return null },
  shouldSetTextContent() { return false },
  getRootHostContext() { return {} },
  getChildHostContext(ctx) { return ctx },
  getPublicInstance(i) { return i },
  prepareForCommit() {
    console.log('[prepareForCommit]')
    return null
  },
  resetAfterCommit() {
    console.log('[resetAfterCommit]')
  },
  preparePortalMount() {},
  now: Date.now,
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1,
  isPrimaryRenderer: true,

  // Required methods
  clearContainer() {},
  insertBefore() {},
  insertInContainerBefore() {},
  removeChild() {},
  removeChildFromContainer() {},
  commitUpdate() {},
  commitTextUpdate() {},
  hideInstance() {},
  unhideInstance() {},
  hideTextInstance() {},
  unhideTextInstance() {},
  detachDeletedInstance() {},
  getCurrentEventPriority() { return 0 },
  resolveUpdatePriority() { return 0 },
  beforeActiveInstanceBlur() {},
  afterActiveInstanceBlur() {},
  prepareScopeUpdate() {},
  getInstanceFromScope() { return null },
  getInstanceFromNode() { return null },
  trackSchedulerEvent() {},
  resolveEventType() { return null },
  resolveEventTimeStamp() { return Date.now() },
  setCurrentUpdatePriority() {},
  getCurrentUpdatePriority() { return 0 },
  resetFormInstance() {},
  requestPostPaintCallback(cb) { cb() },
  shouldAttemptEagerTransition() { return false },
  maySuspendCommit() { return false },
  preloadInstance() { return true },
  startSuspendingCommit() {},
  suspendInstance() {},
  waitForCommitToBeReady() { return null },
  supportsMicrotasks: false,
  scheduleMicrotask: (cb) => Promise.resolve().then(cb),
}

const reconciler = ReactReconciler(hostConfig as any)

// Create container
const rootNode = { type: 'ROOT', props: {}, children: [], parent: null }

const container = reconciler.createContainer(
  rootNode,
  0, // concurrent mode
  null,
  false,
  null,
  '',
  console.error,
  console.error,
  console.error,
  () => {},
  null
)

// Test element
const TestElement = () => createElement('claude', {}, 'Hello world')

console.log('\n=== Element info ===')
const element = <TestElement />
console.log('Element:', element)
console.log('Element type:', element.type)
console.log('Element props:', element.props)

console.log('\n=== Trying updateContainerSync ===')
const updateContainerSync = (reconciler as any).updateContainerSync
if (updateContainerSync) {
  console.log('updateContainerSync exists, calling it...')
  updateContainerSync(element, container)
} else {
  console.log('updateContainerSync not available, using updateContainer')
  reconciler.updateContainer(element, container, null, () => {
    console.log('[updateContainer callback]')
  })

  console.log('\n=== Waiting for microtask ===')
  await new Promise(resolve => setImmediate(resolve))

  console.log('\n=== Flushing work ===')
  const flushSyncWork = (reconciler as any).flushSyncWork
  if (flushSyncWork) {
    console.log('Calling flushSyncWork...')
    flushSyncWork()
  }

  const flushPassiveEffects = (reconciler as any).flushPassiveEffects
  if (flushPassiveEffects) {
    console.log('Calling flushPassiveEffects...')
    flushPassiveEffects()
  }
}

console.log('\n=== Final tree (before any waiting) ===')
console.log(JSON.stringify(rootNode, null, 2))

console.log('\n=== Waiting a bit... ===')
await new Promise(resolve => setTimeout(resolve, 100))

console.log('\n=== Final tree (after wait) ===')
console.log(JSON.stringify(rootNode, null, 2))
