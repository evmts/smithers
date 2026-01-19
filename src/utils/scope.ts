export function encodeScopeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/\./g, '%2E')
}

export function makeScopeId(parentScopeId: string, type: string, id: string, suffix?: string): string {
  const segments = [parentScopeId, type, id]
  if (suffix !== undefined && suffix !== '') {
    segments.push(suffix)
  }
  return segments.map(encodeScopeSegment).join('.')
}

export function makeStateKey(scopeId: string, domain: string, localId?: string, suffix?: string): string {
  const parts = [domain, scopeId]
  if (localId !== undefined && localId !== '') {
    parts.push(encodeScopeSegment(localId))
  }
  if (suffix !== undefined && suffix !== '') {
    parts.push(encodeScopeSegment(suffix))
  }
  return parts.join('_')
}
