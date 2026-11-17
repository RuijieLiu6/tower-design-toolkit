// Floor area and FSR on the Your site tab (17 Nov, Sinnie: moved from the Program tool on the left — "if there's any
// updated information on the site for area and stuff, reflect it in the site properties panel on the right instead").
// The gross floor area of every tower by use, as bars, then the FSR over the site (FsrSiteLine: the competition block
// with its tier gauge, or the Real Vancouver study site's lots or boundary with its source and flag).
import { Layers2 } from '../icons'
import { PROGRAM_ICONS } from '../../data/icons'
import { USES, type UseId } from '../../engine/types'
import { useResults } from '../../hooks/useResults'
import FsrSiteLine from '../FsrSiteLine'
import { FlagChip } from '../ui'
import { useStore } from '../../store'
import { TIER_LABEL, type FsrTier } from '../../engine/vtcRules'

const card = 'm-3 rounded-lg border border-accent/35 bg-accent/[0.05] px-3 py-2.5 text-meta shadow-sm'

export default function SiteFloorArea() {
  const { fsr } = useResults()
  const project = useStore((x) => x.project), fsrTier = useStore((x) => x.fsrTier), set = useStore((x) => x.set)
  const rows = Object.entries(fsr.gfa).filter(([, v]) => v > 0) as [UseId, number][]
  const max = Math.max(1, ...rows.map(([, v]) => v))
  const total = rows.reduce((a, [, v]) => a + v, 0)
  return (
    <section aria-labelledby="site-area-title" data-testid="site-floor-area" className={card}>
      <h3 id="site-area-title" className="flex items-center gap-1.5 text-xs font-semibold text-accent"><Layers2 size={14} aria-hidden />Floor area and FSR
        <span className="ml-auto font-mono text-xs font-semibold tabular-nums text-ink">{Math.round(total).toLocaleString('en-CA')} m²</span></h3>
      {rows.length ? (
        <div className="mt-1.5 grid gap-1">
          {rows.map(([u, v]) => { const Icon = PROGRAM_ICONS[u]; return (
            <div key={u} className="flex items-center gap-2" data-use={u}>
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-white" style={{ background: USES[u].color }} title={USES[u].label}><Icon size={10} /></span>
              <span className="w-20 truncate text-muted">{USES[u].label}</span>
              <div className="h-2 min-w-0 flex-1 rounded bg-slate-100"><div className="h-2 rounded" style={{ width: `${(v / max) * 100}%`, background: USES[u].color }} /></div>
              <span className="w-[4.5rem] text-right tabular-nums text-ink">{Math.round(v).toLocaleString('en-CA')} m²</span>
            </div>
          ) })}
        </div>
      ) : <p className="mt-1 text-muted">No floor area yet: place a mass in the Massing step.</p>}
      <FsrSiteLine totalFsr={fsr.totalFsr} siteArea={fsr.siteArea} tiers={[fsr.tier1, fsr.tier2, fsr.tier3]} />
      {project === 'vtc' && (
        <label className="mt-1.5 grid gap-1"><span className="flex items-center gap-1 text-muted">Uses that count toward the 9.0 FSR <FlagChip flag="team_assumption" /></span>
          <select value={fsrTier} data-testid="fsr-tier" onChange={(e) => set({ fsrTier: Number(e.target.value) as FsrTier })} className="h-8 rounded-md border border-line bg-white px-1.5 text-control">
            {([1, 2, 3] as FsrTier[]).map((k) => <option key={k} value={k}>{TIER_LABEL[k]}</option>)}
          </select></label>
      )}
    </section>
  )
}
