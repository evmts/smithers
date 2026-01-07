import { create as createArtifactClient } from '@actions/artifact'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { RunnerResult } from './runner.js'

/**
 * Upload agent execution result as workflow artifact
 */
export async function uploadResult(result: RunnerResult, artifactName: string): Promise<string> {
  const artifactClient = createArtifactClient()

  // Create temp file with result
  const tmpDir = path.join(process.cwd(), '.smithers-tmp')
  fs.mkdirSync(tmpDir, { recursive: true })

  const resultFile = path.join(tmpDir, 'result.json')
  fs.writeFileSync(resultFile, JSON.stringify(result, null, 2), 'utf-8')

  try {
    // Upload artifact
    const uploadResult = await artifactClient.uploadArtifact(artifactName, [resultFile], tmpDir, {
      continueOnError: false,
    })

    // Return artifact URL (note: actual URL requires GitHub context)
    return uploadResult.artifactName
  } finally {
    // Cleanup temp file
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}
