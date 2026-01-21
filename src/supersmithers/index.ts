// SuperSmithers - Self-Rewriting Plan Modules
// Enables orchestration plans to observe execution and rewrite themselves

// Main component
export { SuperSmithers } from './SuperSmithers.js'

// Types
export type {
  SupersmithersManagedComponent,
  SupersmithersModuleMeta,
  SuperSmithersContext,
  SuperSmithersTriggerReason,
  SuperSmithersProps,
  SuperSmithersMetrics,
  SuperSmithersErrorEvent,
  RenderFrameSnapshot,
  RewriteHistorySummary,
  RewriteProposal,
  RewriteResult,
  AnalysisResult,
  ClaudeModel,
} from './types.js'

// Runtime utilities (for plugin and advanced use)
export {
  createSupersmithersProxy,
  isSupersmithersManaged,
  getSupersmithersMeta,
  generateModuleHash,
  loadOverlayComponent,
  supersmithers,
} from './runtime.js'

// Database helpers
export { createSuperSmithersDBHelpers } from './db.js'

// VCS operations
export {
  initOverlayRepo,
  writeAndCommit,
  getOverlayContent,
  rollbackToCommit,
  type SuperSmithersVCS,
} from './vcs.js'

// Observer utilities
export {
  collectMetrics,
  collectErrors,
  detectStall,
} from './observer.js'

// Analysis and rewriting
export { runAnalysis } from './analyzer.js'
export { runRewrite, validateRewrite } from './rewriter.js'
