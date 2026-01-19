import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import React from 'react'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { createSmithersDB } from '../../db/index.js'
import { createSmithersRoot, type SmithersRoot } from '../../reconciler/root.js'
import { resetTuiState } from '../state.js'
import { useSmithersConnection, type UseSmithersConnectionResult } from './useSmithersConnection.js'
import { waitForEffects } from '../test-utils.js'

function SmithersConnectionHarness({
  dbPath,
  options,
  onResult,
}: {
  dbPath: string
  options?: Parameters<typeof useSmithersConnection>[1]
  onResult: (result: UseSmithersConnectionResult) => void
}) {
  const result = useSmithersConnection(dbPath, options)
  onResult(result)
  return <test-hook />
}

describe('useSmithersConnection', () => {
  let root: SmithersRoot
  let tempDir: string

  beforeEach(() => {
    resetTuiState()
    root = createSmithersRoot()
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithers-conn-'))
  })

  afterEach(() => {
    root.dispose()
    resetTuiState()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test('connects to existing database and loads current execution', async () => {
    const dbPath = path.join(tempDir, 'smithers.db')
    const db = createSmithersDB({ path: dbPath, reset: true })
    const executionId = db.execution.start('conn-test', 'test.tsx')
    db.execution.complete(executionId)
    db.close()

    let latest: UseSmithersConnectionResult | null = null

    await root.render(
      <SmithersConnectionHarness
        dbPath={tempDir}
        onResult={(result) => { latest = result }}
      />
    )

    await waitForEffects()

    expect(latest!.isConnected).toBe(true)
    expect(latest!.error).toBeNull()
    expect(latest!.executions.length).toBeGreaterThan(0)
  })

  test('surfaces connection errors', async () => {
    let latest: UseSmithersConnectionResult | null = null

    const options = {
      createDb: () => {
        throw new Error('boom')
      },
    } as Parameters<typeof useSmithersConnection>[1]

    await root.render(
      <SmithersConnectionHarness
        dbPath={tempDir}
        options={options}
        onResult={(result) => { latest = result }}
      />
    )

    await waitForEffects()

    expect(latest!.isConnected).toBe(false)
    expect(latest!.error).toContain('boom')
    expect(latest!.db).toBeNull()
  })
})
