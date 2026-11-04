// Zoning height references (after Vista v37 height-policy.js) on the real data: Vista's file is the published one, its
// frame converts onto the City's own zoning layer, and known parcels read the district the property tax report names.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeFootprints } from '../lib/cityLayers'
import { dmPoints, parcelRow, type ParcelAttrs, type ZoningData } from '../lib/contextLayers'
import { POLICY_FILE, loadPolicy, normalizeFootprint, readRule } from './heightPolicy'
import type { Pt } from './vista'

const ORIGIN: Pt = [491300, 5458600]
const dir = new URL('../../public/data/', import.meta.url)
const bytes = (f: string) => { const b = readFileSync(new URL(f, dir)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer }
const text = (f: string) => readFileSync(new URL(f, dir), 'utf8')
const raw = bytes('vista/height_policy.json')
const policy = loadPolicy(JSON.parse(text('vista/height_policy.json')), ORIGIN)
const parcels = decodeFootprints(bytes('parcels.bin'))
const attrs = JSON.parse(text('parcels.json')) as ParcelAttrs
const lots = (address: string) => parcels.filter((_, i) => parcelRow(attrs, i).address === address).map((f) => f.outer as Pt[])

describe('zoning height references (Vista height_policy.json)', { timeout: 30_000 }, () => {
  it("is Vista's published file, unchanged: 1,621 zones, 964 rules, 28 with a number", async () => {
    expect(raw.byteLength).toBe(POLICY_FILE.bytes)
    const hex = [...new Uint8Array(await crypto.subtle.digest('SHA-256', raw))].map((b) => b.toString(16).padStart(2, '0')).join('')
    expect(hex).toBe(POLICY_FILE.sha256)
    expect(policy.zones).toHaveLength(1621)
    expect(Object.keys(policy.rules)).toHaveLength(964)
    expect(Object.values(policy.rules).filter((r) => typeof r.basicHeightM === 'number')).toHaveLength(28)
    expect(policy.zones.every((z) => z.valid)).toBe(true)
  })
  it("lands on the City's own zoning layer after the frame conversion (Vista frame → lat/lon → EPSG:26910)", () => {
    // zoning.json is the same City dataset, retrieved the same day, simplified at 0.5 m and stored in decimetres.
    const ours = JSON.parse(text('zoning.json')) as ZoningData
    const edges = new Map<string, [Pt, Pt][]>()
    for (const [d, flat] of ours.polys) { const r = dmPoints(flat), k = ours.districts[d]; edges.set(k, [...(edges.get(k) ?? []), ...r.map((p, i) => [p, r[(i + 1) % r.length]] as [Pt, Pt])]) }
    const seg = (p: Pt, a: Pt, b: Pt) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) }
    const res: number[] = []
    for (const z of policy.zones) {
      const mine = edges.get(z.zone)
      if (!mine) continue
      for (const p of z.polygons.flat(2)) {
        if (p[0] < -2300 || p[0] > 2400 || p[1] < -1900 || p[1] > 1900) continue
        const d = Math.min(...mine.map(([a, b]) => seg(p, a, b)))
        if (d < 5) res.push(d)
      }
    }
    res.sort((a, b) => a - b)
    expect(res.length).toBeGreaterThan(8000)
    expect(res[Math.floor(res.length / 2)]).toBeLessThan(0.06)
    expect(res[res.length - 1]).toBeLessThan(0.56) // 0.5 m simplification + 0.05 m rounding in zoning.json
  })
  it('reads the district the tax report names at known parcels', () => {
    const at = (address: string) => policy.zoning(lots(address).slice(0, 1))
    expect(at('1265 Beach Av')).toMatchObject({ status: 'ready', heightM: 18.3, controlling: 'RM-5A' })
    expect(at('1935 Cornwall Av')).toMatchObject({ status: 'ready', heightM: 23, controlling: 'C-2A' })
    expect(at('1551 Cypress St')).toMatchObject({ status: 'ready', heightM: 10.7, controlling: 'RM-4' })
    expect(at('2424 Maple St')).toMatchObject({ status: 'ready', heightM: 84, controlling: 'R5-3' })
  })
  it('a lot line shared with the next district does not count; a lot split between two districts takes the lower', () => {
    // 1650 Burrard St: 8,488 m² in M-2 and 7,674 m² in C-2A; it also touches R1-1 over 0.24 m² along a lot line,
    // which is under Vista's parcel tolerance (max(0.25 m², 0.01% of 16,162 m²)) and is ignored.
    const r = policy.zoning(lots('1650 Burrard St').slice(0, 1))
    expect([...r.ruleIds].sort()).toEqual(['C-2A', 'M-2'])
    expect(r).toMatchObject({ status: 'ready', heightM: 23, controlling: 'C-2A' })
  })
  it('a DD site has no zoning number and never a guessed height', () => {
    const r = policy.zoning(lots('1475 Burrard St').slice(0, 1))
    expect(r.status).toBe('unknown')
    expect(r.heightM).toBeNull()
    expect(r.ruleIds).toContain('unresolved:DD')
    const read = readRule(policy, 'unresolved:DD', 'DD')
    expect(read).toMatchObject({ kind: 'not_transcribed', heightM: null, flag: 'unresolved', label: 'no zoning number (DD)' })
    // The lot's centre is in DD, and the point lookup says the same.
    const lot = lots('1475 Burrard St')[0]
    const centre = lot.reduce((s, p) => [s[0] + p[0] / lot.length, s[1] + p[1] / lot.length], [0, 0]) as Pt
    expect(policy.zoneAt(centre)?.zone).toBe('DD')
    expect(policy.atPoint(centre)).toMatchObject({ status: 'unknown', heightM: null })
  })
  it('CD-1 is site-specific, a numbered rule is unverified, and a mixed footprint stays partial', () => {
    expect(readRule(policy, 'unresolved:CD-1 (252)', 'CD-1 (252)')).toMatchObject({ kind: 'site_specific', flag: 'unresolved', heightM: null })
    expect(readRule(policy, 'C-2A', 'C-2A')).toMatchObject({ kind: 'number', heightM: 23, flag: 'unverified' })
    expect(readRule(policy, null)).toMatchObject({ kind: 'unmapped', flag: 'unresolved' })
    const mixed = policy.zoning([...lots('2330 Maple St').slice(0, 1)])
    expect(mixed.status).toBe('partial')
    expect(mixed.heightM).toBeNull()
  })
  it('a point uses the exact rule; an invalid footprint is refused, never reduced to a point', () => {
    const r11 = policy.zones.find((z) => z.ruleId === 'R1-1')!
    const p = r11.polygons[0][0], c: Pt = [(p[0][0] + p[1][0] + p[2][0]) / 3, (p[0][1] + p[1][1] + p[2][1]) / 3]
    if (policy.zoneAt(c)?.ruleId === 'R1-1') expect(policy.atPoint(c)).toMatchObject({ status: 'ready', heightM: 11.5 })
    expect(normalizeFootprint([[0, 0], [10, 10], [10, 0], [0, 10]])).toBeNull() // bow-tie
    const bad = policy.zoning([null])
    expect(bad.status).toBe('no_site')
    expect(bad.notes[0]).toMatch(/cannot replace the full footprint/)
  })
})
