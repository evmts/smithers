/**
 * Immutable facade over a private map.
 *
 * @since 1.0.0
 */

/**
 * Copies entries behind a frozen facade that exposes no mutation methods.
 * Keys and values retain their identity and are not copied or frozen. Duplicate
 * keys retain their first insertion position and use their last value.
 *
 * @param entries - Entries to copy; defaults to an empty map.
 * @returns A read-only facade whose forEach callback receives that facade.
 * @throws Propagates native Map construction errors for invalid iterables.
 *
 * @category constructors
 * @since 1.0.0
 */
export const make = <K, V>(entries: Iterable<readonly [K, V]> = []): ReadonlyMap<K, V> => {
  const values = new Map(entries)
  const facade: ReadonlyMap<K, V> = {
    get size() {
      return values.size
    },
    get: (key) => values.get(key),
    has: (key) => values.has(key),
    forEach: (callback, thisArg) => values.forEach((value, key) => callback.call(thisArg, value, key, facade)),
    entries: () => values.entries(),
    keys: () => values.keys(),
    values: () => values.values(),
    [Symbol.iterator]: () => values[Symbol.iterator]()
  }
  return Object.freeze(facade)
}
