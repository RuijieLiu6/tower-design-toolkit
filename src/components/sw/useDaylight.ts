// The daylight layers of one floor, computed off the event that asked for them so the sliders stay live:
// · light at this hour: the static part (sky components, fine mask) is cached per floor in engine/sw/hourLight.ts; each
//   hour is one step after the next paint, and every hour already seen is kept, so playing a day back is instant;
// · daylight autonomy, daylight factor and annual sun exposure: once per floor, façade, target and blinds, kept.
// The viewer (DaylightStudio) and the results panel read the same caches.
import { useEffect, useMemo, useRef, useState } from 'react'
import { aseFloor, daylightFloor, type AseFloor, type DaylightFloor, type DlGrid } from '../../engine/sw/daylight'
import { hourBase, hourLight, plateKey, type HourLight } from '../../engine/sw/hourLight'
import { solidAt, zonesOf, type FacadeZone, type SwFloor } from '../../engine/sw/plate'
import type { Tower } from '../../engine/types'
import { useSwInputs, type SwInputs } from '../../lib/swInputs'
import { planFloor } from '../../lib/swRun'
import { doyOf, useSwStudy } from '../../lib/swStudy'
import { fieldRaster, fineRaster, STUDIO_RAMPS, type LayerId, type Raster } from './planRaster'

export interface PlanFloor { t: Tower; f: SwFloor; levels: number; zones: FacadeZone[]; key: string }

const lru = <T,>(m: Map<string, T>, k: string, v: T, max: number) => { m.set(k, v); if (m.size > max) m.delete(m.keys().next().value as string); return v }

/** The floor the interior studies draw (the tallest tower, the level set in the study settings), on the Studio's 1 m mask. */
export function usePlanFloor(): { pf: PlanFloor | null; inp: SwInputs } {
  const inp = useSwInputs(), level = useSwStudy((s) => s.level)
  const pf = useMemo(() => {
    const p = planFloor(inp, { level } as Parameters<typeof planFloor>[1], 1)
    if (!p) return null
    const zones = zonesOf(p.t)
    return { ...p, zones, key: plateKey(p.f, zones, { ctx: inp.ctxBlocks }) }
  }, [inp, level])
  return { pf, inp }
}

/** Timings of the last runs, for the dev hook and the report. */
export const DL_TIMES = { base: 0, hour: 0, annual: 0, ase: 0, raster: 0, annualRaster: 0 }

const hourMemo = new Map<string, HourLight>()
/** Light at the hour set in the study settings. `L` is the latest result for this floor (a step behind while dragging). */
export function useHourLight(pf: PlanFloor | null, inp: SwInputs, on = true): { L: HourLight | null; fresh: boolean } {
  const month = useSwStudy((s) => s.month), day = useSwStudy((s) => s.day), hour = useSwStudy((s) => s.hour), blinds = useSwStudy((s) => s.blinds)
  const doy = doyOf(month, day), key = pf && on ? `${pf.key}|${doy}|${hour}|${blinds}|${inp.C ? 1 : 0}` : null
  const [, tick] = useState(0), last = useRef<{ plate: string; L: HourLight } | null>(null)
  const hit = key ? hourMemo.get(key) ?? null : null
  if (hit && pf) last.current = { plate: pf.key, L: hit }
  useEffect(() => {
    if (!key || !pf || hourMemo.has(key)) return
    let live = true, timer = 0
    // after the next paint: the slider thumb and the readout move first, then the light catches up
    const raf = requestAnimationFrame(() => { timer = window.setTimeout(() => {
      if (!live) return
      const opts = { ctx: inp.ctxBlocks, blinds }
      let t0 = performance.now()
      const base = hourBase(pf.f, pf.zones, opts)
      const tb = performance.now() - t0
      if (tb > 2) DL_TIMES.base = tb
      t0 = performance.now()
      lru(hourMemo, key, hourLight(pf.f, pf.zones, inp.C, { doy, hour }, opts, base), 60)
      DL_TIMES.hour = performance.now() - t0
      tick((n) => n + 1)
    }, 0) })
    return () => { live = false; cancelAnimationFrame(raf); clearTimeout(timer) }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return { L: hit ?? (pf && last.current?.plate === pf.key ? last.current.L : null), fresh: !!hit }
}

const hourRasters = new WeakMap<HourLight, Raster | null>()
export function hourRaster(L: HourLight | null): Raster | null {
  if (!L) return null
  if (!hourRasters.has(L)) { const t0 = performance.now(); hourRasters.set(L, fineRaster(L.grid, L.lux, L.inside, STUDIO_RAMPS.lux, L.held)); DL_TIMES.raster = performance.now() - t0 }
  return hourRasters.get(L) ?? null
}

/** The sensors of a daylight grid: on the plate, outside the core. */
function validOf(f: SwFloor, G: DlGrid): Uint8Array {
  const v = new Uint8Array(G.nx * G.ny)
  for (let iy = 0; iy < G.ny; iy++) for (let ix = 0; ix < G.nx; ix++) {
    if (!solidAt(f.mask, (ix / G.sub) | 0, (iy / G.sub) | 0)) continue
    const x = G.x0 + (ix + 0.5) * G.h, y = G.y0 + (iy + 0.5) * G.h
    if (!(Math.abs(x - f.core.x) <= f.core.half && Math.abs(y - f.core.y) <= f.core.half)) v[iy * G.nx + ix] = 1
  }
  return v
}

export interface AnnualLayer { layer: Exclude<LayerId, 'lux'>; raster: Raster | null; read: string; dl?: DaylightFloor; ase?: AseFloor }
const dlMemo = new Map<string, DaylightFloor>(), aseMemo = new Map<string, AseFloor>(), annRasters = new Map<string, AnnualLayer>()
/** The full-resolution daylight run of the floor shown (0.5 m sensors, every second day), shared with the maps of the year. */
export function planDaylight(pf: PlanFloor, inp: SwInputs, target: number, blinds: boolean): DaylightFloor {
  const key = `${pf.key}|${target}|${blinds}|${inp.C ? 1 : 0}`
  const hit = dlMemo.get(key)
  if (hit) return hit
  const t0 = performance.now()
  const val = daylightFloor(pf.f, pf.zones, inp.C, { sub: Math.max(1, Math.round(pf.f.mask.h / 0.5)), step: 1, hs: 2, target, blinds, ctx: inp.ctxBlocks })
  DL_TIMES.annual = performance.now() - t0
  return lru(dlMemo, key, val, 6)
}
function planAse(pf: PlanFloor, inp: SwInputs): AseFloor {
  const key = `${pf.key}|${inp.C ? 1 : 0}`
  const hit = aseMemo.get(key)
  if (hit) return hit
  const t0 = performance.now()
  const val = aseFloor(pf.f, pf.zones, inp.C, undefined, { sub: Math.max(1, Math.round(pf.f.mask.h / 0.5)), ctx: inp.ctxBlocks })
  DL_TIMES.ase = performance.now() - t0
  return lru(aseMemo, key, val, 6)
}

/** One annual layer of the floor as a picture and a one-line reading; computed once, a moment after it is asked for. */
export function useAnnualLayer(pf: PlanFloor | null, inp: SwInputs, layer: Exclude<LayerId, 'lux'> | null): { A: AnnualLayer | null; busy: boolean } {
  const target = useSwStudy((s) => s.dlTarget), blinds = useSwStudy((s) => s.blinds)
  const key = pf && layer ? `${layer}|${pf.key}|${layer === 'ase' ? '' : `${target}|${blinds}`}|${inp.C ? 1 : 0}` : null
  const [, tick] = useState(0)
  const hit = key ? annRasters.get(key) ?? null : null
  useEffect(() => {
    if (!key || !pf || !layer || annRasters.has(key)) return
    let live = true
    const timer = window.setTimeout(() => {
      if (!live) return
      let A: AnnualLayer, t1 = 0
      if (layer === 'ase') {
        const a = planAse(pf, inp)
        t1 = performance.now()
        A = { layer, ase: a, raster: fieldRaster(a.grid, a.hrs, validOf(pf.f, a.grid), STUDIO_RAMPS.ase), read: `${Math.round(a.pctOver * 100)}% of the floor over 250 h of direct sun` }
      } else {
        const d = planDaylight(pf, inp, target, blinds)
        t1 = performance.now()
        A = layer === 'da'
          ? { layer, dl: d, raster: fieldRaster(d.grid, d.da, validOf(pf.f, d.grid), STUDIO_RAMPS.da), read: `sDA ${Math.round(d.pctLit * 100)}% of the floor at ${d.target} lux half the occupied hours` }
          : { layer, dl: d, raster: fieldRaster(d.grid, d.df, validOf(pf.f, d.grid), STUDIO_RAMPS.df), read: `Mean daylight factor ${(d.mean * 100).toFixed(1)}%` }
      }
      DL_TIMES.annualRaster = performance.now() - t1
      lru(annRasters, key, A, 18)
      tick((n) => n + 1)
    }, 40)
    return () => { live = false; clearTimeout(timer) }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return { A: hit, busy: !!key && !hit }
}

/** The size of an element, for drawings laid out in pixels. */
export function useSize<T extends HTMLElement>(): [React.RefObject<T | null>, { w: number; h: number }] {
  const ref = useRef<T | null>(null), [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => { const r = el.getBoundingClientRect(); setSize((s) => (Math.abs(s.w - r.width) < 0.5 && Math.abs(s.h - r.height) < 0.5 ? s : { w: Math.round(r.width), h: Math.round(r.height) })) }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size]
}

if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __tdtDl: unknown }).__tdtDl = { DL_TIMES }
