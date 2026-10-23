// Future towers around the competition block, read once from the local context model (public/local, never published),
// for the tower separation check. Without the file the check runs on the project's own towers only.
import { useEffect, useState } from 'react'
import type { Neighbour } from '../engine/publicRealm'

let cache: Promise<Neighbour[]> | null = null

function load(): Promise<Neighbour[]> {
  if (!cache) {
    cache = fetch('./local/vtc_context.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((ctx: { future_towers?: { footprint: [number, number][]; z1: number | null }[] }) =>
        (ctx.future_towers ?? []).filter((f) => f.z1).map((f, i) => ({ label: `Future tower ${i + 1} (${Math.round(f.z1 as number)} m)`, footprint: f.footprint, height: f.z1 as number })))
      .catch(() => [])
  }
  return cache
}

export function useVtcNeighbours(enabled: boolean): Neighbour[] {
  const [list, setList] = useState<Neighbour[]>([])
  useEffect(() => {
    if (!enabled) return
    let live = true
    load().then((n) => { if (live) setList(n) })
    return () => { live = false }
  }, [enabled])
  return enabled ? list : []
}
