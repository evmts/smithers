/**
 * Simple test to verify SolidJS reactivity works
 */
// Normal import - should use browser build with --conditions=browser
import { createSignal, createRoot, createEffect, createRenderEffect } from 'solid-js'

// Test basic signal reactivity
console.log('=== Testing SolidJS Signals ===\n')

const [count, setCount] = createSignal(0)

let dispose: () => void

dispose = createRoot((d) => {
  createRenderEffect(() => {
    console.log(`[RenderEffect] count = ${count()}`)
  })

  createEffect(() => {
    console.log(`[Effect] count = ${count()}`)
  })

  return d
})

console.log('\nSetting count to 1...')
setCount(1)

await Promise.resolve()
await new Promise(r => setTimeout(r, 10))

console.log('Setting count to 2...')
setCount(2)

await Promise.resolve()
await new Promise(r => setTimeout(r, 10))

console.log('Setting count to 3...')
setCount(3)

await Promise.resolve()
await new Promise(r => setTimeout(r, 10))

console.log('\nDone!')
dispose()
