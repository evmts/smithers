import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { glob } from '../../src/control-plane/glob'
import { grep } from '../../src/control-plane/grep'
import { isSensitiveFile } from '../../src/control-plane/security'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('Sensitive file filtering', () => {
  let tempDir: string

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithers-security-test-'))
    
    // Create sensitive files
    fs.writeFileSync(path.join(tempDir, '.env'), 'SECRET_KEY=super-secret-123')
    fs.writeFileSync(path.join(tempDir, '.env.local'), 'LOCAL_SECRET=local-secret')
    fs.writeFileSync(path.join(tempDir, '.env.production'), 'PROD_SECRET=prod-secret')
    fs.writeFileSync(path.join(tempDir, 'server.pem'), '-----BEGIN CERTIFICATE-----')
    fs.writeFileSync(path.join(tempDir, 'private.key'), '-----BEGIN PRIVATE KEY-----')
    fs.writeFileSync(path.join(tempDir, '.npmrc'), '//registry.npmjs.org/:_authToken=npm_token')
    fs.writeFileSync(path.join(tempDir, 'id_rsa'), 'ssh private key content')
    fs.writeFileSync(path.join(tempDir, 'id_rsa.pub'), 'ssh public key content')
    fs.writeFileSync(path.join(tempDir, 'cert.p12'), 'pkcs12 content')
    fs.writeFileSync(path.join(tempDir, 'cert.pfx'), 'pfx content')
    fs.writeFileSync(path.join(tempDir, '.git-credentials'), 'https://user:token@github.com')
    fs.writeFileSync(path.join(tempDir, '.netrc'), 'machine github.com login token')
    
    // Create non-sensitive files
    fs.writeFileSync(path.join(tempDir, 'index.ts'), 'export const hello = "world"')
    fs.writeFileSync(path.join(tempDir, 'config.json'), '{"name": "test"}')
    fs.writeFileSync(path.join(tempDir, 'README.md'), '# Test Project')
  })

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('isSensitiveFile', () => {
    it('should detect .env as sensitive', () => {
      expect(isSensitiveFile('.env')).toBe(true)
      expect(isSensitiveFile('/path/to/.env')).toBe(true)
    })

    it('should detect .env.* variants as sensitive', () => {
      expect(isSensitiveFile('.env.local')).toBe(true)
      expect(isSensitiveFile('.env.production')).toBe(true)
      expect(isSensitiveFile('/app/.env.development')).toBe(true)
    })

    it('should detect key/cert files as sensitive', () => {
      expect(isSensitiveFile('server.pem')).toBe(true)
      expect(isSensitiveFile('private.key')).toBe(true)
      expect(isSensitiveFile('cert.p12')).toBe(true)
      expect(isSensitiveFile('cert.pfx')).toBe(true)
    })

    it('should detect SSH keys as sensitive', () => {
      expect(isSensitiveFile('id_rsa')).toBe(true)
      expect(isSensitiveFile('id_rsa.pub')).toBe(true)
      expect(isSensitiveFile('id_rsa_github')).toBe(true)
    })

    it('should detect credential files as sensitive', () => {
      expect(isSensitiveFile('.npmrc')).toBe(true)
      expect(isSensitiveFile('.git-credentials')).toBe(true)
      expect(isSensitiveFile('.netrc')).toBe(true)
    })

    it('should NOT flag normal files as sensitive', () => {
      expect(isSensitiveFile('index.ts')).toBe(false)
      expect(isSensitiveFile('config.json')).toBe(false)
      expect(isSensitiveFile('README.md')).toBe(false)
      expect(isSensitiveFile('package.json')).toBe(false)
    })
  })

  describe('glob - sensitive file filtering', () => {
    it('should NOT return .env files', async () => {
      const results = await glob({ pattern: '**/*', cwd: tempDir })
      
      expect(results).not.toContain('.env')
      expect(results.some(f => f.includes('.env'))).toBe(false)
    })

    it('should NOT return .env.* variants', async () => {
      const results = await glob({ pattern: '**/*', cwd: tempDir })
      
      expect(results).not.toContain('.env.local')
      expect(results).not.toContain('.env.production')
    })

    it('should NOT return key/cert files', async () => {
      const results = await glob({ pattern: '**/*', cwd: tempDir })
      
      expect(results).not.toContain('server.pem')
      expect(results).not.toContain('private.key')
      expect(results).not.toContain('cert.p12')
      expect(results).not.toContain('cert.pfx')
    })

    it('should NOT return SSH keys', async () => {
      const results = await glob({ pattern: '**/*', cwd: tempDir })
      
      expect(results).not.toContain('id_rsa')
      expect(results).not.toContain('id_rsa.pub')
    })

    it('should NOT return credential files', async () => {
      const results = await glob({ pattern: '**/*', cwd: tempDir })
      
      expect(results).not.toContain('.npmrc')
      expect(results).not.toContain('.git-credentials')
      expect(results).not.toContain('.netrc')
    })

    it('should return non-sensitive files', async () => {
      const results = await glob({ pattern: '**/*', cwd: tempDir })
      
      expect(results).toContain('index.ts')
      expect(results).toContain('config.json')
      expect(results).toContain('README.md')
    })
  })

  describe('grep - sensitive file filtering', () => {
    it('should NOT search .env file contents', async () => {
      const result = await grep({ pattern: 'SECRET', cwd: tempDir })
      
      const envMatches = result.matches.filter(r => r.file.includes('.env'))
      expect(envMatches).toHaveLength(0)
    })

    it('should NOT return matches from key files', async () => {
      const result = await grep({ pattern: 'BEGIN', cwd: tempDir })
      
      const keyMatches = result.matches.filter(r => 
        r.file.endsWith('.pem') || r.file.endsWith('.key')
      )
      expect(keyMatches).toHaveLength(0)
    })

    it('should NOT return matches from SSH keys', async () => {
      const result = await grep({ pattern: 'ssh', cwd: tempDir })
      
      const sshMatches = result.matches.filter(r => r.file.includes('id_rsa'))
      expect(sshMatches).toHaveLength(0)
    })

    it('should NOT return matches from credential files', async () => {
      const result = await grep({ pattern: 'token', cwd: tempDir })
      
      const credMatches = result.matches.filter(r => 
        r.file.includes('.npmrc') || 
        r.file.includes('.git-credentials') ||
        r.file.includes('.netrc')
      )
      expect(credMatches).toHaveLength(0)
    })

    it('should return matches from non-sensitive files', async () => {
      const result = await grep({ pattern: 'hello', cwd: tempDir })
      
      expect(result.matches.some(r => r.file === 'index.ts')).toBe(true)
    })

    it('isSensitiveFile detects various sensitive file types', () => {
      expect(isSensitiveFile('.env')).toBe(true)
      expect(isSensitiveFile('.env.local')).toBe(true)
      expect(isSensitiveFile('server.pem')).toBe(true)
      expect(isSensitiveFile('index.ts')).toBe(false)
    })
  })
})
