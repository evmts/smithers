export { composeMiddleware, applyMiddleware } from './compose.js'
export type { SmithersMiddleware, ClaudeExecutionParams } from './types.js'

export { extractReasoningMiddleware } from './extract-reasoning.js'
export type { ExtractReasoningOptions } from './extract-reasoning.js'

export { extractJsonMiddleware } from './extract-json.js'
export type { ExtractJsonOptions } from './extract-json.js'

export { loggingMiddleware } from './logging.js'
export type { LogEntry, LogLevel, LoggingMiddlewareOptions } from './logging.js'

export { retryMiddleware } from './retry.js'
export type { RetryBackoff, RetryMiddlewareOptions } from './retry.js'

export { cachingMiddleware, LRUCache } from './caching.js'
export type { CacheStore, CachingMiddlewareOptions } from './caching.js'

export { validationMiddleware, ValidationError } from './validation.js'
export type { ValidationMiddlewareOptions } from './validation.js'

export { costTrackingMiddleware } from './cost-tracking.js'
export type { CostTrackingOptions } from './cost-tracking.js'

export { redactSecretsMiddleware } from './redact-secrets.js'
export type { RedactSecretsOptions } from './redact-secrets.js'

export { timeoutMiddleware } from './timeout.js'
export type { TimeoutMiddlewareOptions } from './timeout.js'

export { rateLimitingMiddleware as simpleRateLimitingMiddleware } from './rate-limiting.js'
export type { RateLimitingOptions as SimpleRateLimitingOptions } from './rate-limiting.js'
