import { jsx } from 'react/jsx-runtime'
import type { ComponentType } from 'react'
import type { 
  SupersmithersManagedComponent, 
  SupersmithersModuleMeta 
} from './types.js'

// Symbol for branding
const SUPERSMITHERS_BRAND = Symbol.for('supersmithers.managed')

/**
 * Creates a branded proxy component that can load baseline or overlay code
 */
export function createSupersmithersProxy<P = {}>(
  meta: SupersmithersModuleMeta,
  BaselineComponent: ComponentType<P>
): SupersmithersManagedComponent<P> {
  const ProxyComponent = (props: P) => {
    return jsx(BaselineComponent, props as any)
  }
  
  Object.defineProperty(ProxyComponent, SUPERSMITHERS_BRAND, {
    value: meta,
    enumerable: false,
    writable: false,
  })
  
  ProxyComponent.displayName = `SuperSmithersProxy(${meta.scope})`
  
  return ProxyComponent as SupersmithersManagedComponent<P>
}

/**
 * Check if a component is a SuperSmithers-managed component
 */
export function isSupersmithersManaged(component: unknown): component is SupersmithersManagedComponent {
  return (
    typeof component === 'function' &&
    SUPERSMITHERS_BRAND in component
  )
}

/**
 * Get metadata from a managed component
 */
export function getSupersmithersMeta(
  component: SupersmithersManagedComponent
): SupersmithersModuleMeta {
  return (component as any)[SUPERSMITHERS_BRAND]
}

/**
 * Generate a module hash from file path and content
 */
export function generateModuleHash(absPath: string, content: string): string {
  const combined = `${absPath}:${content}`
  return Bun.hash(combined).toString(16)
}

/**
 * Load overlay code and compile it to a component
 * Used when an active overlay version exists
 */
export async function loadOverlayComponent<P = {}>(
  overlayCode: string,
  meta: SupersmithersModuleMeta
): Promise<ComponentType<P>> {
  const tempPath = `/tmp/supersmithers-overlay-${meta.moduleHash}-${Date.now()}.tsx`
  await Bun.write(tempPath, overlayCode)
  
  try {
    const mod = await import(tempPath)
    const Component = meta.exportName === 'default' 
      ? mod.default 
      : mod[meta.exportName]
    
    if (!Component) {
      throw new Error(`Export "${meta.exportName}" not found in overlay`)
    }
    
    return Component
  } finally {
    await Bun.$`rm -f ${tempPath}`.quiet()
  }
}
