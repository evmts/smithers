import type { SmithersNode } from '../core/types.js'
import type {
  DebugOptions,
  PluNodeSnapshot,
  SmithersDebugEvent,
  SmithersDebugEventType,
  TimelineEntry,
} from './types.js'

/**
 * Default debug options
 */
const DEFAULT_OPTIONS: Required<DebugOptions> = {
  enabled: false,
  onEvent: () => {},
  includeTreeSnapshots: false,
  eventFilter: [],
}

/**
 * Collects and manages debug events during execution
 */
export class DebugCollector {
  private events: SmithersDebugEvent[] = []
  private options: Required<DebugOptions>
  private currentFrame: number = 0

  constructor(options: DebugOptions = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
      onEvent: options.onEvent ?? DEFAULT_OPTIONS.onEvent,
      eventFilter: options.eventFilter ?? DEFAULT_OPTIONS.eventFilter,
    }
  }

  /**
   * Check if debug collection is enabled
   */
  get isEnabled(): boolean {
    return this.options.enabled
  }

  /**
   * Check if tree snapshots are enabled
   */
  get includeTreeSnapshots(): boolean {
    return this.options.includeTreeSnapshots
  }

  /**
   * Get the onEvent callback
   */
  get onEvent(): ((event: SmithersDebugEvent) => void) | undefined {
    return this.options.onEvent
  }

  /**
   * Set the current frame number for event timestamps
   */
  setFrame(frame: number): void {
    this.currentFrame = frame
  }

  /**
   * Emit a debug event
   *
   * Events are enriched with timestamp and frame number before being stored and emitted.
   * Events can be filtered by type if eventFilter is specified.
   *
   * @param event - Event data without timestamp/frameNumber (will be added automatically)
   *
   * TypeScript note: Due to the complexity of correctly typing Omit on union types,
   * this signature provides basic type checking. For stricter validation at specific
   * call sites, consider using `satisfies` with the specific event type.
   */
  emit(
    event:
      | Omit<SmithersDebugEvent, 'timestamp' | 'frameNumber'>
      | { type: SmithersDebugEventType; [key: string]: unknown }
  ): void {
    if (!this.options.enabled) return

    // Filter events if filter is specified
    if (
      this.options.eventFilter.length > 0 &&
      !this.options.eventFilter.includes(event.type)
    ) {
      return
    }

    const fullEvent: SmithersDebugEvent = {
      ...event,
      timestamp: Date.now(),
      frameNumber: this.currentFrame,
    } as SmithersDebugEvent

    this.events.push(fullEvent)
    this.options.onEvent(fullEvent)
  }

  /**
   * Create a lightweight snapshot of a PluNode tree
   *
   * Filters out functions and non-serializable data for safe export.
   */
  createTreeSnapshot(node: SmithersNode, path: string = ''): PluNodeSnapshot {
    const nodeName = node.props.name ? `${node.type}[${node.props.name}]` : node.type
    const currentPath = path ? `${path} > ${nodeName}` : nodeName

    // Filter out function props for serialization
    const filteredProps: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(node.props)) {
      if (typeof value !== 'function' && !key.startsWith('_') && key !== 'children') {
        // Skip large values to keep snapshot manageable
        if (typeof value === 'string' && value.length > 500) {
          filteredProps[key] = `[string, ${value.length} chars]`
        } else if (Array.isArray(value) && value.length > 10) {
          filteredProps[key] = `[array, ${value.length} items]`
        } else {
          filteredProps[key] = value
        }
      }
    }

    return {
      type: node.type,
      path: currentPath,
      props: filteredProps,
      executionStatus: node._execution?.status,
      contentHash: node._execution?.contentHash?.substring(0, 20),
      children: node.children.map((child, i) =>
        this.createTreeSnapshot(child, currentPath)
      ),
    }
  }

  /**
   * Get all collected events
   */
  getEvents(): SmithersDebugEvent[] {
    return [...this.events]
  }

  /**
   * Get events filtered by type
   */
  getEventsByType<T extends SmithersDebugEventType>(
    type: T
  ): Extract<SmithersDebugEvent, { type: T }>[] {
    return this.events.filter((e) => e.type === type) as Extract<
      SmithersDebugEvent,
      { type: T }
    >[]
  }

  /**
   * Get execution timeline (ordered events with relative timing)
   */
  getTimeline(): TimelineEntry[] {
    if (this.events.length === 0) return []

    const startTime = this.events[0].timestamp
    return this.events.map((e) => ({
      ...e,
      relativeTime: e.timestamp - startTime,
    }))
  }

  /**
   * Get events for a specific frame
   */
  getEventsForFrame(frame: number): SmithersDebugEvent[] {
    return this.events.filter((e) => e.frameNumber === frame)
  }

  /**
   * Get the total number of events collected
   */
  get eventCount(): number {
    return this.events.length
  }

  /**
   * Clear all collected events
   */
  clear(): void {
    this.events = []
  }
}
