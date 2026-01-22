import { type ReactNode, useRef, createElement, type ComponentType, useReducer } from 'react'
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
import { runRewrite } from './rewriter.js'
import { initOverlayRepo, writeAndCommit, type SuperSmithersVCS } from './vcs.js'
import { createSuperSmithersDBHelpers } from './db.js'
import { uuid } from '../db/utils.js'

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
    "SELECT CAST(value AS INTEGER) as value FROM state WHERE key = 'ralphCount'",
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
  const currentScopeRevRef = useRef<string | null>(null)
  const overlayLoadSeqRef = useRef(0)
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)

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

  // Ref to hold live values - fixes stale closure in useEffectOnValueChange
  const liveRef = useRef({
    props,
    meta,
    activeVersionId,
    effectiveRewriteCount,
    currentScopeRev: currentScopeRevRef.current,
    ralphCount,
  })
  liveRef.current = {
    props,
    meta,
    activeVersionId,
    effectiveRewriteCount,
    currentScopeRev: currentScopeRevRef.current,
    ralphCount,
  }

  useMount(() => {
    void initOverlayRepo().then(vcs => {
      vcsRef.current = vcs
    })
  })

  useEffectOnValueChange(activeVersionId, () => {
    overlayLoadSeqRef.current += 1
    const seq = overlayLoadSeqRef.current

    if (!activeVersionId) {
      overlayComponentRef.current = null
      currentScopeRevRef.current = null
      forceUpdate()
      return
    }

    overlayComponentRef.current = null
    
    const code = dbHelpers.getVersionCode(activeVersionId)
    if (code) {
      const newScopeRev = uuid()
      currentScopeRevRef.current = newScopeRev
      
      loadOverlayComponent<P>(code, meta)
        .then(comp => {
          if (overlayLoadSeqRef.current !== seq) return
          overlayComponentRef.current = comp
          forceUpdate()
        })
        .catch(err => {
          if (overlayLoadSeqRef.current !== seq) return
          dbHelpers.clearActiveVersion(meta.moduleHash)
          overlayComponentRef.current = null
          currentScopeRevRef.current = null
          forceUpdate()
          liveRef.current.props.onError?.(err instanceof Error ? err : new Error(String(err)))
        })
    }
  }, [activeVersionId, meta.moduleHash])

  useEffectOnValueChange(ralphCount, () => {
    if (liveRef.current.props.observeOn?.includes('iteration') ?? true) {
      void maybeAnalyzeAndRewrite('iteration', liveRef.current)
    }
  }, [])

  async function maybeAnalyzeAndRewrite(
    trigger: SuperSmithersContext['trigger'],
    live: typeof liveRef.current
  ) {
    if (inFlightRef.current) return
    if (live.effectiveRewriteCount >= (live.props.maxRewrites ?? 3)) return

    const cooldown = live.props.rewriteCooldown ?? 60_000
    if (Date.now() - lastRewriteAtRef.current < cooldown) return

    inFlightRef.current = true
    dbHelpers.ensureModule(live.meta)

    try {
      const metrics = collectMetrics(db, executionId, live.ralphCount)
      const errors = collectErrors(db, executionId)
      
      const frames = db.db.query<RenderFrameRow>(
        `SELECT id, ralph_count, created_at, tree_xml FROM render_frames 
         WHERE execution_id = ? ORDER BY sequence_number DESC LIMIT 10`,
        [executionId]
      )

      const context: SuperSmithersContext = {
        executionId,
        iteration: live.ralphCount,
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
          rewriteCount: live.effectiveRewriteCount,
          seenCodeHashes: [],
        },
        sourceFile: live.meta.moduleAbsPath,
        trigger,
      }

      const shouldRewrite = await checkRewriteConditions(live.props, context)
      if (!shouldRewrite) return

      const baselineCode = await Bun.file(live.meta.moduleAbsPath).text()
      const analysis = await runAnalysis({
        context,
        model: live.props.rewriteModel ?? 'sonnet',
        baselineCode,
      })

      dbHelpers.storeAnalysis({
        executionId,
        moduleHash: live.meta.moduleHash,
        iteration: live.ralphCount,
        trigger,
        treeXml: context.treeXml,
        metrics,
        errors,
        analysis,
        model: live.props.rewriteModel ?? 'sonnet',
      })

      if (!analysis.rewrite.recommended) return

      const proposal = await runRewrite({
        context,
        analysis,
        baselineCode,
        model: live.props.rewriteModel ?? 'opus',
        ...(live.props.rewriteSystemPrompt !== undefined && { systemPrompt: live.props.rewriteSystemPrompt }),
      })

      live.props.onRewriteProposed?.(proposal)

      const vcs = vcsRef.current
      if (!vcs) return

      const versionId = uuid()
      const relPath = `modules/${live.meta.moduleHash}/${versionId}.tsx`
      const commitId = await writeAndCommit(
        vcs,
        relPath,
        proposal.newCode,
        `supersmithers: ${live.meta.scope} ${trigger}`
      )

      dbHelpers.storeVersion({
        versionId,
        moduleHash: live.meta.moduleHash,
        parentVersionId: live.activeVersionId ?? null,
        code: proposal.newCode,
        overlayRelPath: relPath,
        trigger,
        analysis,
        metrics,
        vcsKind: vcs.kind,
        vcsCommitId: commitId,
      })

      dbHelpers.setActiveVersion(live.meta.moduleHash, versionId)

      lastRewriteAtRef.current = Date.now()

      live.props.onRewriteApplied?.({
        id: versionId,
        summary: proposal.summary,
        status: 'applied',
      })
    } catch (err) {
      live.props.onError?.(err instanceof Error ? err : new Error(String(err)))
    } finally {
      inFlightRef.current = false
    }
  }

  const ComponentToRender = overlayComponentRef.current ?? props.plan

  return createElement(
    'supersmithers',
    {
      scope: meta.scope,
      moduleHash: meta.moduleHash,
      rewriteCount: effectiveRewriteCount,
      maxRewrites: props.maxRewrites ?? 3,
      scopeRev: currentScopeRevRef.current,
    },
    createElement(ComponentToRender as unknown as ComponentType<Record<string, unknown>>, (props.planProps ?? {}) as Record<string, unknown>)
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
