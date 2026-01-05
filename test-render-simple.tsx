import { renderPlan, Claude } from './src/index.js'

const HelloWorld = () => (
  <Claude>
    You are a friendly assistant. Say hello.
  </Claude>
)

console.log('Testing renderPlan...')
const plan = await renderPlan(<HelloWorld />)
console.log('Plan result:', plan)
console.log('Plan length:', plan.length)

// Test with just the export
import { createRoot, serialize } from './src/core/render.js'

const root = createRoot()
console.log('\n=== Testing direct render ===')
const tree = await root.render(<HelloWorld />)
console.log('Tree type:', tree.type)
console.log('Tree children count:', tree.children.length)
if (tree.children.length > 0) {
  console.log('First child type:', tree.children[0].type)
  console.log('First child props:', tree.children[0].props)
}
const xml = serialize(tree)
console.log('Serialized:', xml)
