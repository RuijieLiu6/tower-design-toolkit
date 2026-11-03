// Step 1 of the upload: map Rhino layers (or object names, or user-string values) to roles, with a live plan and
// elevation preview. One screen; the guesses are team assumptions until the person moves on (then they count as theirs).
import { Info, Tags } from 'lucide-react'
import { useMemo } from 'react'
import { convexHull, type Pt } from '../../engine/importGeom'
import { USES, type UseId } from '../../engine/types'
import type { RawImport } from '../../lib/import/types'
import { guessRule, itemsOf, mappingRows, roleOf, type Item } from '../../lib/interchange/mapping'
import { ROLE_COLOR, ROLE_LABEL, ROLES, type MapBy, type Mapping, type Role } from '../../lib/interchange/model'

const MAX_ROWS = 300
const BY_LABEL: Record<MapBy, string> = { layer: 'Layer', name: 'Object name', userString: 'User string' }

interface Shape { item: Item; hull: Pt[]; z0: number; z1: number; line?: Pt[]; closed?: boolean }

/** Plan outline and height range of each item, in file units (z up). Sampled, so a dense mesh costs little. */
export function useShapes(raw: RawImport, upAxis: 'z' | 'y'): Shape[] {
  return useMemo(() => itemsOf(raw).map((item): Shape => {
    const plan = (p: ArrayLike<number>, i: number): Pt => (upAxis === 'y' ? [p[i], -p[i + 2]] : [p[i], p[i + 1]])
    const up = (p: ArrayLike<number>, i: number) => (upAxis === 'y' ? p[i + 1] : p[i + 2])
    if (item.curve) {
      const pts = item.points.map((q) => plan(q, 0)), zs = item.points.map((q) => up(q, 0))
      return { item, hull: pts, line: pts, closed: item.closed, z0: Math.min(...zs), z1: Math.max(...zs) }
    }
    const p = item.mesh.positions, n = p.length / 3, step = Math.max(1, Math.floor(n / 1500))
    const pts: Pt[] = []
    let z0 = Infinity, z1 = -Infinity
    for (let v = 0; v < n; v += step) { pts.push(plan(p, 3 * v)); const z = up(p, 3 * v); if (z < z0) z0 = z; if (z > z1) z1 = z }
    return { item, hull: convexHull(pts), z0, z1 }
  }), [raw, upAxis])
}

export default function RoleMapper({ raw, mapping, onChange, shapes, recalled }: { raw: RawImport; mapping: Mapping; onChange: (m: Mapping) => void; shapes: Shape[]; recalled: boolean }) {
  const rows = useMemo(() => mappingRows(raw, mapping.by, mapping.key), [raw, mapping.by, mapping.key])
  const keys = useMemo(() => [...new Set(itemsOf(raw).flatMap((it) => Object.keys(it.userStrings ?? {})))].sort(), [raw])
  const setRule = (key: string, role: Role, use?: UseId) => {
    const rule = role === 'program' || role === 'podium' ? { role, use: use ?? mapping.rules[key]?.use ?? (role === 'podium' ? 'retail' : 'office') as UseId } : { role }
    onChange({ ...mapping, rules: { ...mapping.rules, [key]: rule }, confirmed: [...new Set([...(mapping.confirmed ?? []), key])] })
  }
  const counts = useMemo(() => {
    const c: Partial<Record<Role, number>> = {}
    for (const s of shapes) { const r = roleOf(s.item, mapping).role; c[r] = (c[r] ?? 0) + 1 }
    return c
  }, [shapes, mapping])
  return (
    <div className="grid gap-0 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-3 border-line p-5 md:border-r">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold">Map by</span>
          <div role="radiogroup" aria-label="Map by" className="flex overflow-hidden rounded-md border border-line">
            {(['layer', 'name', 'userString'] as MapBy[]).map((b) => (
              <button key={b} role="radio" aria-checked={mapping.by === b} disabled={b === 'userString' && !keys.length} title={b === 'userString' && !keys.length ? 'The file has no user strings' : undefined}
                onClick={() => onChange({ ...mapping, by: b, key: b === 'userString' ? (keys.includes(mapping.key) ? mapping.key : keys[0]) : mapping.key, rules: autoRules(raw, b, b === 'userString' ? (keys.includes(mapping.key) ? mapping.key : keys[0]) : mapping.key, mapping), confirmed: [] })}
                className={`px-2.5 py-1 text-[11px] disabled:opacity-40 ${mapping.by === b ? 'bg-accent text-white' : 'hover:bg-black/5'}`}>{BY_LABEL[b]}</button>
            ))}
          </div>
          {mapping.by === 'userString' && (
            <label className="flex items-center gap-1 text-[11px] text-muted">key
              <select value={mapping.key} onChange={(e) => onChange({ ...mapping, key: e.target.value, rules: autoRules(raw, 'userString', e.target.value, mapping), confirmed: [] })} className="rounded border border-line bg-panel px-1 py-0.5 text-ink">
                {keys.map((k) => <option key={k}>{k}</option>)}
              </select>
            </label>
          )}
          {recalled && <span className="ml-auto inline-flex items-center gap-1 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent"><Tags size={11} />Mapping remembered for this file</span>}
        </div>
        <div className="max-h-[46vh] overflow-y-auto rounded-lg border border-line">
          <table className="w-full table-fixed text-left text-[11px]">
            <colgroup><col className="w-[33%]" /><col className="w-[16%]" /><col className="w-[30%]" /><col className="w-[21%]" /></colgroup>
            <thead className="sticky top-0 bg-panel text-muted"><tr><th className="px-2 py-1.5 font-medium">{BY_LABEL[mapping.by]}{mapping.by === 'userString' ? ` "${mapping.key}"` : ''}</th><th className="px-2 font-medium">Contents</th><th className="px-2 font-medium">Role</th><th className="px-2 font-medium">Use</th></tr></thead>
            <tbody>
              {rows.slice(0, MAX_ROWS).map((r) => {
                const rule = mapping.rules[r.key] ?? { role: 'ignore' as Role }
                const usable = r.objects > 0 || r.closedCurves > 0
                return (
                  <tr key={r.key} className="border-t border-line align-middle">
                    <td className="px-2 py-1">
                      <span className="flex items-center gap-1.5">
                        <span aria-hidden className="h-3 w-3 shrink-0 rounded-sm border border-black/10" style={{ background: r.color ?? '#ddd' }} />
                        <span className="min-w-0 break-words leading-tight" title={r.key}>{r.key.split('::').map((part, i, all) => <span key={i} className={i < all.length - 1 ? 'text-muted' : ''}>{part}{i < all.length - 1 ? ' › ' : ''}</span>)}</span>
                        {r.roleString && <span title={`Most objects carry the user string role=${r.roleString}`} className="shrink-0 rounded bg-black/5 px-1 text-[9.5px] text-muted">role={r.roleString}</span>}
                      </span>
                    </td>
                    <td className="px-2 leading-tight text-muted">{[r.objects ? `${r.objects} obj · ${Math.round(r.triangles).toLocaleString('en-CA')} tri` : '', r.curves ? `${r.curves} curve${r.curves > 1 ? 's' : ''}${r.closedCurves ? ` (${r.closedCurves} closed)` : ''}` : ''].filter(Boolean).join(' · ')}</td>
                    <td className="px-2">
                      <select aria-label={`Role for ${r.key}`} value={rule.role} onChange={(e) => setRule(r.key, e.target.value as Role)} disabled={!usable && rule.role === 'ignore'}
                        className="w-full rounded border border-line bg-panel px-1 py-0.5 text-[11px]" style={{ borderLeft: `4px solid ${ROLE_COLOR[rule.role]}` }}>
                        {ROLES.filter((x) => r.objects > 0 || x.id === 'site' || x.id === 'ignore').map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                      </select>
                    </td>
                    <td className="px-2">
                      {(rule.role === 'program' || rule.role === 'podium') && (
                        <select aria-label={`Use for ${r.key}`} value={rule.use ?? ''} onChange={(e) => setRule(r.key, rule.role, e.target.value as UseId)} className="w-full rounded border border-line bg-panel px-1 py-0.5 text-[11px]">
                          {(Object.keys(USES) as UseId[]).map((u) => <option key={u} value={u}>{USES[u].label}</option>)}
                        </select>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {rows.length > MAX_ROWS && <p className="border-t border-line px-2 py-1.5 text-[10.5px] text-muted">Showing {MAX_ROWS} of {rows.length} rows; the rest are ignored. Map by layer for a file this size.</p>}
        </div>
        <p className="flex gap-1.5 text-[10.5px] leading-snug text-muted"><Info size={12} className="mt-0.5 shrink-0" aria-hidden /><span>Roles are guessed from names and the <code>role</code> and <code>use</code> user strings (team assumption): check every row. An object's own <code>use</code> user string beats its row's use. Tower and program volumes that overlap in plan become one tower; separate ones become separate towers.</span></p>
      </div>
      <div className="grid content-start gap-3 bg-black/[0.015] p-5">
        <Preview shapes={shapes} mapping={mapping} />
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]" aria-label="Objects per role">
          {ROLES.map((r) => (
            <li key={r.id} className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: r.color }} /><span className={counts[r.id] ? '' : 'text-muted'}>{r.label}</span><span className="ml-auto tabular-nums text-muted">{counts[r.id] ?? 0}</span></li>
          ))}
        </ul>
        {raw.skipped.length > 0 && (
          <details className="rounded-md border border-line bg-panel p-2 text-[11px]">
            <summary className="cursor-pointer text-muted hover:text-ink">{raw.skipped.length} object{raw.skipped.length === 1 ? '' : 's'} could not be read, and why</summary>
            <ul className="mt-1 grid max-h-32 gap-1 overflow-y-auto">{raw.skipped.map((s, i) => <li key={i}><b>{s.name}</b> <span className="text-muted">({s.kind}{s.layer ? `, ${s.layer}` : ''})</span>: {s.reason}</li>)}</ul>
          </details>
        )}
      </div>
    </div>
  )
}

function autoRules(raw: RawImport, by: MapBy, key: string, prev: Mapping) {
  const rows = mappingRows(raw, by, key)
  const meshRows = rows.filter((r) => r.objects > 0).length
  return Object.fromEntries(rows.map((r) => [r.key, prev.by === by && prev.key === key && prev.rules[r.key] ? prev.rules[r.key] : guessRule(r, meshRows === 1)]))
}

const DRAW_ORDER: Role[] = ['ignore', 'context', 'site', 'podium', 'tower', 'program', 'core']

/** Plan (top) and elevation (looking north along +Y) of every item, coloured by role. */
function Preview({ shapes, mapping }: { shapes: Shape[]; mapping: Mapping }) {
  const drawn = useMemo(() => shapes.map((s) => ({ ...s, role: roleOf(s.item, mapping).role, use: roleOf(s.item, mapping).use })).sort((a, b) => DRAW_ORDER.indexOf(a.role) - DRAW_ORDER.indexOf(b.role)), [shapes, mapping])
  const useful = drawn.filter((d) => d.role !== 'ignore')
  const box = (useful.length ? useful : drawn).reduce((b, d) => {
    for (const [x, y] of d.hull) { b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y) }
    b.z0 = Math.min(b.z0, d.z0); b.z1 = Math.max(b.z1, d.z1)
    return b
  }, { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity })
  if (!Number.isFinite(box.x0)) return <p className="text-xs text-muted">Nothing to preview.</p>
  const W = 300, H = 200, pad = 8
  const span = Math.max(box.x1 - box.x0, box.y1 - box.y0, 1e-9)
  const k = (Math.min(W, H) - 2 * pad) / span
  const px = (x: number) => pad + (x - box.x0) * k + (W - 2 * pad - (box.x1 - box.x0) * k) / 2
  const py = (y: number) => H - pad - (y - box.y0) * k - (H - 2 * pad - (box.y1 - box.y0) * k) / 2
  const EH = 150
  const ek = Math.min((W - 2 * pad) / Math.max(box.x1 - box.x0, 1e-9), (EH - 2 * pad) / Math.max(box.z1 - box.z0, 1e-9))
  const ex = (x: number) => pad + (x - box.x0) * ek
  const ez = (z: number) => EH - pad - (z - box.z0) * ek
  const fill = (d: (typeof drawn)[number]) => (d.role === 'program' && d.use ? USES[d.use].color : ROLE_COLOR[d.role])
  return (
    <section className="rounded-lg border border-line bg-panel p-3">
      <div className="mb-1 flex items-center text-xs font-semibold">Live preview<span className="ml-auto text-[10px] font-normal text-muted">file coordinates, before north and placement</span></div>
      <div className="grid gap-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Plan of the file coloured by role: ${ROLES.map((r) => `${drawn.filter((d) => d.role === r.id).length} ${ROLE_LABEL[r.id].toLowerCase()}`).join(', ')}`}>
          {drawn.map((d, i) => d.line
            ? <polyline key={i} points={d.line.map(([x, y]) => `${px(x)},${py(y)}`).join(' ') + (d.closed ? ` ${px(d.line[0][0])},${py(d.line[0][1])}` : '')} fill={d.role === 'site' ? '#2a9d8f14' : 'none'} stroke={d.role === 'ignore' ? '#c9ccd1' : ROLE_COLOR[d.role]} strokeWidth={d.role === 'site' ? 1.6 : 1} strokeDasharray={d.role === 'site' ? '5 3' : d.role === 'ignore' ? '2 2' : undefined} />
            : <polygon key={i} points={d.hull.map(([x, y]) => `${px(x)},${py(y)}`).join(' ')} fill={fill(d)} fillOpacity={d.role === 'ignore' ? 0.15 : d.role === 'context' ? 0.55 : 0.75} stroke={d.role === 'ignore' ? '#c9ccd1' : '#ffffff'} strokeWidth={0.6} strokeDasharray={d.role === 'ignore' ? '2 2' : undefined}><title>{`${d.item.name} · ${d.item.layer} · ${ROLE_LABEL[d.role]}`}</title></polygon>)}
          <text x={W - pad} y={pad + 6} textAnchor="end" fontSize={8} fill="#62666d">Plan</text>
        </svg>
        <svg viewBox={`0 0 ${W} ${EH}`} className="w-full" role="img" aria-label="Elevation of the file coloured by role">
          <line x1={pad} x2={W - pad} y1={ez(Math.max(box.z0, 0))} y2={ez(Math.max(box.z0, 0))} stroke="#c9ccd1" />
          {drawn.filter((d) => !d.line && d.role !== 'ignore').map((d, i) => {
            const xs = d.hull.map((p) => p[0])
            return <rect key={i} x={ex(Math.min(...xs))} y={ez(d.z1)} width={Math.max(0.6, (Math.max(...xs) - Math.min(...xs)) * ek)} height={Math.max(0.6, (d.z1 - d.z0) * ek)} fill={fill(d)} fillOpacity={d.role === 'context' ? 0.5 : 0.7} stroke="#ffffff" strokeWidth={0.4}><title>{`${d.item.name} · ${ROLE_LABEL[d.role]}`}</title></rect>
          })}
          <text x={W - pad} y={pad + 6} textAnchor="end" fontSize={8} fill="#62666d">Elevation (x, height)</text>
        </svg>
      </div>
    </section>
  )
}
