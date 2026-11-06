// Future towers around the competition block, from the competition context (lib/vtcContextSource: the entrant's own copy
// of the base model, or public/local on a developer's computer; never published), for the tower separation check.
// Without the context the check runs on the project's own towers only.
import { useEffect } from 'react'
import type { VtcContext } from '../context'
import type { Neighbour } from '../engine/publicRealm'
import { loadVtcContext, useVtcSource } from './vtcContextSource'

// One list per context for every caller: a new [] per render made useResults recompute every check on every render.
const NONE: Neighbour[] = []
const lists = new WeakMap<VtcContext, Neighbour[]>()

function neighboursOf(ctx: VtcContext): Neighbour[] {
  let list = lists.get(ctx)
  if (!list) {
    list = (ctx.future_towers ?? []).filter((f) => f.z1).map((f, i) => ({ label: `Future tower ${i + 1} (${Math.round(f.z1 as number)} m)`, footprint: f.footprint, height: f.z1 as number }))
    lists.set(ctx, list)
  }
  return list
}

export function useVtcNeighbours(enabled: boolean): Neighbour[] {
  const ctx = useVtcSource((s) => s.ctx)
  useEffect(() => { if (enabled) void loadVtcContext() }, [enabled])
  return enabled && ctx ? neighboursOf(ctx) : NONE
}
