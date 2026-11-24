// Board renders from a project file (24 Nov): opens the file in a running dev server (`npx vite`; the render hook
// window.__tdtRender exists on a dev server only), renders the presentation views (lib/presentViews.ts) in the board
// line style (components/PresentRender.tsx) and writes PNGs, the economics readout and an index (renders.json).
//
//   node tools/present-render.cjs --url http://localhost:5173/ --project A.project.json --out renders/ --tag A
//        [--views retail-street-west,transit-plaza,axo,vp:qe,vp:auto] [--width 3600] [--bg transparent|paper|white]
//        [--highlight civic=#e145c2,amenity=#e145c2] [--suffix -hl]
//
// Views: a street view id from STREET_VIEWS, `axo`, `vp:<viewpoint id>` (e.g. vp:qe, vp:cone-10) or `vp:auto` (the
// protected viewpoint where the design stands closest to a protected view, after Queen Elizabeth Park). Viewpoint
// views move the design to Real Vancouver on the default site and wait for the city to load.
// Playwright drives Microsoft Edge (channel 'msedge'); the Chromium download is not needed.
const path = require('path')
const fs = require('fs')
const { chromium } = require('playwright')

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d }
const URL = arg('url', 'http://localhost:5173/')
const FILE = arg('project'), OUT = arg('out', 'renders'), TAG = arg('tag', 'tower')
const VIEWS = arg('views', 'retail-street-west,retail-street-east,transit-plaza,axo,vp:qe,vp:auto').split(',')
const WIDTH = Number(arg('width', '3600')), BG = arg('bg', 'transparent'), SUFFIX = arg('suffix', '')
const HL = Object.fromEntries((arg('highlight', '') || '').split(',').filter(Boolean).map((s) => s.split('=')))
if (!FILE) { console.error('--project <file> is required'); process.exit(2) }
fs.mkdirSync(OUT, { recursive: true })

;(async () => {
  const b = await chromium.launch({ channel: 'msedge', args: ['--ignore-gpu-blocklist', '--enable-webgl'] })
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } })
  const errors = []
  p.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
  await p.addInitScript(() => { try { localStorage.setItem('ts.landing.skip', '1'); localStorage.setItem('ts.onboarding.seen', '1') } catch {} })
  await p.goto(URL + '#/guided', { waitUntil: 'domcontentloaded', timeout: 120000 })
  await p.waitForSelector('header', { timeout: 180000 })
  const intro = p.getByRole('button', { name: 'Start designing' })
  if (await intro.isVisible().catch(() => false)) await intro.click()
  await p.waitForFunction(() => window.__tdtRender?.mounted(), null, { timeout: 180000 })
  const text = fs.readFileSync(FILE, 'utf8')
  const opened = await p.evaluate(([t, n]) => window.__tdtRender.open(t, n), [text, path.basename(FILE)])
  if (!opened) throw new Error(`the toolkit refused ${FILE}`)
  await p.waitForTimeout(5000)
  const state = await p.evaluate(() => window.__tdtRender.state())
  const top = Math.max(...state.towers.map((t) => t.height))
  const index = []
  const style = (people) => ({ background: BG, outline: Math.max(2, Math.round(WIDTH / 900)), ...(Object.keys(HL).length ? { highlight: HL } : {}), ...(people ? { people } : {}) })
  const shoot = async (view, shot, w, h, people, extra = {}) => {
    // Retry until the scene has drawn the tower (models and context load after the project opens).
    let r = null
    for (let i = 0; i < 12; i++) {
      r = await p.evaluate((req) => window.__tdtRender.render(req), { shot, width: w, height: h, style: style(people) })
      if (r && r.towerPixels > 0) break
      await p.waitForTimeout(2500)
    }
    if (!r) throw new Error('no 3D view mounted')
    const file = `${TAG}-${view}${SUFFIX}.png`
    fs.writeFileSync(path.join(OUT, file), Buffer.from(r.dataUrl.split(',')[1], 'base64'))
    index.push({ tower: TAG, view, camera: shot, width: r.width, height: r.height, background: BG, highlight: Object.keys(HL).length ? HL : null, towerVisiblePx: r.towerPixels, file, ...extra })
    console.log('wrote', file, `${r.width}x${r.height}`, `${r.ms} ms`, r.towerPixels ? '' : '(tower not visible)')
  }

  const V = await p.evaluate(async () => { const m = await window.__tdtRender.views(); return { street: m.STREET_VIEWS } })
  // Street views and the axonometric on the competition site.
  for (const id of VIEWS.filter((v) => !v.startsWith('vp:'))) {
    if (id === 'axo') {
      const shot = await p.evaluate((t) => window.__tdtRender.views().then((m) => m.axoShot(t, 3 / 4)), top)
      await shoot('axo', shot, WIDTH, Math.round(WIDTH * 4 / 3), null, { label: 'Axonometric from the south-west', project: 'vtc' })
      continue
    }
    const v = V.street.find((s) => s.id === id)
    if (!v) { console.log('unknown view', id); continue }
    await shoot(id, v.shot, WIDTH, Math.round(WIDTH * 2 / 3), v.people, { label: v.label, note: v.note, project: 'vtc' })
  }
  const econ = await p.evaluate(() => window.__tdtRender.economics())
  fs.writeFileSync(path.join(OUT, `${TAG}-economics.json`), JSON.stringify(econ, null, 2))
  console.log('economics', econ.words, econ.verdictText)

  // Protected viewpoints: the design on the default Real Vancouver site.
  const vps = VIEWS.filter((v) => v.startsWith('vp:')).map((v) => v.slice(3))
  if (vps.length) {
    const city = await p.evaluate(() => window.__tdtRender.toCity())
    // The city model streams in (map-loading bar); wait for it to finish, then a little for the meshes to build.
    await p.waitForTimeout(4000)
    await p.waitForFunction(() => !document.querySelector('[data-testid="map-loading"]'), null, { timeout: 600000 }).catch(() => console.log('map still loading after 10 min'))
    await p.waitForTimeout(15000)
    const t = city.towers.find((x) => x.height === top) ?? city.towers[0]
    const picks = await p.evaluate(async ([cx, cy, ground, top, ids]) => {
      const m = await window.__tdtRender.views()
      const site = [cx + 491300, cy + 5458600]
      const ranked = m.viewpointsFor(site)
      const out = []
      for (const id of ids) {
        const row = id === 'auto' ? ranked.find((r) => r.vp.id !== 'qe') : ranked.find((r) => r.vp.id === id) ?? { vp: m.ALL_VIEWPOINTS.find((v) => v.id === id), inCone: false, offDeg: null, km: null }
        if (!row || !row.vp) { out.push({ id, missing: true }); continue }
        out.push({ id: row.vp.id, name: row.vp.name, cones: row.vp.cones, inCone: row.inCone, offDeg: row.offDeg, km: row.km, shot: m.viewpointShot(row.vp, [cx, cy], ground, top) })
      }
      return out
    }, [t.x, t.y, city.ground, top, vps])
    for (const v of picks) {
      if (v.missing) { console.log('unknown viewpoint', v.id); continue }
      // The city draws and loads by the on-screen camera: put it at the viewpoint first, then let the chunks settle.
      await p.evaluate((s) => window.__tdtRender.aim(s), v.shot)
      await p.waitForTimeout(4000)
      await p.waitForFunction(() => !document.querySelector('[data-testid="map-loading"]'), null, { timeout: 300000 }).catch(() => {})
      await p.waitForTimeout(8000)
      await shoot(`vp-${v.id}`, v.shot, WIDTH, Math.round(WIDTH * 2 / 3), null, { label: `From ${v.name} (protected view ${v.cones.join(', ')})`, project: 'city', viewpoint: { id: v.id, name: v.name, cones: v.cones, siteInCone: v.inCone, degreesOffConeCentre: v.offDeg, km: v.km }, siteNote: 'Design moved to the default Real Vancouver site (Granville / W Pender / Howe / Dunsmuir), turned to its street grid, grade from the site (lib/defaultSite.ts, unverified).' })
    }
  }
  const idx = path.join(OUT, 'renders.json')
  const prev = fs.existsSync(idx) ? JSON.parse(fs.readFileSync(idx, 'utf8')) : { renders: [] }
  prev.renders = prev.renders.filter((r) => !index.some((n) => n.file === r.file)).concat(index)
  prev.made = new Date().toISOString()
  prev.method = 'Tower Design Toolkit presentation render (tools/present-render.cjs, components/PresentRender.tsx): the design and the context as the toolkit draws them, white model with 30° crease edges, design towers outlined in ink, figures 1.75 m (a child 1.15 m) at eye-level views. Cameras: lib/presentViews.ts. Model frame: competition block centred on the origin (x along the grid, y across, z up, m); viewpoint views in Real Vancouver (EPSG:26910 less E 491300 N 5458600, z geodetic CGVD28).'
  fs.writeFileSync(idx, JSON.stringify(prev, null, 2))
  if (errors.length) console.log('page errors', JSON.stringify(errors.slice(0, 5)))
  await b.close()
})().catch((e) => { console.error(e); process.exit(1) })
