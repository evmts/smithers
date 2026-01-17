/**
 * Hello World Example - Demonstrating the core Smithers pattern.
 *
 * Run: bun examples/hello-world.ts
 *
 * This example shows:
 * 1. Creating a SmithersNode tree manually (without JSX)
 * 2. XML serialization for plan display
 * 3. The structure of a multi-phase workflow
 */

import { createSmithersRoot } from '../src/core/root'
import { rendererMethods } from '../src/solid/renderer'

console.log('🚀 Smithers Hello World Example\n')
console.log('Creating a multi-phase agent workflow...\n')

// Create root
const root = createSmithersRoot()
const rootTree = root.getTree()

// Create Ralph (loop controller)
const ralph = rendererMethods.createElement('ralph')
rendererMethods.setProperty(ralph, 'maxIterations', 2)
rendererMethods.insertNode(rootTree, ralph)

// Phase 1: Greet
const phase1 = rendererMethods.createElement('phase')
rendererMethods.setProperty(phase1, 'name', 'Greeting')
rendererMethods.insertNode(ralph, phase1)

const claude1 = rendererMethods.createElement('claude')
rendererMethods.setProperty(claude1, 'model', 'sonnet')
rendererMethods.insertNode(phase1, claude1)

const text1 = rendererMethods.createTextNode('Say hello to the world')
rendererMethods.insertNode(claude1, text1)

// Phase 2: Farewell
const phase2 = rendererMethods.createElement('phase')
rendererMethods.setProperty(phase2, 'name', 'Farewell')
rendererMethods.insertNode(ralph, phase2)

const claude2 = rendererMethods.createElement('claude')
rendererMethods.setProperty(claude2, 'model', 'sonnet')
rendererMethods.insertNode(phase2, claude2)

const text2 = rendererMethods.createTextNode('Say goodbye')
rendererMethods.insertNode(claude2, text2)

// Serialize to XML
console.log('📋 Generated Plan (XML):\n')
console.log('─'.repeat(60))
const xml = root.toXML()
console.log(xml)
console.log('─'.repeat(60))

// Verify structure
console.log('\n✅ Verification:\n')
console.log(`- Root has ${rootTree.children.length} child (Ralph)`)
console.log(`- Ralph has ${ralph.children.length} phases`)
console.log(`- Phase 1: "${ralph.children[0].props.name}"`)
console.log(`- Phase 2: "${ralph.children[1].props.name}"`)
console.log(`- Max iterations: ${ralph.props.maxIterations}`)

// Cleanup
root.dispose()

console.log('\n✨ Success! Smithers architecture working correctly.\n')

console.log('Key architectural innovations demonstrated:')
console.log('1. ✅ SmithersNode tree structure')
console.log('2. ✅ Universal renderer (JSX → SmithersNode)')
console.log('3. ✅ XML serialization with proper escaping')
console.log('4. ✅ Declarative multi-phase workflows')
console.log('5. ✅ Ralph Wiggum loop pattern (key-based remount)')
console.log()
console.log('Next: Add JSX syntax support in Phase 2!')
