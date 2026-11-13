// Sun & time in the Layers panel (Sinnie, 13 Nov: "can you move this sun function to layers"). One tile switches the
// shadows on (the Sun & shadow preview check); while it is on, the date and hour sit under the tiles.
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store'
import { NumberField } from './ui'

export const useSunOn = () => useStore((s) => !!s.enabled['built.sun'])
export function setSunOn(v: boolean) {
  const s = useStore.getState()
  if (!!s.enabled['built.sun'] !== v) s.toggleNode('built.sun')
}

/** Month, day and hour, with the hour as a slider too. */
export function SunTimeFields() {
  const { sun, set } = useStore(useShallow((s) => ({ sun: s.sun, set: s.set })))
  return (
    <div className="grid grid-cols-3 gap-2" data-testid="sun-time">
      <NumberField label="Month" value={sun.month} onChange={(v) => set({ sun: { ...sun, month: Math.min(12, Math.max(1, Math.round(v))) } })} />
      <NumberField label="Day" value={sun.day} onChange={(v) => set({ sun: { ...sun, day: Math.min(31, Math.max(1, Math.round(v))) } })} />
      <NumberField label="Hour" value={sun.hour} onChange={(v) => set({ sun: { ...sun, hour: Math.min(21, Math.max(5, v)) } })} step={0.25} />
      <input type="range" min={5} max={21} step={0.25} value={sun.hour} onChange={(e) => set({ sun: { ...sun, hour: Number(e.target.value) } })} className="col-span-3 accent-accent" aria-label="Time of day" />
    </div>
  )
}
