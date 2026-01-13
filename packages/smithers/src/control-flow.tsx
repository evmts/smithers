/**
 * Control Flow Components for Smithers
 *
 * Custom implementations of SolidJS control flow primitives that work
 * with the Smithers tree renderer. These replace the solid-js versions
 * which are designed for DOM rendering.
 */
import { createMemo, type Accessor } from './solid-shim.js'

/**
 * Conditionally renders children based on a boolean condition.
 *
 * Unlike solid-js Show which uses DOM markers, this version simply
 * returns children or fallback directly, making it work with the
 * Smithers tree renderer.
 *
 * @example
 * ```tsx
 * <Show when={phase() === 'research'} fallback={<Done />}>
 *   <Claude>Research the topic</Claude>
 * </Show>
 * ```
 */
export function Show<T>(props: {
  when: T | undefined | null | false
  fallback?: unknown
  children: unknown | ((item: Accessor<T>) => unknown)
}): unknown {
  // Create a memo that returns children or fallback based on condition
  const resolved = createMemo(() => {
    const condition = props.when
    if (condition) {
      // If children is a function, call it with the truthy value
      if (typeof props.children === 'function') {
        const accessor: Accessor<T> = () => condition as T
        return (props.children as (item: Accessor<T>) => unknown)(accessor)
      }
      return props.children
    }
    return props.fallback ?? null
  })

  return resolved()
}

/**
 * Iterates over an array and renders children for each item.
 *
 * @example
 * ```tsx
 * <For each={phases()}>
 *   {(phase) => <Phase name={phase}><Claude>Work on {phase}</Claude></Phase>}
 * </For>
 * ```
 */
export function For<T>(props: {
  each: T[] | undefined | null
  fallback?: unknown
  children: (item: T, index: Accessor<number>) => unknown
}): unknown {
  const resolved = createMemo(() => {
    const items = props.each
    if (!items || items.length === 0) {
      return props.fallback ?? null
    }
    return items.map((item, i) => props.children(item, () => i))
  })

  return resolved()
}

/**
 * Switch/Match for pattern matching multiple conditions.
 *
 * @example
 * ```tsx
 * <Switch fallback={<Default />}>
 *   <Match when={phase() === 'a'}><PhaseA /></Match>
 *   <Match when={phase() === 'b'}><PhaseB /></Match>
 * </Switch>
 * ```
 */
export function Switch(props: {
  fallback?: unknown
  children: unknown
}): unknown {
  const resolved = createMemo(() => {
    const children = Array.isArray(props.children) ? props.children : [props.children]

    for (const child of children) {
      // Check if it's a Match result with a truthy when
      if (child && typeof child === 'object' && '__match' in child) {
        const match = child as { __match: boolean; children: unknown }
        if (match.__match) {
          return match.children
        }
      }
    }

    return props.fallback ?? null
  })

  return resolved()
}

/**
 * Match condition for use inside Switch.
 *
 * @example
 * ```tsx
 * <Match when={phase() === 'research'}>
 *   <Claude>Research</Claude>
 * </Match>
 * ```
 */
export function Match<T>(props: {
  when: T | undefined | null | false
  children: unknown | ((item: Accessor<T>) => unknown)
}): { __match: boolean; children: unknown } {
  // Return a marker object that Switch can inspect
  if (props.when) {
    const children =
      typeof props.children === 'function'
        ? (props.children as (item: Accessor<T>) => unknown)(() => props.when as T)
        : props.children
    return { __match: true, children }
  }
  return { __match: false, children: null }
}

/**
 * Index-based iteration (uses index as key instead of value reference).
 *
 * @example
 * ```tsx
 * <Index each={items()}>
 *   {(item, index) => <Step>{item()}</Step>}
 * </Index>
 * ```
 */
export function Index<T>(props: {
  each: T[] | undefined | null
  fallback?: unknown
  children: (item: Accessor<T>, index: number) => unknown
}): unknown {
  const resolved = createMemo(() => {
    const items = props.each
    if (!items || items.length === 0) {
      return props.fallback ?? null
    }
    return items.map((item, i) => props.children(() => item, i))
  })

  return resolved()
}
