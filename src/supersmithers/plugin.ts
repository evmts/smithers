import { plugin } from 'bun'
import { createHash } from 'node:crypto'

const PROXY_NAMESPACE = 'supersmithers-proxy'

plugin({
  name: 'supersmithers',
  setup(build) {
    // Use Bun's transpiler to scan imports
    build.onLoad({ filter: /\.[cm]?[jt]sx?$/, namespace: 'file' }, async (args) => {
      const source = await Bun.file(args.path).text()
      const loader = args.path.endsWith('.tsx') || args.path.endsWith('.jsx') ? 'tsx' : 
                     args.path.endsWith('.ts') ? 'ts' : 'js'
      
      // Quick check before parsing
      if (!source.includes('supersmithers')) {
        return { contents: source, loader }
      }
      
      // Use Bun's transpiler to get import metadata
      const transpiler = new Bun.Transpiler({ loader: 'tsx' })
      const imports = transpiler.scanImports(source)
      
      // Find supersmithers imports by checking if the source has the attribute pattern
      // Note: Bun's scanImports doesn't expose attributes yet, so we use a targeted regex
      // on just the import statements, not the whole file
      // Note: Only default imports supported currently (named imports not yet implemented)
      let transformed = source
      
      for (const imp of imports) {
        // Build a regex for this specific import
        // Match: import X from "path" with { supersmithers: "scope" }
        // or: import X from "path" with { supersmithers: 'scope' }
        const importPattern = new RegExp(
          `import\\s+(\\w+)\\s+from\\s+(['"])${escapeRegex(imp.path)}\\2\\s+with\\s*\\{\\s*supersmithers:\\s*(['"])([^'"]+)\\3\\s*\\}`,
          'g'
        )
        
        transformed = transformed.replace(importPattern, (_match, binding, _q1, _q2, scope) => {
          const absPath = Bun.resolveSync(imp.path, args.path)
          const hash = createHash('sha256').update(absPath).digest('hex')
          return `import ${binding} from "${PROXY_NAMESPACE}:${absPath}?export=default&scope=${encodeURIComponent(scope)}&hash=${hash}"`
        })
      }
      
      return { contents: transformed, loader }
    })

    build.onResolve({ filter: /^supersmithers-proxy:/ }, (args) => {
      return {
        path: args.path.slice('supersmithers-proxy:'.length),
        namespace: PROXY_NAMESPACE,
      }
    })

    build.onLoad({ filter: /.*/, namespace: PROXY_NAMESPACE }, async (args) => {
      const url = new URL(`file://${args.path}`)
      const absPath = url.pathname
      const exportName = url.searchParams.get('export') ?? 'default'
      const scope = url.searchParams.get('scope') ?? 'default'
      const hash = url.searchParams.get('hash') ?? ''
      
      const contents = `
import { createSupersmithersProxy } from 'smithers-orchestrator/supersmithers/runtime'
import * as OriginalModule from ${JSON.stringify(absPath)}

const BaseComponent = ${exportName === 'default' ? 'OriginalModule.default' : `OriginalModule["${exportName}"]`}

const meta = {
  scope: ${JSON.stringify(scope)},
  moduleAbsPath: ${JSON.stringify(absPath)},
  exportName: ${JSON.stringify(exportName)},
  moduleHash: ${JSON.stringify(hash)},
}

const Proxy = createSupersmithersProxy(meta, BaseComponent)

${exportName === 'default' ? 'export default Proxy' : `export { Proxy as ${exportName} }`}
`
      return { contents, loader: 'tsx' }
    })
  },
})

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export {}
