// Tower forms in the Typology tab (16 Nov, Sinnie): dtmass's Tapered shaft, Twisting tower, Set-back tiers and Shifted
// stack as her silhouette tiles, each with her sliders, shaping the selected tower's shaft above its podium live
// (engine/towerForms.ts, lib/towerForm.ts). With no tower yet, picking a form places the starting tower first. A drawn
// or imported mass keeps its own geometry. Each pick and each slider drag is one Undo step.
import { useStore, useTowers } from '../../store'
import { FORM_ICON, FORM_PARAMS, FORM_TYPES, formDefaults, type FormType } from '../../engine/towerForms'
import { applyForm } from '../../lib/towerForm'
import { breakStep } from '../../lib/project/history'
import { placeFirstTower } from './NoTower'

const TYPES = Object.keys(FORM_TYPES) as FormType[]

export default function TowerForms() {
  const towers = useTowers()
  const selected = useStore((s) => s.selectedTower)
  const t = towers.find((x) => x.id === selected) ?? towers[0] ?? null
  const shapeable = !t || (!t.drawn && !t.imported)
  const type: FormType = t?.form?.type ?? 'none'
  const p = { ...formDefaults(type), ...(t?.form?.p ?? {}) }
  const pick = (k: FormType) => {
    if (!t) placeFirstTower()
    const id = useStore.getState().selectedTower
    breakStep(); applyForm(id, k, formDefaults(k)); breakStep()
  }
  const set = (key: string, v: number) => { if (t) applyForm(t.id, type, { ...p, [key]: v }) }
  return (
    <section data-testid="tower-forms" aria-labelledby="tower-forms-head" className="px-3 py-2">
      <h4 id="tower-forms-head" className="text-control font-semibold text-ink">Tower form{t ? <span className="font-normal text-muted"> · {t.name}</span> : null}</h4>
      <div role="radiogroup" aria-label="Tower form" className="mt-1.5 grid grid-cols-5 gap-1">
        {TYPES.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={type === k} data-form={k} disabled={!shapeable} title={`${FORM_TYPES[k].name}: ${FORM_TYPES[k].blurb}`} onClick={() => pick(k)}
            className={`flex flex-col items-center gap-0.5 rounded-md border px-0.5 py-1 outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 ${type === k ? 'border-accent bg-accent/[0.08]' : 'border-line bg-panel hover:border-accent'}`}>
            <svg viewBox="0 0 26 38" className="h-8 w-6" aria-hidden fill={type === k ? '#1f5f8b' : '#9aa3ad'} stroke={type === k ? '#1f5f8b' : '#7d8792'} strokeWidth="0.8"
              dangerouslySetInnerHTML={{ __html: FORM_ICON[k] }} />
            <span className={`text-center text-[10px] leading-tight ${type === k ? 'font-semibold text-ink' : 'text-muted'}`}>{FORM_TYPES[k].name}</span>
          </button>
        ))}
      </div>
      {!shapeable && <p className="mt-1 text-meta text-muted">A drawn or imported mass keeps its own shape: shape it with the drawing tools.</p>}
      {shapeable && t && FORM_TYPES[type].params.map((key) => {
        const d = FORM_PARAMS[key]
        return (
          <label key={key} className="mt-1.5 block text-meta">
            <span className="flex justify-between text-muted"><span>{d.label}</span><output className="tabular-nums text-ink">{d.fmt(p[key])}</output></span>
            <input type="range" min={d.min} max={d.max} step={d.step} value={p[key]} aria-label={d.label} data-param={key} className="w-full"
              onPointerDown={() => breakStep()} onPointerUp={() => breakStep()} onKeyUp={() => breakStep()}
              onChange={(e) => set(key, Number(e.target.value))} />
          </label>
        )
      })}
    </section>
  )
}
