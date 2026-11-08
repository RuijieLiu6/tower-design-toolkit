// User guide (#/guide, backlog item 30): what each stage does, how evidence works, Customize, files, options, and the
// offline app. Stage names and flag meanings come from the app's own definitions (data/stages.ts, components/ui.tsx), so
// the guide cannot drift from what the app shows.
import { ArrowLeft, BookOpen, Download, Route as RouteIcon, WifiOff, Workflow } from '../components/icons'
import { useEffect, useState, type ReactNode } from 'react'
import { STAGES } from '../data/stages'
import { FLAG_META, FlagChip, StateChip } from '../components/ui'
import type { Flag } from '../engine/types'
import { installApp, installHint, useOffline } from '../lib/pwa/install'
import { navigate, type Route } from '../lib/route'
import { useStore } from '../store'
import { UnitSelect } from '../components/Units'

const SECTIONS = [
  ['start', 'Getting started'], ['projects', 'Two projects'], ['stages', 'The three stages'], ['nodes', 'Nodes'], ['evidence', 'Evidence flags'],
  ['customize', 'Customize'], ['files', 'Saving, import and export'], ['options', 'Design options'], ['offline', 'Offline and install'], ['units', 'Units'], ['keys', 'Keyboard'],
] as const

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 border-t border-line pt-5">
      <h2 className="text-section">{title}</h2>
      <div className="mt-2 space-y-2 text-body text-ink/90">{children}</div>
    </section>
  )
}

const Go = ({ to, children }: { to: Route; children: ReactNode }) => (
  <button onClick={() => navigate(to)} className="font-medium text-accent underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent">{children}</button>
)
const Key = ({ children }: { children: ReactNode }) => <kbd className="rounded border border-line bg-panel px-1.5 py-0.5 font-mono text-meta">{children}</kbd>

function Install() {
  const { offer, installed, offlineReady } = useOffline()
  const [msg, setMsg] = useState('')
  if (installed) return <p className="text-meta text-muted">Running as an installed app.</p>
  return (
    <div className="flex flex-wrap items-center gap-2">
      {offer && <button onClick={async () => setMsg((await installApp()) ? 'Installed.' : 'Not installed.')} className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"><Download size={14} aria-hidden />Install app</button>}
      <span className="text-meta text-muted">{msg || (offer ? 'Or use the browser menu.' : installHint())}</span>
      <span className="w-full text-meta text-muted">{offlineReady ? 'This copy works offline: it is saved in this browser.' : import.meta.env.PROD ? 'Getting the offline copy ready…' : 'The development server has no offline copy: build it (npm run build, then npm run preview) to try installing.'}</span>
    </div>
  )
}

export default function Guide() {
  const reduced = useStore((s) => s.reducedMotion)
  useEffect(() => { document.title = 'User guide · Tower Design Toolkit' }, [])
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })

  return (
    <div data-stage="basic" data-reduced={reduced} className="h-full overflow-y-auto bg-paper text-ink">
      <div className="mx-auto flex max-w-5xl gap-8 px-6 py-6 md:px-10">
        <nav aria-label="Guide sections" className="sticky top-6 hidden h-fit w-44 shrink-0 md:block">
          <ul className="space-y-1 text-meta">
            {SECTIONS.map(([id, t]) => <li key={id}><button onClick={() => jump(id)} className="text-left text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent">{t}</button></li>)}
          </ul>
        </nav>
        <main className="min-w-0 flex-1 space-y-5 pb-16">
          <header className="flex flex-wrap items-center gap-3">
            <button onClick={() => navigate('start')} className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><ArrowLeft size={14} aria-hidden />Start</button>
            <h1 className="flex items-center gap-2 text-display-sm md:text-display"><BookOpen size={28} aria-hidden />User guide</h1>
            <span className="ml-auto flex gap-1.5">
              <button onClick={() => navigate('guided')} className="flex items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs font-medium outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent"><RouteIcon size={14} aria-hidden />Guided process</button>
              <button onClick={() => navigate('customize')} className="flex items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs font-medium outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent"><Workflow size={14} aria-hidden />Customize</button>
            </span>
          </header>
          <p className="text-body text-muted">Tower Design Toolkit helps you design a tall building for Vancouver and shows the evidence behind every result. It is a study tool for early design: it does <b className="text-ink">not</b> determine compliance. View-cone heights are estimates; the City of Vancouver's assessment governs.</p>

          <Section id="start" title="Getting started">
            <p>The <Go to="start">start page</Go> offers two ways in. <b>Guided process</b> takes you through the design stages with the checks already switched on. <b>Customize</b> lets you build your own workflow from the node library. You can ask the start page to open your choice directly next time.</p>
            <p>New here? On the start page, <b>Take the tour</b> walks through the app in eight short steps (skip it at any time), and <b>Open the demo project</b> loads two towers on the competition block with every built check on. <Go to="status">Build status</Go> lists what is built and what is still research.</p>
          </Section>

          <Section id="projects" title="Two projects">
            <p><b>Competition site</b> is the Vancouver Tall Challenge block, checked against the brief's hard rules. Its surrounding buildings come from the competition's base model, which belongs to Buildner and is never published: you only see them if you have the model and convert it on your own computer (see the README).</p>
            <p><b>Real Vancouver</b> places a study tower downtown with City open data: building footprints, roof heights where measured, terrain to the North Shore mountains, the protected view cones and the height limit they imply. Each layer lists its source and licence.</p>
          </Section>

          <Section id="stages" title="The three stages">
            <ol className="space-y-2">
              {STAGES.map((s) => { const Icon = s.icon; return (
                <li key={s.id} className="flex gap-3"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-panel"><Icon size={15} aria-hidden /></span>
                  <span><b>{s.label}</b> <span className="text-muted">({s.subtitle}, key <Key>{s.key}</Key>)</span>: {s.purpose}</span></li>
              ) })}
            </ol>
            <p>A stage changes how the model is drawn and which tools are offered; the checks keep running in every stage. In <b>Massing</b>, the <b>Design</b> tab sets height, footprint, podium and the program by floor band, and <b>Place on map</b> moves the tower. <b>Results &amp; evidence</b> shows every switched-on check; the <b>Trace</b> tab records how the results changed as you worked. <b>Present</b> locks the model, frames camera views and captures images for the boards.</p>
          </Section>

          <Section id="nodes" title="Nodes">
            <p>Every check is a <b>node</b>: VTC hard rules, FSR, view cones, core and lifts, egress, solar access and many more. In the guided app the design tools are on the left and the results on the right; the nodes are the icons in the bar at the bottom. Hover an icon to read its name and click it to switch the node on. <b>Library</b> at the bar's left end searches every node and has the presets, which switch on a set at once. <b>Built</b> nodes compute live from your design. <b>Researched</b> nodes show their method, thresholds and sources but don't compute yet.</p>
            <p>Each result shows a state, its value, and the source it comes from: <StateChip state="pass" /> <StateChip state="warn" /> <StateChip state="fail" /> <StateChip state="unknown" />. "Check" means the design is close to a limit or needs a judgement; "Unknown" means the tool cannot tell, and it says why instead of guessing.</p>
            <p>You can build your own nodes with the node builder and install shared ones from <b>Community</b> in Customize. <Go to="sources">Sources &amp; assumptions</Go> lists every source any node cites and every team assumption you can edit.</p>
          </Section>

          <Section id="evidence" title="Evidence flags">
            <p>Every number carries a flag that says how far you can trust it and where it comes from.</p>
            <ul className="space-y-1.5">
              {(Object.keys(FLAG_META) as Flag[]).map((f) => <li key={f} className="flex flex-wrap items-center gap-2"><FlagChip flag={f} /><span>{FLAG_META[f].title}.</span></li>)}
            </ul>
            <p>A false assumption is never hidden: it stays on screen in magenta with its correction, so a board can't quietly repeat it.</p>
          </Section>

          <Section id="customize" title="Customize">
            <p><Go to="customize">Customize</Go> is a canvas for your own workflow. Drag nodes from the ribbon (or press the search shortcut shown there), connect their results to logic nodes (<b>All pass</b>, <b>Any fail</b>, <b>Weighted score</b>, <b>Compare two options</b>), and read the outcome live on the canvas.</p>
            <p>Save workflows in this browser, or export and import them as <code>.json</code> to share. <b>Run in guided app</b> switches on exactly the workflow's checks and opens the guided process.</p>
          </Section>

          <Section id="files" title="Saving, import and export">
            <p>Your design is saved in this browser as you work and comes back when you return. The <b>project menu</b> (top left in the guided app) has <b>New project</b>, <b>Open…</b>, <b>Save</b>, <b>Save as…</b>, <b>Export .json</b> and <b>Import .json…</b>. A project file holds the design, your decisions and the trace; send it to a teammate to share the whole state.</p>
            <p>To bring in your own massing, use <b>Import</b> in the <b>Towers &amp; site</b> design tool: Rhino <code>.3dm</code>, OBJ, glTF / GLB and IFC. SketchUp and Revit files can't be read in a browser; the app tells you how to export them (OBJ from SketchUp, IFC from Revit). Imported masses are cut into storeys so the checks can read them.</p>
            <p>Browser storage belongs to one browser on one computer: export a project file to keep a copy or to move to another machine.</p>
          </Section>

          <Section id="options" title="Design options">
            <p><Go to="options">Design options</Go> (top bar, Present, or Customize) saves up to four named versions of the design and compares them: a massing elevation of each at one scale, every switched-on node's state and flag with <b>Better</b> / <b>Worse</b> / <b>Changed</b> / <b>Same</b> against the first option, and a chart by jury criterion (human scale, cultural context, design excellence, urban integration).</p>
            <p>The chart starts from the brief's weights, 40 / 30 / 20 / 10; weights you change are flagged as a team assumption. <b>It is not the jury's score</b>, only a study aid built from the tool's checks. <b>Explain the difference</b> lists the inputs that differ and which results each one moved. Change one input at a time in the guided app and the trace can tell you exactly what each change did.</p>
          </Section>

          <Section id="offline" title="Offline and install">
            <p className="flex items-start gap-2"><WifiOff size={15} className="mt-0.5 shrink-0" aria-hidden /><span>After the first visit, a built copy of Tower Design Toolkit (<code>npm run build</code>, or a hosted copy) opens without a network, like a desktop program. Installing it gives it its own window and an icon. The massing importers download the first time you use them and are kept after that.</span></p>
            <Install />
            <p>The private competition model (<code>public/local/</code>) is never stored by the offline copy and is left out of any build meant for publishing, so offline the Competition site shows no neighbouring buildings.</p>
          </Section>

          <Section id="units" title="Units">
            <div className="flex flex-wrap items-center gap-2"><span>Show lengths, heights and areas in</span><UnitSelect /><span className="text-muted">(also in the top bar; remembered in this browser)</span></div>
            <p><b>Metres</b> show the app as written. <b>Feet</b> are decimal feet (984.25 ft, not 984′ 3″), with areas in ft². <b>Millimetres</b> show lengths in mm and keep areas in m², as Canadian drawings do. On drawings the scale bar is in feet when feet are shown, otherwise in metres.</p>
            <p>Only what you see and type changes. Every calculation, the saved project, the decision trace and every export stay in metres, and a value shown in feet and typed back returns the same metres. Rates per area (such as $/m²), speeds (m/s), volumes (m³) and kilometres are left as written.</p>
            <p className="text-meta text-muted">Conversion follows Ruijie Liu's Vista (explorer/units.js, github.com/RuijieLiu6/vancouver-tall-view-tool).</p>
          </Section>

          <Section id="keys" title="Keyboard">
            <ul className="space-y-1">
              <li><Key>1</Key> <Key>2</Key> <Key>3</Key> switch stage (Massing, Schematic, Present)</li>
              <li><Key>P</Key> place the tower on the map: a click shows a ghost of the tower there with its site fit and view cones; <Key>Enter</Key> or Confirm places it, <Key>Esc</Key> or Cancel keeps it where it was. The tower lines up with the lot under the click: it turns parallel to the lot lines (read from the lot's smallest enclosing rectangle) and sits inside them when it fits, never resized; the lines it used show in amber. On a street it turns to the nearest lot lines within 30 m; <Key>Shift</Key> places it freely. <Key>L</Key> (<b>Align to lot</b>) does the same for a tower already placed</li>
              <li>Click a tower in the 3D view to select it as one object; <Key>M</Key> <b>Move</b> and <Key>R</Key> <b>Rotate</b> show a gizmo at its base (drag the arrows or the square to move it in plan, the arc to turn it). It snaps to the site boundary and parcel edges first, then to a 1 m or 5 m grid and 5° or 15° steps; hold <Key>Shift</Key> for free. A drag leaves a ghost to <Key>Enter</Key> confirm or <Key>Esc</Key> cancel; nothing changes until you confirm, and each confirmed move is one undo step. With Move on, the arrow keys nudge it one grid step (<Key>Shift</Key>: 0.1 m); with Rotate on, <Key>[</Key> <Key>]</Key> turn it one step. <Key>Esc</Key> cancels a drag, then the pending move, then deselects. Present keeps the model locked</li>
              <li><Key>H</Key> hides or shows everything over the 3D view (the layers dock, compass and title block) for a clean view; captures never include them</li>
              <li><Key>Ctrl</Key> + <Key>Z</Key> undo; opening a project or an option is one undo step</li>
            </ul>
          </Section>
        </main>
      </div>
    </div>
  )
}
