import { plugin } from 'bun'

/**
 * Bun preload plugin that transforms imports with supersmithers attribute
 * 
 * Example:
 *   import AuthPlan from "./plans/auth.tsx" with { supersmithers: "auth" }
 * 
 * Transforms to a proxy module that:
 * 1. Imports the original component
 * 2. Wraps it with createSupersmithersProxy
 * 3. Exports the branded component
 */

const PROXY_NAMESPACE = 'supersmithers-proxy'

plugin({
  name: 'supersmithers',
  setup(build) {
    // Match imports with supersmithers attribute
    // Bun doesn't directly expose import attributes in the plugin API yet,
    // so we use a resolver that creates virtual modules
    
    build.onResolve({ filter: /.*/, namespace: 'file' }, (args) => {
      // Check for special suffix pattern: file.tsx?supersmithers=scope
      if (args.path.includes('?supersmithers=')) {
        const parts = args.path.split('?supersmithers=')
        const realPath = parts[0] ?? ''
        const scope = parts[1] ?? 'default'
        
        return {
          path: `${realPath}::${scope}`,
          namespace: PROXY_NAMESPACE,
        }
      }
      
      return undefined
    })

    build.onLoad({ filter: /.*/, namespace: PROXY_NAMESPACE }, async (args) => {
      const parts = args.path.split('::')
      const modulePath = parts[0] ?? ''
      const scope = parts[1] ?? 'default'
      const absPath = Bun.resolveSync(modulePath, process.cwd())
      const content = await Bun.file(absPath).text()
      const moduleHash = Bun.hash(`${absPath}:${content}`).toString(16)
      
      // Generate proxy module code
      const proxyCode = `
import { createSupersmithersProxy } from 'smithers-orchestrator/supersmithers/runtime'
import OriginalDefault, * as OriginalModule from ${JSON.stringify(absPath)}

const meta = {
  scope: ${JSON.stringify(scope)},
  moduleAbsPath: ${JSON.stringify(absPath)},
  exportName: 'default',
  moduleHash: ${JSON.stringify(moduleHash)},
}

export default createSupersmithersProxy(meta, OriginalDefault)

// Re-export named exports
${Object.keys(await import(absPath))
  .filter(k => k !== 'default')
  .map(k => `export const ${k} = OriginalModule.${k}`)
  .join('\n')}
`

      return {
        contents: proxyCode,
        loader: 'tsx',
      }
    })
  },
})

export {}
