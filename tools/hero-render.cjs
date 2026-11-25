// Hero renders from a project file (24 Nov): the design on the default Real Vancouver site seen from real places
// (lib/presentViews.ts HERO_VIEWS), and the Board 4 street view looking up at the tower, on the competition site and
// in Real Vancouver. Every view can be drawn as pixel-aligned layers from the one camera (components/PresentRender.tsx):
// line (the board drawing), shaded (clay, sun and cast shadows, haze, water flat), edges (lines alone, transparent),
// mask (the design towers, white on black) and depth. Needs a running dev server (`npx vite`): the render hook exists
// on a dev server only.
//
//   node tools/hero-render.cjs --url http://localhost:5197/ --project C9g2.project.json --out hero/ --tag C9g2
//        [--views charleson,qe-park,...,board4-vtc,board4-city] [--size 1600x1867] [--passes line,shaded,edges,mask,depth]
//        [--sun 2026-09-21T22:00:00Z] [--suffix -print] [--bg transparent|paper|white]
//
// Views: any HERO_VIEWS id (all by default), `board4-vtc` (competition site) and `board4-city` (Real Vancouver).
// File names: <tag>-<view><suffix>-<pass>.png. Everything is listed in <out>/renders.json with its camera.
// Playwright drives Microsoft Edge (channel 'msedge'); the Chromium download is not needed.
const path = require('path')
const fs = require('fs')
const { chromium } = require('playwright')

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d }
const URL = arg('url', 'http://localhost:5197/')
const FILE = arg('project'), OUT = arg('out', 'hero'), TAG = arg('tag', 'tower'), SUFFIX = arg('suffix', '')
const VIEWS = arg('views', '')
const [W, H] = arg('size', '1600x1867').split('x').map(Number)
const PASSES = arg('passes', 'line,shaded').split(',')
const SUN = arg('sun', '2026-09-21T22:00:00Z') // 21 September 2026, 15:00 PDT
const BG = arg('bg', 'transparent')
// Per-view lens and aim overrides: --frame qe-park=1.7:0.45,aerial-se=2:0.4 (frame × tower height at the tower : aim share).
const FRAMES = Object.fromEntries((arg('frame', '') || '').split(',').filter(Boolean).map((s) => { const [id, v] = s.split('='); const [f, a] = v.split(':').map(Number); return [id, { frame: f, aim: a }] }))
// Board 4 camera override: --b4 x,y,pitch,fov (competition frame; the city version carries the point with the design).
const B4 = (arg('b4', '') || '').split(',').filter(Boolean).map(Number)
// Where a model point falls in the frame (0 top / left, 1 bottom / right) for a perspective shot.
const project = (cam, w, h, pt) => {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], norm = (a) => { const l = Math.hypot(...a); return a.map((x) => x / l) }
  const f = norm(sub(cam.target, cam.position)), r = norm(cross(f, [0, 0, 1])), u = cross(r, f)
  const d = sub(pt, cam.position), z = dot(d, f), t = Math.tan((cam.fov * Math.PI) / 360)
  return { x: 0.5 + dot(d, r) / z / (t * (w / h)) / 2, y: 0.5 - dot(d, u) / z / t / 2 }
}
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
  const main = state.towers.reduce((a, t) => (t.height > a.height ? t : a))
  const top = main.height
  const all = await p.evaluate(async () => (await window.__tdtRender.views()).HERO_VIEWS.map((v) => v.id))
  const want = VIEWS ? VIEWS.split(',') : [...all, 'board4-vtc', 'board4-city']
  const index = []
  const writeIndex = () => {
    const idx = path.join(OUT, 'renders.json')
    const prev = fs.existsSync(idx) ? JSON.parse(fs.readFileSync(idx, 'utf8')) : { renders: [] }
    prev.renders = prev.renders.filter((r) => !index.some((n) => n.file === r.file)).concat(index)
    prev.made = new Date().toISOString()
    prev.method = 'Tower Design Toolkit hero render (tools/hero-render.cjs, components/PresentRender.tsx, cameras lib/presentViews.ts HERO_VIEWS / upShot). Layers from one camera, pixel-aligned: line (white model, grey 30° crease edges, context a shade darker, design outlined in ink), shaded (clay: sun with cast shadows at the stated UTC time, hemisphere sky light, linear haze toward #f7f8fa, water flat #e9eef1 wherever the drawn surface is at or below 0.35 m CGVD28, sky transparent), edges (the line pass without fills, transparent), mask (design towers white on black, after anything in front), depth (white at the eye to black at depthFarM). Real Vancouver frame: EPSG:26910 less E 491300 N 5458600, z geodetic CGVD28; competition frame: block centred on the origin.'
    fs.writeFileSync(idx, JSON.stringify(prev, null, 2))
  }
  const save = (view, r, extra) => {
    for (const pass of Object.keys(r.layers)) {
      const file = `${TAG}-${view}${SUFFIX}-${pass}.png`
      fs.writeFileSync(path.join(OUT, file), Buffer.from(r.layers[pass].split(',')[1], 'base64'))
      index.push({ tower: TAG, project: FILE.replace(/\\/g, '/').split('/').slice(-1)[0], view, pass, width: r.width, height: r.height, towerVisiblePx: r.towerPixels, file, ...(pass === 'depth' ? { depthFarM: r.depthFar } : {}), ...extra })
      console.log('wrote', file, `${r.width}x${r.height}`, `${r.ms} ms`, r.towerPixels ? '' : '(tower not visible)')
    }
    writeIndex()
  }
  const shoot = async (shot, style) => {
    let r = null
    for (let i = 0; i < 12; i++) {
      r = await p.evaluate((req) => window.__tdtRender.render(req), { shot, width: W, height: H, style })
      if (r && r.towerPixels > 0) break
      await p.waitForTimeout(2500)
    }
    if (!r) throw new Error('no 3D view mounted')
    return r
  }
  // Ink outline about 1 pt at 300 ppi on the long side of a board image (4 px at 4000 px).
  const outline = Math.max(2, Math.round(Math.max(W, H) / 1000))
  // Where the design stands as drawn: the centre of the drawn towers' bounds (an imported mesh need not sit on x, y).
  const centreOf = async (t) => {
    for (let i = 0; i < 20; i++) {
      const b = await p.evaluate(() => window.__tdtRender.towerBox())
      if (b) return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2]
      await p.waitForTimeout(1500)
    }
    console.log('no drawn tower bounds: using the tower record')
    return [t.x, t.y]
  }

  // ---- Board 4 on the competition site: the street, looking up
  if (want.includes('board4-vtc')) {
    const c = await centreOf(main)
    console.log('design centre (competition frame)', c[0].toFixed(1), c[1].toFixed(1), 'tower record', main.x, main.y)
    const v = await p.evaluate(async ([tx, ty, b4]) => { const m = await window.__tdtRender.views(); const from = b4.length ? [b4[0], b4[1]] : m.BOARD4_FROM; return { shot: b4.length ? m.upShot(from, m.EYE, [tx, ty], b4[2], b4[3]) : m.upShot(from, m.EYE, [tx, ty]), people: m.BOARD4_PEOPLE } }, [...c, B4])
    const r = await shoot(v.shot, { background: BG, outline, people: v.people, depthFar: 600, passes: PASSES.filter((x) => x !== 'shaded') })
    save('board4-vtc', r, { camera: v.shot, label: 'Board 4: the retail high street, looking up at the tower (competition site)', note: B4.length ? `Eye 1.6 m at (${B4[0]}, ${B4[1]}) on the competition site, turned to the tower, pitched up ${B4[2]}°, vertical lens ${B4[3]}° (--b4).` : 'Eye 1.6 m on the far (south) sidewalk of the retail high street west of the middle of the block, turned to the tower, pitched up 43°, vertical lens 96°. Competition base model as context. Figures 1.75 m.' })
  }

  const heroes = want.filter((v) => all.includes(v))
  if (heroes.length || want.includes('board4-city')) {
    const city = await p.evaluate(() => window.__tdtRender.toCity())
    await p.waitForTimeout(4000)
    await p.waitForFunction(() => !document.querySelector('[data-testid="map-loading"]'), null, { timeout: 600000 }).catch(() => console.log('map still loading after 10 min'))
    await p.waitForTimeout(15000)
    const t0 = city.towers.find((x) => x.height === top) ?? city.towers[0]
    const [tcx, tcy] = await centreOf(t0)
    const t = { ...t0, x: tcx, y: tcy }
    console.log('design centre (city frame)', tcx.toFixed(1), tcy.toFixed(1), 'tower record', t0.x, t0.y)
    const sun = await p.evaluate((iso) => window.__tdtRender.sun(iso, 0), SUN)
    console.log('sun', SUN, `altitude ${sun.altitude.toFixed(1)}°, azimuth ${sun.azimuth.toFixed(1)}°`)
    for (const id of heroes) {
      const v = await p.evaluate(async ([id, cx, cy, ground, top, over]) => {
        const m = await window.__tdtRender.views()
        const hv0 = m.HERO_VIEWS.find((h) => h.id === id)
        const hv = hv0 && over ? { ...hv0, ...over } : hv0
        // A first aim so the city loads around the view, then the ground under the eye is read from what is drawn.
        const shot = m.heroShot(hv, [cx, cy], ground, top, (q) => window.__tdtRender.groundAt(q[0], q[1]))
        return { hv, shot }
      }, [id, t.x, t.y, city.ground, top, FRAMES[id] ?? null])
      if (!v.shot) { console.log('no camera for', id); continue }
      await p.evaluate((s) => window.__tdtRender.aim(s), v.shot)
      await p.waitForTimeout(4000)
      await p.waitForFunction(() => !document.querySelector('[data-testid="map-loading"]'), null, { timeout: 300000 }).catch(() => {})
      await p.waitForTimeout(8000)
      // Read again now that the ground near the eye has loaded in detail.
      const shot = await p.evaluate(async ([id, cx, cy, ground, top, over]) => {
        const m = await window.__tdtRender.views()
        const hv0 = m.HERO_VIEWS.find((h) => h.id === id)
        return m.heroShot(over ? { ...hv0, ...over } : hv0, [cx, cy], ground, top, (q) => window.__tdtRender.groundAt(q[0], q[1]))
      }, [id, t.x, t.y, city.ground, top, FRAMES[id] ?? null])
      const { eyeNote, ...cam } = shot
      const d = Math.hypot(cam.target[0] - cam.position[0], cam.target[1] - cam.position[1], cam.target[2] - cam.position[2])
      // Shadows around the tower and toward the eye; haze from just short of the tower to 40 km past it.
      const towardEye = 0.3
      const shadowAt = [t.x + (cam.position[0] - t.x) * towardEye, t.y + (cam.position[1] - t.y) * towardEye, city.ground]
      const style = { background: BG, outline, passes: PASSES, sun: sun.dir, shadowAt, shadowRadius: Math.max(1000, d * 0.6 + 400), haze: { near: d * 0.55, far: d + 40000 }, depthFar: d * 4 }
      const r = await shoot(cam, style)
      // Where the tower's top and foot fall in the frame (at its drawn centre; 0 = top edge, 1 = bottom edge).
      const topAt = project(cam, W, H, [t.x, t.y, city.ground + top]).y, footAt = project(cam, W, H, [t.x, t.y, city.ground]).y
      console.log(id, `top at ${(topAt * 100).toFixed(1)} % of the frame height, foot at ${(footAt * 100).toFixed(1)} %`)
      save(id, r, { frameOverride: FRAMES[id] ?? null, towerTopAtPctOfHeight: +(topAt * 100).toFixed(1), towerFootAtPctOfHeight: +(footAt * 100).toFixed(1), camera: cam, eye: eyeNote, label: v.hv.label, note: v.hv.note, lens: { verticalFovDeg: +cam.fov.toFixed(2), horizontalFovDeg: +(2 * Math.atan(Math.tan((cam.fov * Math.PI) / 360) * (W / H)) * 180 / Math.PI).toFixed(2), equivalentFocalMm35: +(18 / Math.tan(Math.max(cam.fov, 2 * Math.atan(Math.tan((cam.fov * Math.PI) / 360) * (W / H)) * 180 / Math.PI) * Math.PI / 360)).toFixed(0) }, sun: { utc: SUN, altitudeDeg: +sun.altitude.toFixed(1), azimuthDeg: +sun.azimuth.toFixed(1) }, haze: style.haze, siteNote: 'Design on the default Real Vancouver site (Granville / W Pender / Howe / Dunsmuir), turned to its street grid, grade 23.4 m from the site (lib/defaultSite.ts, unverified). The competition block itself is hypothetical and has no place in the city.' })
    }
    if (want.includes('board4-city')) {
      const v = await p.evaluate(async ([cx, cy, b4]) => {
        const h = window.__tdtRender, m = await h.views()
        const from = await h.cityPoint(b4.length ? [b4[0], b4[1]] : m.BOARD4_FROM)
        const people = await Promise.all(m.BOARD4_PEOPLE.map((q) => h.cityPoint(q)))
        return { from, people, cx, cy }
      }, [t.x, t.y, B4])
      await p.evaluate((s) => window.__tdtRender.aim(s), { position: [v.from[0], v.from[1], city.ground + 60], target: [t.x, t.y, city.ground + 100] })
      await p.waitForTimeout(4000)
      await p.waitForFunction(() => !document.querySelector('[data-testid="map-loading"]'), null, { timeout: 300000 }).catch(() => {})
      await p.waitForTimeout(8000)
      const g = (await p.evaluate(([x, y]) => window.__tdtRender.groundAt(x, y), v.from)) ?? city.ground
      const shot = await p.evaluate(async ([from, z, to, b4]) => { const m = await window.__tdtRender.views(); return b4.length ? m.upShot(from, z, to, b4[2], b4[3]) : m.upShot(from, z, to) }, [v.from, g + 1.6, [t.x, t.y], B4])
      const r = await shoot(shot, { background: BG, outline, people: v.people, peopleZ: g, depthFar: 600, passes: PASSES.filter((x) => x !== 'shaded') })
      save('board4-city', r, { camera: shot, label: 'Board 4 camera idea in Real Vancouver: the street beside the default site, looking up', note: `The competition camera point carried with the design onto the default site (the same turn and shift), eye 1.6 m above the drawn ground (${g.toFixed(1)} m). Real Vancouver buildings as context.` })
    }
  }

  writeIndex()
  if (errors.length) console.log('page errors', JSON.stringify(errors.slice(0, 5)))
  await b.close()
})().catch((e) => { console.error(e); process.exit(1) })
