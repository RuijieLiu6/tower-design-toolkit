// Shared plumbing of the Sun & Wind Studio checks (wind comfort, daylight, ventilation, energy), after the 17 Nov review:
// one worker per check where a new job stops a run still in flight (its result would be stale, and it frees the worker's
// caches); when the City data is complete enough to run on, and a key that changes when its buildings do; and whether a
// stored result still belongs to the project and model on screen.

/** A worker for one check. `post` stops a job still running before sending the new one; an error stops the worker. */
export function workerRunner<O extends { id: number }>(make: () => Worker, on: { message: (o: O) => boolean; error: (msg: string) => void }) {
  let w: Worker | null = null, busy = false, seq = 0
  const get = () => {
    if (!w) {
      const nw = make()
      nw.onmessage = (e: MessageEvent<O>) => { if (e.data.id !== seq) return; if (on.message(e.data)) busy = false }
      nw.onerror = (e) => { nw.terminate(); if (w === nw) w = null; busy = false; on.error(e.message || 'The worker failed to start') }
      w = nw
    }
    return w
  }
  return {
    /** Send a job (its `id` is set here); a job still running is stopped first. Returns the job's id. */
    post<J extends object>(job: J, transfer: Transferable[] = []): number {
      if (busy && w) { w.terminate(); w = null }
      busy = true; seq++
      get().postMessage({ ...job, id: seq }, transfer)
      return seq
    },
    /** Stop whatever is running (the check was switched off or its inputs went away). */
    stop() { if (busy && w) { w.terminate(); w = null } busy = false; seq++ },
    get seq() { return seq },
  }
}

/** The City data a check can run on: the detailed buildings have loaded (the first stage has terrain only). */
export interface CityLike { data: { model: string; detailStatus: string; footprints: unknown[] } | null; heights: unknown; hidden: ReadonlySet<number> }
export const cityDetailReady = (c: CityLike) => !!c.data && c.data.detailStatus !== 'loading'
/** Changes whenever the buildings a run would see change: the building model, its detail stage, footprints, heights, hidden ones. */
export function cityKey(c: CityLike): string | null {
  if (!c.data) return null
  return `${c.data.model}|${c.data.detailStatus}|${c.data.footprints.length}|${c.heights ? 'h' : '-'}|${[...c.hidden].sort((a, b) => a - b).join(',')}`
}

/** A stored result is current when it was run for the project and model on screen and the check is not rerunning or failed. */
export const isCurrent = (out: { project: string; rev: string } | null, status: string, project: string, rev: string) => !!out && status === 'ready' && out.project === project && out.rev === rev

/**
 * The debounced start of a run, shared by every component that calls a check's hook: one pending start at a time, for
 * the newest key. A component going away drops the start it scheduled (`release`), and the hook then asks the others to
 * schedule it again, so closing one view neither leaves a stale start behind nor loses the run another view still needs.
 */
export function runScheduler(delay = 400) {
  let pending: { key: string; owner: symbol; t: ReturnType<typeof setTimeout> } | null = null
  return {
    schedule(key: string, posted: string, owner: symbol, fire: () => void) {
      if (key === posted || pending?.key === key) return
      if (pending) clearTimeout(pending.t)
      const p = { key, owner, t: setTimeout(() => { if (pending === p) pending = null; fire() }, delay) }
      pending = p
    },
    /** True when this owner had the pending start (dropped now). */
    release(owner: symbol) { if (pending && pending.owner === owner) { clearTimeout(pending.t); pending = null; return true } return false },
    cancel() { if (pending) { clearTimeout(pending.t); pending = null } },
  }
}
