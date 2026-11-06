// The analysis switch (process rail; Ruijie, 6 Nov: "they could choose to run analysis or not"). The checks a user has
// switched on stay remembered either way (store `enabled`, saved in the project file); with analysis off they don't
// run, and their results, readouts and overlays are hidden until it is back on.
import { useStore } from '../store'

type S = { analysis: boolean; enabled: Record<string, boolean> }

/** A check runs: analysis is on and the check is switched on. */
export const nodeOn = (s: S, id: string) => s.analysis && !!s.enabled[id]

/** Hook form of nodeOn. */
export const useNodeOn = (id: string) => useStore((s) => nodeOn(s, id))

export const useAnalysis = () => useStore((s) => s.analysis)
