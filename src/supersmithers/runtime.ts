import { jsx } from 'react/jsx-runtime'
import { pathToFileURL } from 'node:url'
import type { ComponentType } from 'react'
import { 
  SUPERSMITHERS_BRAND,
  type SupersmithersManagedComponent, 
  type SupersmithersModuleMeta 
} from './types.js'

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
 * Type-safe wrapper for plugin-managed components.
 * Validates the component was imported with `with { supersmithers: "scope" }`
 * and returns it with the correct branded type.
 * 
 * @example
 * import AuthPlan from "./plans/authPlan.tsx" with { supersmithers: "auth" }
 * const ManagedAuthPlan = supersmithers.managed(AuthPlan)
 */
export function managed<P>(plan: ComponentType<P>): SupersmithersManagedComponent<P> {
  if (!isSupersmithersManaged(plan)) {
    throw new Error(
      'supersmithers.managed() requires a component imported with `with { supersmithers: "scope" }` attribute. ' +
      'The Bun plugin must brand the component before managed() can validate it.'
    )
  }
  return plan as SupersmithersManagedComponent<P>
}

/**
 * Load overlay code and compile it to a component
 * Used when an active overlay version exists
 */
export async function loadOverlayComponent<P = {}>(
  overlayCode: string,
  meta: SupersmithersModuleMeta
): Promise<ComponentType<P>> {
  const tempDir = '/tmp/supersmithers-overlays'
  await Bun.$`mkdir -p ${tempDir}`.quiet()
  
  const tempPath = `${tempDir}/${meta.moduleHash}-${Date.now()}.tsx`
  await Bun.write(tempPath, overlayCode)
  
  try {
    // Use file:// URL for correct resolution
    const fileUrl = pathToFileURL(tempPath).href
    const mod = await import(fileUrl)
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

/** Namespace for SuperSmithers runtime utilities */
export const supersmithers = {
  /** Validate and cast a plugin-branded component */
  managed,
  /** Create a branded proxy (used by Bun plugin) */
  createProxy: createSupersmithersProxy,
  /** Check if component is plugin-managed */
  isManaged: isSupersmithersManaged,
  /** Get metadata from managed component */
  getMeta: getSupersmithersMeta,
}
