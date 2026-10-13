/** Intersects selected peer contracts without dropping alternatives.
 * An optional peer declared in peerDependenciesMeta alone counts as `*`.
 * The complete release smoke selects all optional adapters by default.
 * Minimal consumers pass optionalPeers: [] and may include first-party peers.
 */
export const peerRangesOf = (manifests, { optionalPeers = "all", includeFirstParty = false } = {}) => {
  const consumers = [...manifests]
  const selected = new Set(optionalPeers === "all" ? [] : optionalPeers)
  for (const manifest of consumers) {
    if (manifest.name !== undefined) selected.add(manifest.name)
    for (const name of Object.keys(manifest.dependencies ?? {})) selected.add(name)
    for (const name of Object.keys(manifest.peerDependencies ?? {})) {
      if (manifest.peerDependenciesMeta?.[name]?.optional !== true) selected.add(name)
    }
  }
  const peers = new Map()
  for (const manifest of consumers) {
    // An optional peer named only in peerDependenciesMeta takes any version:
    // the consumer picks it, and its own peers constrain it.
    const declared = { ...manifest.peerDependencies }
    for (const [name, meta] of Object.entries(manifest.peerDependenciesMeta ?? {})) {
      if (meta?.optional === true && declared[name] === undefined) declared[name] = "*"
    }
    for (const [name, range] of Object.entries(declared)) {
      if (!includeFirstParty && name.startsWith("@smthrs/")) continue
      if (optionalPeers !== "all" && !selected.has(name)) continue
      const previous = peers.get(name)
      if (previous === undefined || previous === range) {
        peers.set(name, range)
        continue
      }
      const intersections = previous.split("||").flatMap((left) =>
        range.split("||").map((right) => `${left.trim()} ${right.trim()}`)
      )
      peers.set(name, [...new Set(intersections)].join(" || "))
    }
  }
  return peers
}
