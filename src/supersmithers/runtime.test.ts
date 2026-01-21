import { describe, test, expect } from 'bun:test'
import {
  createSupersmithersProxy,
  isSupersmithersManaged,
  getSupersmithersMeta,
  generateModuleHash,
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
