import { type ReactNode, useRef, createElement, type ComponentType } from 'react'
import { useSmithers } from '../components/SmithersProvider.js'
import { useQueryValue } from '../reactive-sqlite/index.js'
import { useMount, useEffectOnValueChange } from '../reconciler/hooks.js'
import { 
  isSupersmithersManaged, 
  getSupersmithersMeta,
  loadOverlayComponent,
} from './runtime.js'
import type { SuperSmithersProps, SuperSmithersContext } from './types.js'
import { collectMetrics, collectErrors } from './observer.js'
import { runAnalysis } from './analyzer.js'
import { runRewrite, validateRewrite } from './rewriter.js'
import { initOverlayRepo, writeAndCommit, type SuperSmithersVCS } from './vcs.js'
import { createSuperSmithersDBHelpers } from './db.js'

interface RenderFrameRow {
  id: string
  ralph_count: number
  created_at: string
  tree_xml: string
}

export function SuperSmithers<P>(props: SuperSmithersProps<P>): ReactNode {
  const { db, reactiveDb, executionId } = useSmithers()
  
  const { data: ralphCountRaw } = useQueryValue<number>(
    reactiveDb,
    "SELECT value FROM state WHERE key = 'ralphCount'",
    []
  )
  const ralphCount = ralphCountRaw ?? 0

  if (!isSupersmithersManaged(props.plan)) {
    throw new Error(
      '<SuperSmithers> requires a plan prop that was imported with { supersmithers: "scope" } attribute'
    )
  }

  const meta = getSupersmithersMeta(props.plan)
  const dbHelpers = createSuperSmithersDBHelpers(reactiveDb)
  const inFlightRef = useRef(false)
  const lastRewriteAtRef = useRef<number>(0)
  const vcsRef = useRef<SuperSmithersVCS | null>(null)
  const overlayComponentRef = useRef<ComponentType<P> | null>(null)

  const { data: activeVersionId } = useQueryValue<string>(
    reactiveDb,
    `SELECT active_version_id FROM supersmithers_active_overrides WHERE module_hash = ?`,
    [meta.moduleHash]
  )

  const { data: rewriteCountData } = useQueryValue<number>(
    reactiveDb,
    `SELECT COUNT(*) as count FROM supersmithers_versions WHERE module_hash = ?`,
    [meta.moduleHash]
  )
  const effectiveRewriteCount = rewriteCountData ?? 0

  useMount(() => {
    void initOverlayRepo().then(vcs => {
      vcsRef.current = vcs
    })
  })

  useEffectOnValueChange(activeVersionId, () => {
    if (!activeVersionId) {
      overlayComponentRef.current = null
      return
    }
    
    const code = dbHelpers.getVersionCode(activeVersionId)
    if (code) {
      void loadOverlayComponent<P>(code, meta).then(comp => {
        overlayComponentRef.current = comp
      })
    }
  }, [activeVersionId, meta.moduleHash])

  const observeOnRef = useRef(props.observeOn)
  observeOnRef.current = props.observeOn

  useEffectOnValueChange(ralphCount, () => {
    if (observeOnRef.current?.includes('iteration') ?? true) {
      void maybeAnalyzeAndRewrite('iteration')
    }
  }, [])

  async function maybeAnalyzeAndRewrite(trigger: SuperSmithersContext['trigger']) {
    if (inFlightRef.current) return
    if (effectiveRewriteCount >= (props.maxRewrites ?? 3)) return

    const cooldown = props.rewriteCooldown ?? 60_000
    if (Date.now() - lastRewriteAtRef.current < cooldown) return

    inFlightRef.current = true

    try {
      const metrics = collectMetrics(db, executionId, ralphCount)
      const errors = collectErrors(db, executionId)
      
      const frames = db.db.query<RenderFrameRow>(
        `SELECT id, ralph_count, created_at, tree_xml FROM render_frames 
         WHERE execution_id = ? ORDER BY sequence_number DESC LIMIT 10`,
        [executionId]
      )

      const context: SuperSmithersContext = {
        executionId,
        iteration: ralphCount,
        treeXml: frames[0]?.tree_xml ?? '',
        recentFrames: frames.map((f: RenderFrameRow) => ({
          id: f.id,
          iteration: f.ralph_count,
          createdAt: f.created_at,
          xml: f.tree_xml,
        })),
        metrics,
        recentErrors: errors,
        rewriteHistory: {
          rewriteCount: effectiveRewriteCount,
          seenCodeHashes: [],
        },
        sourceFile: meta.moduleAbsPath,
        trigger,
      }

      const shouldRewrite = await checkRewriteConditions(props, context)
      if (!shouldRewrite) return

      const baselineCode = await Bun.file(meta.moduleAbsPath).text()
      const analysis = await runAnalysis({
        context,
        model: props.rewriteModel ?? 'sonnet',
        baselineCode,
      })

      dbHelpers.storeAnalysis({
        executionId,
        moduleHash: meta.moduleHash,
        iteration: ralphCount,
        trigger,
        treeXml: context.treeXml,
        metrics,
        errors,
        analysis,
        model: props.rewriteModel ?? 'sonnet',
      })

      if (!analysis.rewrite.recommended) return

      const proposal = await runRewrite({
        context,
        analysis,
        baselineCode,
        model: props.rewriteModel ?? 'opus',
        ...(props.rewriteSystemPrompt !== undefined && { systemPrompt: props.rewriteSystemPrompt }),
      })

      props.onRewriteProposed?.(proposal)

      const validation = await validateRewrite(proposal.newCode, meta.moduleAbsPath)
      if (!validation.valid) {
        console.error('[SuperSmithers] Validation failed:', validation.errors)
        return
      }

      const vcs = vcsRef.current
      if (!vcs) return

      const versionId = crypto.randomUUID()
      const relPath = `modules/${meta.moduleHash}/${versionId}.tsx`
      const commitId = await writeAndCommit(
        vcs,
        relPath,
        proposal.newCode,
        `supersmithers: ${meta.scope} ${trigger}`
      )

      dbHelpers.storeVersion({
        moduleHash: meta.moduleHash,
        parentVersionId: activeVersionId ?? null,
        code: proposal.newCode,
        overlayRelPath: relPath,
        trigger,
        analysis,
        metrics,
        vcsKind: vcs.kind,
        vcsCommitId: commitId,
      })

      dbHelpers.setActiveVersion(meta.moduleHash, versionId)

      lastRewriteAtRef.current = Date.now()

      props.onRewriteApplied?.({
        id: versionId,
        summary: proposal.summary,
        status: 'applied',
      })
    } catch (err) {
      props.onError?.(err instanceof Error ? err : new Error(String(err)))
    } finally {
      inFlightRef.current = false
    }
  }

  const ComponentToRender = overlayComponentRef.current ?? props.plan
  const planPropsToUse = (props.planProps ?? {}) as P
  const childElement = props.children ?? createElement(
    ComponentToRender as unknown as ComponentType<Record<string, unknown>>,
    planPropsToUse as Record<string, unknown>
  )

  return createElement(
    'supersmithers',
    {
      scope: meta.scope,
      moduleHash: meta.moduleHash,
      rewriteCount: effectiveRewriteCount,
      maxRewrites: props.maxRewrites ?? 3,
    },
    childElement
  )
}

async function checkRewriteConditions(
  props: SuperSmithersProps<any>,
  context: SuperSmithersContext
): Promise<boolean> {
  const { rewriteOn } = props
  if (!rewriteOn) return false

  if (rewriteOn.errors && context.recentErrors.length > 2) return true
  if (rewriteOn.stalls && context.metrics.isStalled) return true
  if (rewriteOn.performance && context.metrics.tokensInput > 100_000) return true
  if (rewriteOn.custom) return await rewriteOn.custom(context)

  return false
}
