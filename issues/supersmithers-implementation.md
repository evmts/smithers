# SuperSmithers: Self-Rewriting Plan Modules

<metadata>
  <priority>P0</priority>
  <category>component</category>
  <status>proposed</status>
  <dependencies>
    - [SmithersProvider](../src/components/SmithersProvider.tsx)
    - [Smithers Subagent](../src/components/Smithers.tsx)
    - [Bun Plugin API](https://bun.sh/docs/runtime/plugins)
  </dependencies>
  <blocked-by></blocked-by>
  <docs>["docs/supersmithers.md"]</docs>
</metadata>

## Executive Summary

**What**: A `<SuperSmithers>` component that observes execution state and rewrites plan module code in-process without modifying original source files.

**Why**: Agents that can rewrite their own orchestration code enable self-healing, self-optimizing workflows—the "north star" feature for Smithers.

**Impact**: Users wrap plan modules with SuperSmithers to get automatic healing on errors/stalls/performance issues, with versioned overlays stored durably in SQLite + VCS.

## Problem Statement

Current Smithers orchestrations are static: if a plan encounters repeated errors or stalls, it cannot adapt. Users must manually diagnose and fix plans.

### Concrete Examples

```tsx
// Current: plan errors repeatedly, no self-correction
<SmithersProvider db={db} executionId={executionId}>
  <Phase name="implement">
    <Claude model="sonnet">
      Implement auth // fails repeatedly due to missing context
    </Claude>
  </Phase>
</SmithersProvider>
```

**Current Behavior:**
- Plan runs until max iterations or fatal error
- No automatic adaptation to repeated failures
- Manual intervention required

**Expected Behavior:**
- SuperSmithers detects repeated failures
- Generates improved plan via Claude analysis
- Applies overlay without modifying original source
- Plan resumes with improved implementation

## Proposed Solution

### Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                           User Code                                   │
│                                                                       │
│  import AuthPlan from "./plans/auth.tsx" with { supersmithers: "auth" }│
│                                                                       │
│  <SuperSmithers plan={AuthPlan}>                                      │
│    <AuthPlan />        ← Proxy renders baseline or overlay            │
│  </SuperSmithers>                                                     │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │      Bun Preload Plugin     │
                    │                             │
                    │  1. Transform import attr   │
                    │  2. Generate proxy module   │
                    │  3. Brand component type    │
                    └──────────────┬──────────────┘
                                   │
      ┌────────────────────────────┼────────────────────────────┐
      │                            │                            │
      ▼                            ▼                            ▼
┌───────────┐             ┌────────────────┐           ┌──────────────┐
│ Baseline  │             │  SQLite Store  │           │  VCS Overlay │
│ (Original)│             │                │           │    Repo      │
│           │             │ - versions     │           │              │
│ auth.tsx  │             │ - active_id    │           │ .smithers/   │
│           │             │ - analyses     │           │ supersmithers│
└───────────┘             └────────────────┘           │ /vcs/        │
                                   │                   └──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │    SuperSmithers Runtime    │
                    │                             │
                    │  Observer → Analyzer →      │
                    │  Rewriter → Validator →     │
                    │  Applier                    │
                    └─────────────────────────────┘
```

### Key Design Decisions

1. **Import Attribute Marking**
   - **Rationale**: Static imports with `with { supersmithers: "scope" }` attribute provide best DX and type safety
   - **Alternatives Considered**: Dynamic import wrappers (worse ergonomics), HOC wrappers (breaks tree analysis)

2. **Overlay-Only Rewrites**
   - **Rationale**: Never modify original source; store rewrites as versioned overlays
   - **Alternatives Considered**: In-place rewrites (dangerous, loses history)

3. **VCS-Backed Versioning**
   - **Rationale**: Use jj (preferred) or git to version overlays for rollback and auditability
   - **Alternatives Considered**: SQLite-only (loses diffability)

4. **Branded Component Types**
   - **Rationale**: TypeScript branded types ensure only managed components pass to SuperSmithers
   - **Alternatives Considered**: Runtime checks only (worse DX)

### API Design

#### Types

```tsx
// Branded component type
declare const SUPERSMITHERS_BRAND: unique symbol

export type SupersmithersManagedComponent<P = {}> =
  React.ComponentType<P> & {
    [SUPERSMITHERS_BRAND]: SupersmithersModuleMeta
  }

export interface SupersmithersModuleMeta {
  scope: string
  moduleAbsPath: string
  exportName: 'default' | string
  moduleHash: string
}

export interface SuperSmithersProps<P> {
  /** Must be a branded managed component from import attribute */
  plan: SupersmithersManagedComponent<P>
  
  /** Props forwarded to plan component */
  planProps?: P

  /** Observation triggers */
  observeOn?: ('iteration' | 'error' | 'stall' | 'complete')[]
  observeInterval?: number

  /** Rewrite conditions */
  rewriteOn?: {
    errors?: boolean
    stalls?: boolean
    performance?: boolean
    custom?: (ctx: SuperSmithersContext) => boolean | Promise<boolean>
  }

  /** Rewrite configuration */
  rewriteModel?: 'haiku' | 'sonnet' | 'opus'
  rewriteSystemPrompt?: string
  maxRewrites?: number
  rewriteCooldown?: number

  /** Approval workflow */
  requireApproval?: boolean
  onRewriteProposed?: (proposal: RewriteProposal) => void
  onRewriteApplied?: (result: RewriteResult) => void
  onError?: (error: Error) => void
}
```

#### Usage Example

```tsx
#!/usr/bin/env bun
import { SmithersProvider, SuperSmithers } from 'smithers/orchestrator'
import { createSmithersDB } from 'smithers/db'
import { createSmithersRoot } from 'smithers'

// Import attribute marks this as a managed hot boundary
import AuthPlan from "./plans/authPlan.tsx" with { supersmithers: "auth" }

const db = createSmithersDB({ path: '.smithers/self-heal.db' })
const executionId = db.execution.start('Self-healing auth', 'workflow.tsx')

function App() {
  return (
    <SmithersProvider db={db} executionId={executionId} maxIterations={100}>
      <SuperSmithers
        plan={AuthPlan}
        rewriteOn={{ errors: true, stalls: true }}
        rewriteModel="opus"
        maxRewrites={3}
        rewriteCooldown={60_000}
        onRewriteApplied={(r) => console.log('[rewrite]', r.summary)}
      >
        <AuthPlan />
      </SuperSmithers>
    </SmithersProvider>
  )
}

const root = createSmithersRoot()
await root.mount(App)
db.close()
```

## Implementation Plan

### Phase 1: Plugin + Proxy Infrastructure

**Goal**: Bun preload plugin transforms import attributes into proxy modules with branded types.

**Files to Create:**

- `src/supersmithers/plugin.ts` - Bun preload plugin
- `src/supersmithers/runtime.ts` - Proxy creation and loading
- `src/supersmithers/types.ts` - TypeScript types and brands
- `src/supersmithers/index.ts` - Public exports

**src/supersmithers/types.ts:**

```tsx
import type { ComponentType } from 'react'

declare const SUPERSMITHERS_BRAND: unique symbol

export type SupersmithersManagedComponent<P = {}> =
  ComponentType<P> & {
    [SUPERSMITHERS_BRAND]: SupersmithersModuleMeta
  }

export interface SupersmithersModuleMeta {
  scope: string
  moduleAbsPath: string
  exportName: 'default' | string
  moduleHash: string
}

export interface SuperSmithersContext {
  executionId: string
  iteration: number
  treeXml: string
  recentFrames: RenderFrameSnapshot[]
  metrics: SuperSmithersMetrics
  recentErrors: SuperSmithersErrorEvent[]
  rewriteHistory: RewriteHistorySummary
  sourceFile: string
  trigger: SuperSmithersTriggerReason
}

export type SuperSmithersTriggerReason =
  | 'interval' | 'iteration' | 'error' | 'stall' | 'complete' | 'manual'

export interface SuperSmithersMetrics {
  iteration: number
  runningTasks: number
  completedTasks: number
  failedTasks: number
  agentCalls: number
  tokensInput: number
  tokensOutput: number
  durationMsTotal: number
  secondsSinceLastProgress: number
  isStalled: boolean
}

export interface SuperSmithersErrorEvent {
  at: string
  kind: 'task' | 'agent' | 'provider' | 'unknown'
  message: string
  stack?: string
  signature: string
}

export interface RenderFrameSnapshot {
  id: string
  iteration: number
  createdAt: string
  xml: string
}

export interface RewriteHistorySummary {
  rewriteCount: number
  lastRewriteAt?: string
  lastOutcome?: 'improved' | 'worse' | 'neutral' | 'unknown'
  cooldownUntil?: string
  seenCodeHashes: string[]
}
```

**src/supersmithers/plugin.ts:**

```tsx
import { plugin } from 'bun'
import * as path from 'node:path'
import * as crypto from 'node:crypto'

/**
 * Bun preload plugin for SuperSmithers.
 * Transforms: import X from "./path" with { supersmithers: "scope" }
 * Into: import X from "supersmithers-proxy:./path#default?scope=scope"
 */
plugin({
  name: 'supersmithers',
  setup(build) {
    // Namespace for proxy modules
    const PROXY_NAMESPACE = 'supersmithers-proxy'

    // Transform source files to rewrite import attributes
    build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async (args) => {
      const contents = await Bun.file(args.path).text()
      
      // Skip if no supersmithers imports
      if (!contents.includes('supersmithers:')) {
        return
      }

      // Transform imports with supersmithers attribute
      // Pattern: import X from "path" with { supersmithers: "scope" }
      const transformed = contents.replace(
        /import\s+(\w+)\s+from\s+(['"])([^'"]+)\2\s+with\s*\{\s*supersmithers:\s*(['"])(\w+)\4\s*\}/g,
        (match, binding, q1, specifier, q2, scope) => {
          const absPath = path.resolve(path.dirname(args.path), specifier)
          const hash = crypto.createHash('sha256').update(absPath).digest('hex').slice(0, 16)
          return `import ${binding} from "${PROXY_NAMESPACE}:${absPath}#default?scope=${scope}&hash=${hash}"`
        }
      )

      // Also handle named imports
      const transformed2 = transformed.replace(
        /import\s*\{\s*(\w+)\s*\}\s*from\s+(['"])([^'"]+)\2\s+with\s*\{\s*supersmithers:\s*(['"])(\w+)\4\s*\}/g,
        (match, binding, q1, specifier, q2, scope) => {
          const absPath = path.resolve(path.dirname(args.path), specifier)
          const hash = crypto.createHash('sha256').update(absPath).digest('hex').slice(0, 16)
          return `import { ${binding} } from "${PROXY_NAMESPACE}:${absPath}#${binding}?scope=${scope}&hash=${hash}"`
        }
      )

      if (transformed2 !== contents) {
        return { contents: transformed2, loader: 'tsx' }
      }
    })

    // Resolve proxy specifiers
    build.onResolve({ filter: /^supersmithers-proxy:/ }, (args) => {
      return {
        path: args.path.replace('supersmithers-proxy:', ''),
        namespace: PROXY_NAMESPACE,
      }
    })

    // Load proxy modules
    build.onLoad({ filter: /.*/, namespace: PROXY_NAMESPACE }, async (args) => {
      // Parse: /abs/path/to/module.tsx#exportName?scope=x&hash=y
      const [pathWithExport, query] = args.path.split('?')
      const [absPath, exportName] = pathWithExport.split('#')
      const params = new URLSearchParams(query)
      const scope = params.get('scope') ?? 'default'
      const hash = params.get('hash') ?? ''

      // Generate proxy module
      const contents = `
import { createSupersmithersProxy } from 'smithers-orchestrator/supersmithers/runtime'
import type * as OriginalModule from ${JSON.stringify(absPath)}

type ExportType = ${exportName === 'default' ? 'typeof OriginalModule["default"]' : `typeof OriginalModule["${exportName}"]`}
type Props = ExportType extends React.ComponentType<infer P> ? P : never

const Proxy = createSupersmithersProxy<Props>({
  scope: ${JSON.stringify(scope)},
  moduleAbsPath: ${JSON.stringify(absPath)},
  exportName: ${JSON.stringify(exportName)},
  moduleHash: ${JSON.stringify(hash)},
})

export ${exportName === 'default' ? 'default' : `{ Proxy as ${exportName} }`} Proxy
`

      return { 
        contents, 
        loader: 'tsx',
        resolveDir: path.dirname(absPath),
      }
    })
  },
})
```

**src/supersmithers/runtime.ts:**

```tsx
import type { ComponentType, ReactNode } from 'react'
import { useRef, useEffect } from 'react'
import { useQueryValue } from '../reactive-sqlite/index.js'
import { useSmithers } from '../components/SmithersProvider.js'
import type { SupersmithersManagedComponent, SupersmithersModuleMeta } from './types.js'

declare const SUPERSMITHERS_BRAND: unique symbol

interface ProxyState {
  Component: ComponentType<any> | null
  revision: string | null
  loading: boolean
  error: Error | null
}

/**
 * Create a proxy component that can swap between baseline and overlay modules.
 */
export function createSupersmithersProxy<P>(
  meta: SupersmithersModuleMeta
): SupersmithersManagedComponent<P> {
  const Proxy = function SuperSmithersProxy(props: P): ReactNode {
    const { db, reactiveDb, executionId } = useSmithers()
    const stateRef = useRef<ProxyState>({
      Component: null,
      revision: null,
      loading: true,
      error: null,
    })
    const mountedRef = useRef(false)

    // Query active version from DB
    const { data: activeVersionId } = useQueryValue<string>(
      reactiveDb,
      `SELECT active_version_id FROM supersmithers_active_overrides WHERE module_hash = ?`,
      [meta.moduleHash],
      { skip: reactiveDb.isClosed }
    )

    // Load appropriate module
    useEffect(() => {
      mountedRef.current = true
      
      const load = async () => {
        try {
          let mod: any
          
          if (activeVersionId) {
            // Load overlay version
            const version = db.db.queryOne<{ overlay_rel_path: string }>(
              `SELECT overlay_rel_path FROM supersmithers_versions WHERE version_id = ?`,
              [activeVersionId]
            )
            if (version) {
              const overlayPath = `.smithers/supersmithers/vcs/${version.overlay_rel_path}`
              mod = await import(overlayPath)
            }
          }
          
          if (!mod) {
            // Load baseline
            mod = await import(meta.moduleAbsPath)
          }

          if (!mountedRef.current) return

          const Component = meta.exportName === 'default' 
            ? mod.default 
            : mod[meta.exportName]

          stateRef.current = {
            Component,
            revision: activeVersionId ?? 'baseline',
            loading: false,
            error: null,
          }
        } catch (err) {
          if (!mountedRef.current) return
          stateRef.current = {
            ...stateRef.current,
            loading: false,
            error: err instanceof Error ? err : new Error(String(err)),
          }
        }
      }

      void load()

      return () => {
        mountedRef.current = false
      }
    }, [activeVersionId, db, meta.moduleAbsPath, meta.exportName])

    const { Component, loading, error } = stateRef.current

    if (loading) {
      return <supersmithers-loading scope={meta.scope} moduleHash={meta.moduleHash} />
    }

    if (error) {
      return (
        <supersmithers-error scope={meta.scope} moduleHash={meta.moduleHash}>
          {error.message}
        </supersmithers-error>
      )
    }

    if (!Component) {
      return <supersmithers-missing scope={meta.scope} moduleHash={meta.moduleHash} />
    }

    // Render with key = revision to force remount on version change
    return <Component key={activeVersionId ?? 'baseline'} {...props} />
  }

  // Brand the component
  ;(Proxy as any)[SUPERSMITHERS_BRAND] = meta

  return Proxy as SupersmithersManagedComponent<P>
}

/**
 * Type guard to check if a component is SuperSmithers-managed.
 */
export function isSupersmithersManaged(
  component: unknown
): component is SupersmithersManagedComponent<any> {
  return (
    typeof component === 'function' &&
    SUPERSMITHERS_BRAND in (component as any)
  )
}

/**
 * Get metadata from a managed component.
 */
export function getSupersmithersMeta(
  component: SupersmithersManagedComponent<any>
): SupersmithersModuleMeta {
  return (component as any)[SUPERSMITHERS_BRAND]
}
```

**Files to Modify:**

- `bunfig.toml` - Add preload for plugin
- `package.json` - Add export for supersmithers

**bunfig.toml changes:**

```diff
 # JSX configuration for running .tsx files directly
 jsx = "react-jsx"
 jsxImportSource = "react"

+[run]
+preload = ["smithers-orchestrator/supersmithers/register"]

 [install]
 auto = "fallback"
```

**Tests:**

```tsx
import { describe, it, expect } from 'bun:test'
import { createSupersmithersProxy, isSupersmithersManaged, getSupersmithersMeta } from './runtime'

describe('SuperSmithers Proxy', () => {
  it('creates branded component', () => {
    const Proxy = createSupersmithersProxy({
      scope: 'test',
      moduleAbsPath: '/path/to/module.tsx',
      exportName: 'default',
      moduleHash: 'abc123',
    })
    
    expect(isSupersmithersManaged(Proxy)).toBe(true)
    expect(getSupersmithersMeta(Proxy).scope).toBe('test')
  })
})
```

### Phase 2: Database Schema + VCS Integration

**Goal**: SQLite tables for version tracking + jj/git overlay repository.

**Files to Create:**

- `src/supersmithers/db.ts` - Database module
- `src/supersmithers/vcs.ts` - VCS operations

**Schema additions to src/db/schema.sql:**

```sql
-- ============================================================================
-- SUPERSMITHERS: Module Tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS supersmithers_modules (
  module_hash TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  module_abs_path TEXT NOT NULL,
  export_name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_supersmithers_modules_scope 
  ON supersmithers_modules(scope);

-- ============================================================================
-- SUPERSMITHERS: Version History
-- ============================================================================

CREATE TABLE IF NOT EXISTS supersmithers_versions (
  version_id TEXT PRIMARY KEY,
  module_hash TEXT NOT NULL,
  parent_version_id TEXT,
  created_at TEXT NOT NULL,
  
  -- Code payload
  code_tsx TEXT NOT NULL,
  code_sha256 TEXT NOT NULL,
  
  -- File location
  overlay_rel_path TEXT NOT NULL,
  
  -- Provenance
  trigger TEXT NOT NULL,
  analysis_json TEXT,
  metrics_json TEXT,
  
  -- VCS tracking
  vcs_kind TEXT NOT NULL,
  vcs_commit_id TEXT NOT NULL,
  
  FOREIGN KEY (module_hash) REFERENCES supersmithers_modules(module_hash)
);

CREATE INDEX IF NOT EXISTS idx_supersmithers_versions_module 
  ON supersmithers_versions(module_hash);
CREATE INDEX IF NOT EXISTS idx_supersmithers_versions_created 
  ON supersmithers_versions(created_at DESC);

-- ============================================================================
-- SUPERSMITHERS: Active Overrides
-- ============================================================================

CREATE TABLE IF NOT EXISTS supersmithers_active_overrides (
  module_hash TEXT PRIMARY KEY,
  active_version_id TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (module_hash) REFERENCES supersmithers_modules(module_hash),
  FOREIGN KEY (active_version_id) REFERENCES supersmithers_versions(version_id)
);

-- ============================================================================
-- SUPERSMITHERS: Analysis History
-- ============================================================================

CREATE TABLE IF NOT EXISTS supersmithers_analyses (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  module_hash TEXT NOT NULL,
  iteration INTEGER NOT NULL,
  trigger TEXT NOT NULL,
  tree_xml TEXT NOT NULL,
  metrics_json TEXT,
  errors_json TEXT,
  analysis_result_json TEXT NOT NULL,
  rewrite_recommended INTEGER NOT NULL DEFAULT 0,
  recommendation TEXT,
  model TEXT,
  tokens_input INTEGER,
  tokens_output INTEGER,
  duration_ms INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (execution_id) REFERENCES executions(id),
  FOREIGN KEY (module_hash) REFERENCES supersmithers_modules(module_hash)
);

CREATE INDEX IF NOT EXISTS idx_supersmithers_analyses_exec 
  ON supersmithers_analyses(execution_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supersmithers_analyses_module 
  ON supersmithers_analyses(module_hash, created_at DESC);
```

**src/supersmithers/vcs.ts:**

```tsx
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

const VCS_DIR = '.smithers/supersmithers/vcs'

export type VcsKind = 'jj' | 'git'

export interface VcsInfo {
  kind: VcsKind
  repoPath: string
}

/**
 * Initialize the overlay VCS repository.
 * Prefers jj if available, falls back to git.
 */
export async function initOverlayRepo(): Promise<VcsInfo> {
  const repoPath = path.resolve(VCS_DIR)
  await fs.mkdir(repoPath, { recursive: true })

  // Check if already initialized
  const jjExists = await fs.access(path.join(repoPath, '.jj')).then(() => true).catch(() => false)
  const gitExists = await fs.access(path.join(repoPath, '.git')).then(() => true).catch(() => false)

  if (jjExists || gitExists) {
    return { kind: jjExists ? 'jj' : 'git', repoPath }
  }

  // Try jj first
  const jjAvailable = await Bun.$`which jj`.quiet().then(() => true).catch(() => false)

  if (jjAvailable) {
    await Bun.$`jj git init ${repoPath}`.quiet()
    return { kind: 'jj', repoPath }
  }

  // Fall back to git
  await Bun.$`git init ${repoPath}`.quiet()
  return { kind: 'git', repoPath }
}

/**
 * Write an overlay file and commit it.
 */
export async function writeAndCommit(
  vcs: VcsInfo,
  relPath: string,
  content: string,
  message: string
): Promise<string> {
  const absPath = path.join(vcs.repoPath, relPath)
  await fs.mkdir(path.dirname(absPath), { recursive: true })
  await fs.writeFile(absPath, content, 'utf8')

  if (vcs.kind === 'jj') {
    await Bun.$`jj commit -m ${message}`.cwd(vcs.repoPath).quiet()
    const result = await Bun.$`jj log -r @ --no-graph -T 'commit_id'`.cwd(vcs.repoPath).text()
    return result.trim()
  } else {
    await Bun.$`git add -A`.cwd(vcs.repoPath).quiet()
    await Bun.$`git commit -m ${message}`.cwd(vcs.repoPath).quiet()
    const result = await Bun.$`git rev-parse HEAD`.cwd(vcs.repoPath).text()
    return result.trim()
  }
}

/**
 * Get current commit hash.
 */
export async function getCurrentCommit(vcs: VcsInfo): Promise<string> {
  if (vcs.kind === 'jj') {
    const result = await Bun.$`jj log -r @ --no-graph -T 'commit_id'`.cwd(vcs.repoPath).text()
    return result.trim()
  } else {
    const result = await Bun.$`git rev-parse HEAD`.cwd(vcs.repoPath).text()
    return result.trim()
  }
}
```

### Phase 3: SuperSmithers Component

**Goal**: Main component that observes, analyzes, and triggers rewrites.

**Files to Create:**

- `src/supersmithers/SuperSmithers.tsx` - Main component
- `src/supersmithers/observer.ts` - Metrics collection
- `src/supersmithers/analyzer.ts` - Claude analysis
- `src/supersmithers/rewriter.ts` - Claude rewrite generation

**src/supersmithers/SuperSmithers.tsx:**

```tsx
import { type ReactNode, useRef, Children } from 'react'
import { useSmithers } from '../components/SmithersProvider.js'
import { useQueryValue } from '../reactive-sqlite/index.js'
import { useMount, useEffectOnValueChange, useUnmount } from '../reconciler/hooks.js'
import { 
  isSupersmithersManaged, 
  getSupersmithersMeta,
  type SupersmithersManagedComponent 
} from './runtime.js'
import type { SuperSmithersProps, SuperSmithersContext } from './types.js'
import { collectMetrics } from './observer.js'
import { runAnalysis } from './analyzer.js'
import { runRewrite, applyRewrite, validateRewrite } from './rewriter.js'
import { initOverlayRepo, writeAndCommit } from './vcs.js'

export function SuperSmithers<P>(props: SuperSmithersProps<P>): ReactNode {
  const { db, reactiveDb, executionId, ralphCount } = useSmithers()

  // Validate plan prop
  if (!isSupersmithersManaged(props.plan)) {
    throw new Error(
      '<SuperSmithers> requires a plan prop that was imported with { supersmithers: "scope" } attribute'
    )
  }

  const meta = getSupersmithersMeta(props.plan)
  const inFlightRef = useRef(false)
  const lastRewriteAtRef = useRef<number>(0)

  // Query rewrite history
  const { data: rewriteCount } = useQueryValue<number>(
    reactiveDb,
    `SELECT COUNT(*) FROM supersmithers_versions WHERE module_hash = ?`,
    [meta.moduleHash]
  )

  // Initialize VCS repo on mount
  const vcsRef = useRef<Awaited<ReturnType<typeof initOverlayRepo>> | null>(null)
  useMount(() => {
    void initOverlayRepo().then(vcs => {
      vcsRef.current = vcs
    })
  })

  // Observe on iteration change
  useEffectOnValueChange(ralphCount, () => {
    if (props.observeOn?.includes('iteration') ?? true) {
      void maybeAnalyzeAndRewrite('iteration')
    }
  }, [props.observeOn])

  // Observe on interval
  useMount(() => {
    const interval = props.observeInterval ?? 10_000
    if (!props.observeOn?.includes('interval')) return

    const timer = setInterval(() => {
      void maybeAnalyzeAndRewrite('interval')
    }, interval)

    return () => clearInterval(timer)
  })

  async function maybeAnalyzeAndRewrite(trigger: SuperSmithersContext['trigger']) {
    if (inFlightRef.current) return
    if ((rewriteCount ?? 0) >= (props.maxRewrites ?? 3)) return

    const cooldown = props.rewriteCooldown ?? 60_000
    if (Date.now() - lastRewriteAtRef.current < cooldown) return

    inFlightRef.current = true

    try {
      // Collect context
      const frames = db.renderFrames.list().slice(-10)
      const latestXml = frames[frames.length - 1]?.tree_xml ?? ''
      const metrics = collectMetrics(db, executionId, ralphCount)
      const errors = collectErrors(db, executionId)

      const context: SuperSmithersContext = {
        executionId,
        iteration: ralphCount,
        treeXml: latestXml,
        recentFrames: frames.map(f => ({
          id: f.id,
          iteration: f.ralph_count,
          createdAt: f.created_at,
          xml: f.tree_xml,
        })),
        metrics,
        recentErrors: errors,
        rewriteHistory: {
          rewriteCount: rewriteCount ?? 0,
          seenCodeHashes: [],
        },
        sourceFile: meta.moduleAbsPath,
        trigger,
      }

      // Check rewrite conditions
      const shouldRewrite = await checkRewriteConditions(props, context)
      if (!shouldRewrite) return

      // Run analysis
      const analysis = await runAnalysis({
        context,
        model: props.rewriteModel ?? 'sonnet',
        baselineCode: await Bun.file(meta.moduleAbsPath).text(),
      })

      // Store analysis
      db.db.run(
        `INSERT INTO supersmithers_analyses 
         (id, execution_id, module_hash, iteration, trigger, tree_xml, metrics_json, errors_json, analysis_result_json, rewrite_recommended, recommendation, model, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          crypto.randomUUID(),
          executionId,
          meta.moduleHash,
          ralphCount,
          trigger,
          latestXml,
          JSON.stringify(metrics),
          JSON.stringify(errors),
          JSON.stringify(analysis),
          analysis.rewrite.recommended ? 1 : 0,
          analysis.rewrite.goals.join('; '),
          props.rewriteModel ?? 'sonnet',
        ]
      )

      if (!analysis.rewrite.recommended) return

      // Generate rewrite
      const baselineCode = await Bun.file(meta.moduleAbsPath).text()
      const proposal = await runRewrite({
        context,
        analysis,
        baselineCode,
        model: props.rewriteModel ?? 'opus',
        systemPrompt: props.rewriteSystemPrompt,
      })

      props.onRewriteProposed?.(proposal)

      // Validate
      const validation = await validateRewrite(proposal.newCode, meta.moduleAbsPath)
      if (!validation.valid) {
        console.error('[SuperSmithers] Validation failed:', validation.errors)
        return
      }

      // Write overlay and commit
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

      // Store version
      const codeSha = Bun.hash(proposal.newCode).toString(16)
      db.db.run(
        `INSERT INTO supersmithers_versions
         (version_id, module_hash, parent_version_id, created_at, code_tsx, code_sha256, overlay_rel_path, trigger, analysis_json, metrics_json, vcs_kind, vcs_commit_id)
         VALUES (?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          versionId,
          meta.moduleHash,
          null, // TODO: track parent
          proposal.newCode,
          codeSha,
          relPath,
          trigger,
          JSON.stringify(analysis),
          JSON.stringify(metrics),
          vcs.kind,
          commitId,
        ]
      )

      // Activate
      db.db.run(
        `INSERT OR REPLACE INTO supersmithers_active_overrides (module_hash, active_version_id, updated_at)
         VALUES (?, ?, datetime('now'))`,
        [meta.moduleHash, versionId]
      )

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

  // Render children (the plan component)
  return (
    <supersmithers
      scope={meta.scope}
      moduleHash={meta.moduleHash}
      rewriteCount={rewriteCount ?? 0}
      maxRewrites={props.maxRewrites ?? 3}
    >
      {props.children}
    </supersmithers>
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

function collectErrors(db: any, executionId: string): SuperSmithersContext['recentErrors'] {
  const agents = db.db.query<{ error: string; created_at: string }>(
    `SELECT error, created_at FROM agents WHERE execution_id = ? AND status = 'failed' ORDER BY created_at DESC LIMIT 10`,
    [executionId]
  )
  return agents
    .filter(a => a.error)
    .map(a => ({
      at: a.created_at,
      kind: 'agent' as const,
      message: a.error,
      signature: Bun.hash(a.error).toString(16),
    }))
}
```

### Phase 4: Claude Prompts + Validation

**Goal**: Analysis and rewrite prompts, plus validation pipeline.

**src/supersmithers/analyzer.ts:**

```tsx
import { executeClaudeCLI } from '../components/agents/ClaudeCodeCLI.js'
import type { SuperSmithersContext, ClaudeModel } from './types.js'

const ANALYSIS_SYSTEM_PROMPT = `You are SuperSmithers Analyst. You diagnose Smithers orchestration plans.

Given:
- Tree XML frames showing the plan state
- Metrics (tokens, duration, stalls)
- Recent errors

Decide whether a rewrite is recommended.

Output JSON ONLY matching this schema:
{
  "summary": "string",
  "diagnosis": [{ "category": "error|stall|performance|plan-smell", "finding": "string", "severity": "low|medium|high" }],
  "rewrite": {
    "recommended": boolean,
    "goals": ["string"],
    "changes": ["string"],
    "risk": "low|medium|high",
    "confidence": 0-1
  }
}

No markdown, no extra keys.`

export interface AnalysisResult {
  summary: string
  diagnosis: Array<{
    category: 'error' | 'stall' | 'performance' | 'plan-smell'
    finding: string
    severity: 'low' | 'medium' | 'high'
  }>
  rewrite: {
    recommended: boolean
    goals: string[]
    changes: string[]
    risk: 'low' | 'medium' | 'high'
    confidence: number
  }
}

export async function runAnalysis(opts: {
  context: SuperSmithersContext
  model: ClaudeModel
  baselineCode: string
}): Promise<AnalysisResult> {
  const prompt = `Analyze this Smithers orchestration plan:

## Current Source Code
\`\`\`tsx
${opts.baselineCode}
\`\`\`

## Recent Tree XML Frames
${opts.context.recentFrames.slice(-3).map(f => `### Iteration ${f.iteration}\n\`\`\`xml\n${f.xml}\n\`\`\``).join('\n\n')}

## Metrics
${JSON.stringify(opts.context.metrics, null, 2)}

## Recent Errors
${opts.context.recentErrors.map(e => `- [${e.at}] ${e.message}`).join('\n')}

## Trigger
Analysis triggered by: ${opts.context.trigger}

Provide your analysis as JSON.`

  const result = await executeClaudeCLI({
    prompt,
    model: opts.model,
    systemPrompt: ANALYSIS_SYSTEM_PROMPT,
    maxTurns: 1,
  })

  return JSON.parse(result.output) as AnalysisResult
}
```

**src/supersmithers/rewriter.ts:**

```tsx
import { executeClaudeCLI } from '../components/agents/ClaudeCodeCLI.js'
import type { SuperSmithersContext, ClaudeModel, AnalysisResult } from './types.js'

const REWRITE_SYSTEM_PROMPT = `You are SuperSmithers, an expert engineer for the Smithers React/JSX orchestration framework.

Your job is to rewrite the provided TypeScript/TSX plan module to fix the diagnosed issues.

CRITICAL CONSTRAINTS:
1) Do NOT use React useState. Use SQLite (db.state, db.tasks) or useRef for state.
2) Do NOT remove the component's exports or change its interface.
3) Prefer minimal diffs: change only what is necessary.
4) Ensure the result compiles.

OUTPUT:
Return JSON ONLY:
{
  "summary": "string",
  "rationale": "string",
  "risk": "low|medium|high",
  "newCode": "// full TSX file content"
}

No markdown, no extra keys.`

export interface RewriteProposal {
  summary: string
  rationale: string
  risk: 'low' | 'medium' | 'high'
  newCode: string
}

export async function runRewrite(opts: {
  context: SuperSmithersContext
  analysis: AnalysisResult
  baselineCode: string
  model: ClaudeModel
  systemPrompt?: string
}): Promise<RewriteProposal> {
  const prompt = `Rewrite this Smithers plan module based on the analysis:

## Analysis
${JSON.stringify(opts.analysis, null, 2)}

## Current Source Code
\`\`\`tsx
${opts.baselineCode}
\`\`\`

## Goals
${opts.analysis.rewrite.goals.map((g, i) => `${i + 1}. ${g}`).join('\n')}

Generate the improved version.`

  const result = await executeClaudeCLI({
    prompt,
    model: opts.model,
    systemPrompt: opts.systemPrompt ?? REWRITE_SYSTEM_PROMPT,
    maxTurns: 1,
  })

  return JSON.parse(result.output) as RewriteProposal
}

export async function validateRewrite(
  code: string,
  originalPath: string
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = []

  // Check for useState (forbidden in Smithers plans)
  if (code.includes('useState(') || code.includes('useState<')) {
    errors.push('Code contains useState, which is forbidden in Smithers plans')
  }

  // Try to parse as TSX
  try {
    // Write to temp file and run Bun's transpiler
    const tempPath = `/tmp/supersmithers-validate-${Date.now()}.tsx`
    await Bun.write(tempPath, code)
    await Bun.$`bun build ${tempPath} --no-bundle`.quiet()
    await Bun.$`rm ${tempPath}`.quiet()
  } catch (err) {
    errors.push(`Syntax error: ${err instanceof Error ? err.message : String(err)}`)
  }

  return { valid: errors.length === 0, errors }
}
```

## Acceptance Criteria

- [ ] **AC1**: Import attribute `with { supersmithers: "scope" }` works and transforms to proxy
- [ ] **AC2**: `<SuperSmithers plan={X}>` only accepts branded component types
- [ ] **AC3**: Proxy loads baseline by default, overlay when active_version_id is set
- [ ] **AC4**: Rewrites are stored in SQLite and committed to VCS (jj/git)
- [ ] **AC5**: Original source files are never modified
- [ ] **AC6**: Subtree remounts correctly on version change (keyed)
- [ ] **AC7**: maxRewrites and rewriteCooldown are enforced
- [ ] **AC8**: Rollback works by setting active_version_id to previous version

## Testing Strategy

### Unit Tests

```tsx
describe('SuperSmithers Plugin', () => {
  it('transforms import attribute to proxy specifier', () => {
    const input = 'import X from "./plan.tsx" with { supersmithers: "test" }'
    const output = transform(input, '/app/index.tsx')
    expect(output).toContain('supersmithers-proxy:')
  })
})

describe('SuperSmithers Runtime', () => {
  it('creates branded proxy component', () => {
    const Proxy = createSupersmithersProxy({ scope: 'test', ... })
    expect(isSupersmithersManaged(Proxy)).toBe(true)
  })

  it('loads baseline when no active override', async () => {
    // Test with mock DB returning null active_version_id
  })

  it('loads overlay when active override exists', async () => {
    // Test with mock DB returning a version_id
  })
})
```

### Integration Tests

```tsx
describe('SuperSmithers E2E', () => {
  it('detects errors and generates rewrite', async () => {
    // Set up a plan that fails repeatedly
    // Verify analysis is stored
    // Verify rewrite is generated and committed
    // Verify active override is set
  })

  it('respects maxRewrites limit', async () => {
    // Generate 3 rewrites
    // Verify 4th is blocked
  })

  it('respects cooldown period', async () => {
    // Generate rewrite
    // Try to rewrite again immediately
    // Verify blocked
  })
})
```

### Manual Testing

1. **Basic hot reload**: 
   - Create a plan with intentional errors
   - Run with SuperSmithers wrapper
   - Observe rewrite proposal and application
   - Verify overlay file exists in .smithers/supersmithers/vcs

2. **Rollback**:
   - Apply multiple rewrites
   - Manually set active_version_id to earlier version
   - Verify plan uses earlier version

## Files Summary

| Action | File Path | Description |
|--------|-----------|-------------|
| CREATE | `src/supersmithers/types.ts` | Type definitions and brands |
| CREATE | `src/supersmithers/plugin.ts` | Bun preload plugin |
| CREATE | `src/supersmithers/runtime.ts` | Proxy component factory |
| CREATE | `src/supersmithers/db.ts` | Database module |
| CREATE | `src/supersmithers/vcs.ts` | VCS operations |
| CREATE | `src/supersmithers/SuperSmithers.tsx` | Main component |
| CREATE | `src/supersmithers/observer.ts` | Metrics collection |
| CREATE | `src/supersmithers/analyzer.ts` | Claude analysis |
| CREATE | `src/supersmithers/rewriter.ts` | Claude rewrite generation |
| CREATE | `src/supersmithers/index.ts` | Public exports |
| MODIFY | `src/db/schema.sql` | Add supersmithers tables |
| MODIFY | `bunfig.toml` | Add preload registration |
| MODIFY | `package.json` | Add supersmithers export |

## Open Questions

- [ ] **Q1**: How to handle tasks running when rewrite is applied?
  - **Impact**: Old tasks may continue running after subtree remounts
  - **Resolution**: Add scope_rev to task tracking; cancel old scope on remount

- [ ] **Q2**: Should rewrite validation include typecheck?
  - **Impact**: Slower but safer
  - **Resolution**: Make it configurable with default off for speed

- [ ] **Q3**: How to handle approval workflow integration?
  - **Impact**: Production deployments may require human approval
  - **Resolution**: Integrate with existing `<Human>` component via DB

## References

- [Smithers Provider](../src/components/SmithersProvider.tsx)
- [Smithers Subagent](../src/components/Smithers.tsx)
- [Bun Plugin API](https://bun.sh/docs/runtime/plugins)
- [React Fast Refresh](https://reactnative.dev/docs/fast-refresh)
- [Jujutsu VCS](https://martinvonz.github.io/jj/)
