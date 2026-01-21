import { describe, test, expect } from 'bun:test'
import {
  createSupersmithersProxy,
  isSupersmithersManaged,
  getSupersmithersMeta,
  generateModuleHash,
  supersmithers,
} from './runtime.js'

describe('SuperSmithers Runtime', () => {
  test('createSupersmithersProxy brands component', () => {
    const BaseComponent = () => null
    const meta = {
      scope: 'test',
      moduleAbsPath: '/test/path.tsx',
      exportName: 'default' as const,
      moduleHash: 'abc123',
    }
    const Proxy = createSupersmithersProxy(meta, BaseComponent)
    expect(isSupersmithersManaged(Proxy)).toBe(true)
  })

  test('getSupersmithersMeta returns metadata', () => {
    const BaseComponent = () => null
    const meta = {
      scope: 'auth',
      moduleAbsPath: '/plans/auth.tsx',
      exportName: 'default' as const,
      moduleHash: 'xyz789',
    }
    const Proxy = createSupersmithersProxy(meta, BaseComponent)
    expect(getSupersmithersMeta(Proxy)).toEqual(meta)
  })

  test('generateModuleHash creates consistent hash', () => {
    const hash1 = generateModuleHash('/path/file.tsx', 'content')
    const hash2 = generateModuleHash('/path/file.tsx', 'content')
    expect(hash1).toBe(hash2)
  })

  test('isSupersmithersManaged returns false for plain components', () => {
    const PlainComponent = () => null
    expect(isSupersmithersManaged(PlainComponent)).toBe(false)
  })

  test('isSupersmithersManaged returns false for non-functions', () => {
    expect(isSupersmithersManaged(null)).toBe(false)
    expect(isSupersmithersManaged(undefined)).toBe(false)
    expect(isSupersmithersManaged('string')).toBe(false)
    expect(isSupersmithersManaged({})).toBe(false)
  })

  test('generateModuleHash differs for different paths', () => {
    const hash1 = generateModuleHash('/path/file1.tsx', 'content')
    const hash2 = generateModuleHash('/path/file2.tsx', 'content')
    expect(hash1).not.toBe(hash2)
  })

  test('generateModuleHash differs for different content', () => {
    const hash1 = generateModuleHash('/path/file.tsx', 'content1')
    const hash2 = generateModuleHash('/path/file.tsx', 'content2')
    expect(hash1).not.toBe(hash2)
  })

  test('proxy has displayName', () => {
    const BaseComponent = () => null
    const meta = {
      scope: 'myScope',
      moduleAbsPath: '/test/path.tsx',
      exportName: 'default' as const,
      moduleHash: 'hash123',
    }
    const Proxy = createSupersmithersProxy(meta, BaseComponent)
    expect(Proxy.displayName).toBe('SuperSmithersProxy(myScope)')
  })

  test('proxy component renders baseline', () => {
    const BaseComponent = (props: { value: number }) => props.value
    const meta = {
      scope: 'test',
      moduleAbsPath: '/test/path.tsx',
      exportName: 'default' as const,
      moduleHash: 'abc123',
    }
    const Proxy = createSupersmithersProxy(meta, BaseComponent)
    const result = (Proxy as any)({ value: 42 })
    expect(result.props.value).toBe(42)
  })
})

describe('supersmithers.managed()', () => {
  test('throws for non-plugin-branded component', () => {
    const Base = () => null
    expect(() => supersmithers.managed(Base)).toThrow('supersmithers.managed()')
  })

  test('returns plugin-branded component unchanged', () => {
    const Base = () => null
    const meta = {
      scope: 'test-scope',
      moduleAbsPath: '/test/path.tsx',
      exportName: 'default' as const,
      moduleHash: 'abc123',
    }
    // Pre-brand with createSupersmithersProxy (simulating plugin)
    const PluginBranded = createSupersmithersProxy(meta, Base)
    
    // managed() should validate and return it
    const Managed = supersmithers.managed(PluginBranded)
    expect(Managed).toBe(PluginBranded)
    expect(isSupersmithersManaged(Managed)).toBe(true)
    expect(getSupersmithersMeta(Managed).scope).toBe('test-scope')
  })

  test('preserves metadata from plugin-branded component', () => {
    const Base = () => null
    const meta = {
      scope: 'auth',
      moduleAbsPath: '/plans/auth.tsx',
      exportName: 'AuthComponent' as const,
      moduleHash: 'xyz789',
    }
    const PluginBranded = createSupersmithersProxy(meta, Base)
    const Managed = supersmithers.managed(PluginBranded)
    
    const retrievedMeta = getSupersmithersMeta(Managed)
    expect(retrievedMeta.exportName).toBe('AuthComponent')
    expect(retrievedMeta.moduleAbsPath).toBe('/plans/auth.tsx')
    expect(retrievedMeta.moduleHash).toBe('xyz789')
  })
})
