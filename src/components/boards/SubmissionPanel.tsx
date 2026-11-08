// Check and export (research P13-M01 tracker + P13-M06v validator + M06c release gate): checks per board, the brief's
// deliverables, the deadline, JPEG export under 10 MB with the validator run on the exported bytes, a validator for
// boards made elsewhere, the deny-list and the upload gates. The tool never uploads.
import { CheckCircle2, ChevronDown, Clock, Download, FileCheck2, Loader2, ShieldAlert } from '../icons'
import { useEffect, useMemo, useState } from 'react'
import {
  DELIVERABLES, GATES, MILESTONES, boardChecks, coverage, deadlineInfo, isBoardUsed, submissionChecks, validateJpeg, type Manifest,
} from '../../engine/boards'
import type { RuleResult } from '../../engine/types'
import { exportBoardJpeg, type EvidenceSet } from '../../lib/boardRender'
import { useBoardStore } from '../../lib/boardStore'
import { FlagChip, StateChip } from '../ui'

const H = 'mb-1.5 text-meta font-semibold text-slate-400'

function RuleRow({ r }: { r: RuleResult }) {
  const [open, setOpen] = useState(r.state === 'fail')
  return (
    <div className="rounded border border-white/10 bg-white/[0.03] px-2 py-1.5">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 text-left">
        <StateChip state={r.state} />
        <span className="min-w-0 flex-1 truncate text-meta font-medium">{r.label}</span>
        <ChevronDown size={12} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className="mt-0.5 text-meta text-slate-200">{r.value}</div>
      {open && (
        <div className="mt-1 grid gap-1 text-meta text-slate-300">
          <div>Needs: {r.threshold}</div>
          {r.note && <div>{r.note}</div>}
          <div className="flex flex-wrap items-center gap-1"><FlagChip flag={r.flag} /><span className="text-slate-400">{r.source.label}{r.source.page ? `, ${r.source.page}` : ''}</span></div>
        </div>
      )}
    </div>
  )
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export default function SubmissionPanel({ evidence, overflow }: { evidence: Record<string, EvidenceSet>; overflow: Record<string, string[]> }) {
  const { boards, images, denyList, dpi, ticks, exports, setDeny, setDpi, tick, setExport } = useBoardStore()
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<{ manifest: Manifest; rules: RuleResult[] }[]>([])
  const [profile, setProfile] = useState<'board' | 'cover'>('board')
  const [denyText, setDenyText] = useState(denyList.join('\n'))
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t) }, [])

  const d = deadlineInfo(now)
  const perBoard = useMemo(() => boards.map((b, i) => boardChecks(b, i + 1, { boards, images, denyList, overflow })), [boards, images, denyList, overflow])
  const sub = useMemo(() => submissionChecks(boards), [boards])
  const cov = useMemo(() => coverage(boards), [boards])

  // Open items that block "ready to upload" (P13-M06c): rule fails, boards not exported since the last edit, gates not ticked.
  const open: string[] = []
  boards.forEach((b, i) => {
    perBoard[i].filter((r) => r.state === 'fail').forEach((r) => open.push(`Board ${i + 1}: ${r.label.toLowerCase()}`))
    if (isBoardUsed(b) && !exports[b.id]) open.push(`Board ${i + 1}: export the JPEG`)
    exports[b.id]?.rules.filter((r) => r.state === 'fail').forEach((r) => open.push(`Board ${i + 1} JPEG: ${r.label.toLowerCase()}`))
  })
  if (boards.filter(isBoardUsed).length < 4) open.push('Fill all four boards (or get Buildner\'s answer on fewer)')
  for (const g of GATES) {
    if (g.perBoard) boards.forEach((b, i) => { if (!ticks[`${g.id}:${b.id}`]) open.push(`Board ${i + 1}: ${g.label}`) })
    else if (!ticks[g.id]) open.push(g.label)
  }

  const runExport = async (indexes: number[]) => {
    setError('')
    for (const i of indexes) {
      const b = boards[i]
      if (!isBoardUsed(b)) continue
      setBusy(`Board ${i + 1}`)
      try {
        const r = await exportBoardJpeg(b, { images, evidence, index: i, total: boards.length }, dpi)
        const name = `board-${i + 1}.jpg`
        const v = validateJpeg(name, r.bytes, { denyList, profile: 'board' })
        setExport(b.id, { at: new Date().toISOString(), name, bytes: r.bytes.length, quality: r.quality, dpi: r.dpi, manifest: v.manifest, rules: v.rules })
        download(r.blob, name)
      } catch (e) { setError(`Board ${i + 1}: ${(e as Error).message}`) }
    }
    setBusy(null)
  }

  const checkFiles = async (files: FileList) => {
    const out: { manifest: Manifest; rules: RuleResult[] }[] = []
    for (const f of [...files]) out.push(validateJpeg(f.name, new Uint8Array(await f.arrayBuffer()), { denyList, profile }))
    setChecked(out)
  }

  const used = boards.filter(isBoardUsed).length
  return (
    <div className="grid gap-5 p-3 text-slate-200">
      <section aria-label="Upload status" className={`rounded-md border p-2.5 ${open.length ? 'border-amber-400/40 bg-amber-400/10' : 'border-emerald-400/40 bg-emerald-400/10'}`}>
        <div className="flex items-center gap-2 text-sm font-semibold">{open.length ? <ShieldAlert size={15} className="text-amber-300" /> : <CheckCircle2 size={15} className="text-emerald-300" />}{open.length ? `Not ready to upload: ${open.length} open` : 'Ready to upload'}</div>
        <p className="mt-1 text-meta text-slate-300">{open.length ? 'Export early, upload once: after the first upload, changes need a paid reactivation (Terms 4.7, per research).' : 'Upload the four JPEGs yourself at the Buildner panel, once. This tool never uploads.'}</p>
        {open.length > 0 && <ul className="mt-1.5 max-h-28 list-disc overflow-y-auto pl-4 text-meta text-slate-200">{open.slice(0, 40).map((o, i) => <li key={i}>{o}</li>)}</ul>}
      </section>

      <section aria-label="Deadline">
        <div className={H}>Deadline</div>
        <div className="flex items-start gap-2 rounded border border-white/10 p-2">
          <Clock size={15} className="mt-0.5 text-sky-300" />
          <div className="text-meta">
            <div className="text-sm font-semibold">{d.closed ? 'Closed' : `${Math.floor(d.days)} days ${Math.floor((d.days % 1) * 24)} h left`}</div>
            <div>{d.london} London · {d.vancouver} Vancouver</div>
            {d.vanOffset !== null && d.vanOffset !== -420 && <div className="mt-0.5 text-amber-300">This browser puts Vancouver at UTC{d.vanOffset / 60} on 30 Nov; research P13 found BC on UTC−7 year-round from 2026 (unverified here). Go by London time: 11:59 PM.</div>}
            <div className="mt-1 flex flex-wrap items-center gap-1"><FlagChip flag="verified" /><span className="text-slate-400">VTC brief, p.25</span></div>
          </div>
        </div>
        <ul className="mt-1.5 grid gap-0.5 text-meta">
          {MILESTONES.map((m) => { const past = Date.parse(`${m.date}T23:59:00Z`) < now; return <li key={m.date} className={past ? 'text-slate-500 line-through' : ''}><span className="tabular-nums text-slate-400">{m.date}</span> · {m.label}</li> })}
        </ul>
      </section>

      <section aria-label="Submission checks">
        <div className={H}>Submission</div>
        <div className="grid gap-1.5">{sub.map((r) => <RuleRow key={r.id} r={r} />)}</div>
      </section>

      {boards.map((b, i) => (
        <section key={b.id} aria-label={`Board ${i + 1} checks`}>
          <div className={H}>Board {i + 1}{isBoardUsed(b) ? '' : ' · empty'}</div>
          <div className="grid gap-1.5">
            {perBoard[i].map((r) => <RuleRow key={r.id} r={r} />)}
            {exports[b.id] && (
              <div className="rounded border border-sky-400/30 p-1.5">
                <div className="mb-1 text-meta text-sky-200">Exported {exports[b.id].name}: {(exports[b.id].bytes / 1e6).toFixed(2)} MB at {exports[b.id].dpi} dpi, quality {Math.round(exports[b.id].quality * 100)}</div>
                <div className="grid gap-1">{exports[b.id].rules.map((r) => <RuleRow key={r.id} r={r} />)}</div>
              </div>
            )}
            {isBoardUsed(b) && <button type="button" disabled={!!busy} onClick={() => runExport([i])} className="flex items-center justify-center gap-1.5 rounded border border-white/15 px-2 py-1 text-meta hover:border-sky-400 disabled:opacity-50"><Download size={12} />Export board {i + 1} as JPEG</button>}
          </div>
        </section>
      ))}

      <section aria-label="Export">
        <div className={H}>Export all</div>
        <div className="flex items-center gap-2">
          <select value={dpi} onChange={(e) => setDpi(Number(e.target.value) as 150 | 200)} aria-label="Export resolution" className="rounded border border-white/15 bg-slate-900 px-2 py-1 text-xs">
            <option value={150}>150 dpi (3508 × 2480 px)</option>
            <option value={200}>200 dpi (4677 × 3307 px)</option>
          </select>
          <button type="button" disabled={!!busy || used === 0} onClick={() => runExport([0, 1, 2, 3])} className="flex flex-1 items-center justify-center gap-1.5 rounded bg-sky-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50">
            {busy ? <><Loader2 size={13} className="animate-spin" />{busy}…</> : <><Download size={13} />Export {used} JPEG{used === 1 ? '' : 's'}</>}
          </button>
        </div>
        <p className="mt-1 text-meta text-slate-400">Neutral file names, no metadata, highest quality under 9.5 MB (team margin under the 10 MB limit). Each file is checked again after export.</p>
        {error && <p className="mt-1 text-meta text-red-300">{error}</p>}
      </section>

      <section aria-label="Deliverables">
        <div className={H}>Brief's suggested set (p.30)</div>
        <table className="w-full text-meta">
          <thead><tr className="text-left text-meta text-slate-400"><th className="font-medium">Item</th>{boards.map((_, i) => <th key={i} className="w-5 text-center font-medium">{i + 1}</th>)}<th className="w-9 text-right font-medium">Min</th></tr></thead>
          <tbody>
            {DELIVERABLES.map((dl) => {
              const per = boards.map((b) => b.frames.filter((f) => f.tag === dl.id && f.content.kind !== 'empty').length)
              const met = cov[dl.id] >= dl.min
              return (
                <tr key={dl.id} className="border-t border-white/5">
                  <td className="py-0.5 pr-1"><span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${met ? 'bg-emerald-400' : cov[dl.id] ? 'bg-amber-400' : 'bg-slate-500'}`} />{dl.label}</td>
                  {per.map((n, i) => <td key={i} className="text-center tabular-nums text-slate-300">{n || ''}</td>)}
                  <td className="text-right tabular-nums text-slate-400">{cov[dl.id]}/{dl.min}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="mt-1 text-meta text-slate-400">Tag frames in Compose. The set is "a suggestion only" (p.30); coverage counts presence, not quality.</p>
      </section>

      <section aria-label="Upload gates">
        <div className={H}>Before you upload</div>
        <div className="grid gap-2">
          {GATES.map((g) => (
            <div key={g.id} className="rounded border border-white/10 p-2">
              <div className="text-meta font-medium">{g.label}</div>
              <div className="mt-0.5 text-meta text-slate-300">{g.detail}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {g.perBoard
                  ? boards.map((b, i) => <label key={b.id} className="flex items-center gap-1 text-meta"><input type="checkbox" checked={!!ticks[`${g.id}:${b.id}`]} onChange={() => tick(`${g.id}:${b.id}`)} />{i + 1}</label>)
                  : <label className="flex items-center gap-1 text-meta"><input type="checkbox" checked={!!ticks[g.id]} onChange={() => tick(g.id)} />Done</label>}
                <span className="ml-auto flex items-center gap-1"><FlagChip flag={g.flag} /><span className="text-meta text-slate-400">{g.source.label}{g.source.page ? `, ${g.source.page}` : ''}</span></span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Identifying words">
        <div className={H}>Identifying words (deny-list)</div>
        <textarea value={denyText} rows={5} onChange={(e) => setDenyText(e.target.value)} onBlur={() => setDeny(denyText.split(/\n|,/).map((t) => t.trim()).filter(Boolean))}
          aria-label="Identifying words, one per line" className="w-full rounded border border-white/15 bg-slate-900 px-2 py-1 font-mono text-meta text-slate-100" />
        <p className="mt-1 text-meta text-slate-400">One per line. Add your names, school, firm, course codes and email domains. Kept in this browser only; used for board text, file names and JPEG metadata.</p>
      </section>

      <section aria-label="Check JPEG files">
        <div className={H}>Check JPEGs made elsewhere</div>
        <div className="flex items-center gap-2">
          <select value={profile} onChange={(e) => setProfile(e.target.value as 'board' | 'cover')} aria-label="File type" className="rounded border border-white/15 bg-slate-900 px-2 py-1 text-xs">
            <option value="board">Board (A2, p.27)</option>
            <option value="cover">Cover image (p.28)</option>
          </select>
          <label className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded border border-dashed border-white/25 px-2 py-1.5 text-xs hover:border-sky-400">
            <FileCheck2 size={13} />Choose files
            <input type="file" accept=".jpg,.jpeg,image/jpeg,image/*" multiple className="hidden" onChange={(e) => { if (e.target.files) void checkFiles(e.target.files); e.target.value = '' }} />
          </label>
        </div>
        <p className="mt-1 text-meta text-slate-400">Read in the browser; nothing leaves this computer. Reads format, size, proportion, encoding and metadata; it cannot read text inside images.</p>
        {checked.map((c, i) => (
          <div key={i} className="mt-2 grid gap-1">
            <div className="text-meta font-medium">{c.manifest.name} · {c.manifest.info.width} × {c.manifest.info.height} px</div>
            {c.rules.map((r) => <RuleRow key={r.id} r={r} />)}
          </div>
        ))}
      </section>
    </div>
  )
}
