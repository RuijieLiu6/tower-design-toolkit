// Deterministic JSON for project files and design hashes: same value → same bytes.
const TOP_ORDER = ['format', 'app', 'project', 'site', 'towers', 'selectedTower', 'rules', 'sun', 'presets', 'publicRealm', 'cityInNature', 'windPresets', 'systemsPresets', 'nodes', 'communityNodes', 'trace', 'importedMeshes']

/** Deterministic JSON: fixed top-level order, every other object's keys sorted, numbers to 6 decimals, 2-space indent. */
export function stableStringify(value: unknown): string {
  const norm = (v: unknown, top = false): unknown => {
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return null
      const r = Math.round(v * 1e6) / 1e6
      return Object.is(r, -0) ? 0 : r
    }
    if (Array.isArray(v)) return v.map((x) => norm(x))
    if (v && typeof v === 'object') {
      const keys = Object.keys(v).filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      keys.sort(top ? (a, b) => rank(a) - rank(b) || a.localeCompare(b) : (a, b) => (a < b ? -1 : a > b ? 1 : 0))
      return Object.fromEntries(keys.map((k) => [k, norm((v as Record<string, unknown>)[k])]))
    }
    return v
  }
  const rank = (k: string) => { const i = TOP_ORDER.indexOf(k); return i < 0 ? TOP_ORDER.length : i }
  return JSON.stringify(norm(value, true), null, 2) + '\n'
}

/** Short content hash (FNV-1a, 32-bit, hex) of a value's deterministic JSON: for comparing designs, not for security. */
export function hashOf(value: unknown): string {
  const text = stableStringify(value)
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16).padStart(8, '0')
}
