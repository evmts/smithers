import ReactReconciler from 'react-reconciler'

const r = ReactReconciler({
  supportsMutation: true,
  supportsPersistence: false,
  createInstance: () => ({}),
  createTextInstance: () => ({}),
  appendInitialChild: () => {},
  finalizeInitialChildren: () => false,
  prepareUpdate: () => null,
  shouldSetTextContent: () => false,
  getRootHostContext: () => ({}),
  getChildHostContext: () => ({}),
  getPublicInstance: (i) => i,
  prepareForCommit: () => null,
  resetAfterCommit: () => {},
  preparePortalMount: () => {},
  now: Date.now,
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1,
  isPrimaryRenderer: true,
})

console.log('Reconciler methods:')
console.log(Object.keys(r).sort().join('\n'))
