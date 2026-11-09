// Higher Buildings on the map (Milestone A, 9 Nov 2026), driven like a user in Real Vancouver with no tower:
// Discover (Layers > Planning) → Highlight (hover) → Inspect (card) → Frame → Return, and the rules around it:
// toggles never move the camera or change the site, the label is click-through and never picked, Esc stops a camera
// move, reduced motion jumps, the site relationship for sites inside / outside / crossing / near an edge, the search
// entry, and the competition site's card. Typed text and City downloads are blocked (nothing leaves the browser).
// Screenshots: only when HB_EVIDENCE_DIR is set (local evidence, never committed).
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const fixture = JSON.parse(readFileSync(join(process.cwd(), 'src/lib/testdata/higherBuildingsSites.json'), 'utf8')) as { sites: { name: string; ring: [number, number][]; relation: string }[] }
const site = (name: string) => fixture.sites.find((s) => s.name === name)!.ring
const SHOTS = process.env.HB_EVIDENCE_DIR
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const shot = async (p: Page, name: string) => { if (SHOTS) await p.screenshot({ path: join(SHOTS, `${name}.png`) }) }

const pick = (re: RegExp) => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => re.test(n)).pop()!

async function open(p: Page) {
  await p.addInitScript(() => { performance.setResourceTimingBufferSize(20_000); try { localStorage.setItem('ts.landing.skip', '0'); localStorage.setItem('ts.onboarding.seen', '1'); localStorage.removeItem('ts.higherBuildings.v1') } catch { /* ignore */ } })
  await p.route(/geocoder\.api\.gov\.bc\.ca/, (r) => r.abort())
  await p.route(/opendata\.vancouver\.ca/, (r) => r.abort())
  await p.goto('/#/guided')
  await p.waitForSelector('#root > *', { timeout: 60_000 })
  await p.getByRole('button', { name: 'Start designing' }).click({ timeout: 8000 }).catch(() => {})
  await p.getByRole('tab', { name: 'Real Vancouver' }).first().click({ timeout: 120_000 })
  await p.getByRole('button', { name: 'Start designing' }).click({ timeout: 3000 }).catch(() => {})
  await p.locator('[data-viewport] canvas').first().waitFor({ timeout: 120_000 })
  await p.getByRole('button', { name: /Layers$/ }).first().waitFor({ timeout: 120_000 })
  await p.waitForTimeout(6000)
}

/** The project and the camera, to prove nothing else moved. */
async function snap(p: Page) {
  return p.evaluate(async (src) => {
    const pk = new Function(`return (${src})`)() as (re: RegExp) => string
    const { useStore } = await import(/* @vite-ignore */ pk(/\/src\/store\.ts/))
    const f = await import(/* @vite-ignore */ pk(/@react-three_fiber/))
    const canvas = document.querySelector('[data-viewport] canvas') as HTMLCanvasElement
    const st = f._roots.get(canvas).store.getState()
    const s = useStore.getState()
    const r2 = (v: number) => Math.round(v * 100) / 100
    return {
      site: JSON.stringify(s.citySite), towers: JSON.stringify(s.towers), ground: s.groundElevation, project: s.project,
      camera: st.camera.position.toArray().map(r2) as number[], target: (st.controls?.target?.toArray() ?? [0, 0, 0]).map(r2) as number[],
    }
  }, pick.toString())
}
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
/** The camera once it has stopped (the orbit eases out after a drag). */
async function settled(p: Page) {
  let a = await snap(p)
  for (let i = 0; i < 20; i++) {
    await p.waitForTimeout(300)
    const b = await snap(p)
    if (dist(a.camera, b.camera) < 0.01 && dist(a.target, b.target) < 0.01) return b
    a = b
  }
  return a
}

async function setSite(p: Page, ring: [number, number][], note: string) {
  await p.evaluate(async ({ src, ring, note }) => {
    const pk = new Function(`return (${src})`)() as (re: RegExp) => string
    const { useStore } = await import(/* @vite-ignore */ pk(/\/src\/store\.ts/))
    useStore.getState().set({ citySite: { ring, source: 'drawn', note, label: null, replaced: [], keepReplaced: false, parcelsAdd: [], parcelsSkip: [], parcelLayer: null, areaBasis: 'boundary' } })
  }, { src: pick.toString(), ring, note })
  await p.waitForTimeout(600)
}

/** The overlay in the scene: drawn or not, and whether a ray through a screen point hits any of it. */
async function overlay(p: Page, at?: { x: number; y: number }) {
  return p.evaluate(async ({ src, at }) => {
    const pk = new Function(`return (${src})`)() as (re: RegExp) => string
    const f = await import(/* @vite-ignore */ pk(/@react-three_fiber/))
    const canvas = document.querySelector('[data-viewport] canvas') as HTMLCanvasElement
    const st = f._roots.get(canvas).store.getState()
    const g = st.scene.getObjectByName('higher-buildings')
    let hits: string[] = []
    if (at) {
      // R3F's own raycaster (a THREE.Raycaster), aimed through the screen point
      const r = canvas.getBoundingClientRect(), ray = st.raycaster
      ray.setFromCamera({ x: ((at.x - r.left) / r.width) * 2 - 1, y: -((at.y - r.top) / r.height) * 2 + 1 }, st.camera)
      hits = ray.intersectObjects(st.scene.children, true).filter((h: { object: { userData: { policyOverlay?: string } } }) => h.object.userData.policyOverlay).map((h: { object: { name: string } }) => h.object.name)
    }
    return { drawn: !!g, hits }
  }, { src: pick.toString(), at })
}

/** Every part's corners on screen after framing (inside the canvas). */
async function allInView(p: Page) {
  return p.evaluate(async (src) => {
    const pk = new Function(`return (${src})`)() as (re: RegExp) => string
    const f = await import(/* @vite-ignore */ pk(/@react-three_fiber/))
    const { HB_PARTS } = await import(/* @vite-ignore */ pk(/\/src\/lib\/higherBuildings\.ts/))
    const { useStore } = await import(/* @vite-ignore */ pk(/\/src\/store\.ts/))
    const canvas = document.querySelector('[data-viewport] canvas') as HTMLCanvasElement
    const st = f._roots.get(canvas).store.getState(), g = useStore.getState().groundElevation
    let out = 0, n = 0
    for (const part of HB_PARTS) for (const [x, y] of part.ring) {
      const v = st.camera.position.clone().set(x, g, -y).project(st.camera); n++
      if (Math.abs(v.x) > 1 || Math.abs(v.y) > 1 || v.z > 1) out++
    }
    return { out, n }
  }, pick.toString())
}

const card = (p: Page) => p.getByTestId('hb-card')

test('Higher Buildings: discover, highlight, inspect, frame, return; nothing else changes', async ({ page: p }) => {
  test.setTimeout(600_000)
  await open(p)
  await setSite(p, site('inside'), 'Higher Buildings e2e: inside')
  const s0 = await snap(p)
  expect(JSON.parse(s0.towers).city).toHaveLength(0) // tested without a tower

  // Discover: Layers > Planning, apart from the place names.
  await p.getByRole('button', { name: /Layers$/ }).first().click()
  const item = p.getByTestId('hb-item')
  await expect(item).toBeVisible()
  await expect(p.getByTestId('hb-dock')).toContainText('Current policy area')
  expect((await overlay(p)).drawn).toBe(false)
  await shot(p, '1-discover-1440x900')

  // Highlight: hover previews the outline and label; leaving ends it. The camera stays.
  await item.hover()
  await p.waitForTimeout(1200)
  expect((await overlay(p)).drawn).toBe(true)
  await expect(p.getByTestId('hb-label')).toBeVisible()
  await shot(p, '2-highlight-1440x900')
  await p.mouse.move(5, 300)
  await p.waitForTimeout(600)
  expect((await overlay(p)).drawn).toBe(false)
  let s = await snap(p)
  expect(dist(s.camera, s0.camera)).toBeLessThan(0.01)

  // Pin and label are separate settings; neither moves the camera or the site.
  await p.getByTestId('hb-dock-pin').click()
  await p.waitForTimeout(800)
  expect((await overlay(p)).drawn).toBe(true)
  await p.getByTestId('hb-dock-labels').click()
  await p.waitForTimeout(500)
  await expect(p.getByTestId('hb-label')).toHaveCount(0)
  expect((await overlay(p)).drawn).toBe(true)
  await p.getByTestId('hb-dock-labels').click()
  await expect(p.getByTestId('hb-label')).toBeVisible()
  s = await snap(p)
  expect(dist(s.camera, s0.camera)).toBeLessThan(0.01)
  expect(s.site).toBe(s0.site)

  // Inspect: the card with status, source, the dates kept apart, geometry basis and the site's relationship.
  await item.click()
  await expect(card(p)).toBeVisible()
  await expect(p.getByTestId('hb-status')).toContainText('Policy in force')
  await expect(card(p)).toContainText(/adopted 1997/i)
  await expect(p.getByTestId('hb-map-date')).toHaveText('14 May 2026')
  await expect(p.getByTestId('hb-retrieved')).toHaveText('8 Nov 2026')
  await expect(card(p)).toContainText('Digitized from the map')
  await expect(p.getByTestId('hb-relation')).toHaveAttribute('data-relation', 'within')
  await expect(p.getByTestId('hb-not-approval')).toContainText('Membership is not approval')
  await expect(p.getByTestId('hb-source')).toHaveAttribute('href', /syc\.vancouver\.ca/)
  await shot(p, '3-inspect-1440x900')
  s = await snap(p)
  expect(dist(s.camera, s0.camera)).toBeLessThan(0.01)
  expect(s.site).toBe(s0.site)

  // The label selects: close the card, click the label.
  await p.getByRole('button', { name: 'Close the Higher Buildings details' }).click()
  await expect(card(p)).toHaveCount(0)
  const lb = (await p.getByTestId('hb-label').boundingBox())!
  const lc = { x: lb.x + lb.width / 2, y: lb.y + lb.height / 2 }
  // The overlay is never picked: a ray through the label's spot hits none of it.
  expect((await overlay(p, lc)).hits).toEqual([])
  await p.mouse.click(lc.x, lc.y)
  await expect(card(p)).toBeVisible()
  await p.getByRole('button', { name: 'Close the Higher Buildings details' }).click()
  // A drag that starts on the label still moves the view and selects nothing.
  const before = await snap(p)
  await p.mouse.move(lc.x, lc.y); await p.mouse.down(); await p.mouse.move(lc.x + 120, lc.y + 40, { steps: 8 }); await p.mouse.up()
  await p.waitForTimeout(800)
  const dragged = await snap(p)
  expect(dist(dragged.camera, before.camera)).toBeGreaterThan(1)
  await expect(card(p)).toHaveCount(0)

  // Frame: the whole area in view; Back returns to the view before.
  await item.click()
  const a = await settled(p)
  await p.getByTestId('hb-frame').click()
  await p.waitForTimeout(2000)
  const framed = await settled(p)
  expect(dist(framed.camera, a.camera)).toBeGreaterThan(10)
  const iv = await allInView(p)
  expect(iv.out).toBe(0)
  await shot(p, '4-frame-3d-1440x900')
  await p.getByTestId('hb-back').click()
  await p.waitForTimeout(2000)
  const back = await settled(p)
  expect(dist(back.camera, a.camera)).toBeLessThan(1)
  expect(dist(back.target, a.target)).toBeLessThan(1)
  await shot(p, '5-return-1440x900')

  // Esc stops the move part-way (the card stays open); reduced motion jumps straight there.
  await p.getByTestId('hb-frame').click()
  await p.waitForTimeout(120)
  await p.keyboard.press('Escape')
  await p.waitForTimeout(1500)
  const stopped = await snap(p)
  expect(dist(stopped.camera, framed.camera)).toBeGreaterThan(5)
  await expect(card(p)).toBeVisible()
  await p.getByTestId('hb-back').click()
  await p.waitForTimeout(1500)
  await p.evaluate(async (src) => { const pk = new Function(`return (${src})`)() as (re: RegExp) => string; const { useStore } = await import(/* @vite-ignore */ pk(/\/src\/store\.ts/)); useStore.getState().set({ reducedMotion: true }) }, pick.toString())
  await p.getByTestId('hb-frame').click()
  await p.waitForTimeout(400)
  const jumped = await snap(p)
  // There at once (nothing moves afterwards), at the framed view (within 0.5% of the viewing distance: the request path
  // differs from the animated one by a few metres at about 7 km).
  await p.waitForTimeout(1500)
  expect(dist((await snap(p)).camera, jumped.camera)).toBeLessThan(0.5)
  expect(dist(jumped.camera, framed.camera)).toBeLessThan(0.005 * dist(framed.camera, framed.target))
  await p.getByTestId('hb-back').click()
  await p.waitForTimeout(600)
  await p.evaluate(async (src) => { const pk = new Function(`return (${src})`)() as (re: RegExp) => string; const { useStore } = await import(/* @vite-ignore */ pk(/\/src\/store\.ts/)); useStore.getState().set({ reducedMotion: false }) }, pick.toString())

  // Through all of it the site, the towers and the ground stayed as they were.
  s = await snap(p)
  expect(s.site).toBe(s0.site)
  expect(s.towers).toBe(s0.towers)
  expect(s.ground).toBe(s0.ground)

  // The relationship for sites inside, outside, crossing and near the digitized edge (whole polygons).
  for (const [name, want] of [['inside', 'within'], ['outside', 'outside'], ['crossing', 'overlapping'], ['near_edge_inside', 'uncertain'], ['near_edge_outside', 'uncertain']] as const) {
    await setSite(p, site(name), `Higher Buildings e2e: ${name}`)
    await expect(p.getByTestId('hb-relation')).toHaveAttribute('data-relation', want)
    await shot(p, `6-site-${name}-1440x900`)
  }
})

test('the overlay does not block the Site tools: a map click inside the area opens the site menu', async ({ page: p }) => {
  test.setTimeout(300_000)
  await open(p)
  await setSite(p, site('outside'), 'Higher Buildings e2e: outside')
  await p.getByRole('navigation', { name: 'Design process' }).locator('[data-step="site"]').click()
  await p.evaluate(async (src) => { const pk = new Function(`return (${src})`)() as (re: RegExp) => string; const m = await import(/* @vite-ignore */ pk(/\/src\/lib\/higherBuildings\.ts/)); m.pinLayer(true) }, pick.toString())
  // Look straight down over the block across Seymour St (inside the area), then click it.
  const at = fixture.sites.find((x) => x.name.startsWith('across_seymour'))!.ring
  const cx = at.reduce((s, q) => s + q[0], 0) / at.length, cy = at.reduce((s, q) => s + q[1], 0) / at.length
  await p.evaluate(async ({ src, cx, cy }) => {
    const pk = new Function(`return (${src})`)() as (re: RegExp) => string
    const { useStore } = await import(/* @vite-ignore */ pk(/\/src\/store\.ts/))
    useStore.getState().set({ cameraRequest: { position: [cx, cy - 2, 600], target: [cx, cy, 20], fov: 30 } })
  }, { src: pick.toString(), cx, cy })
  await p.waitForTimeout(3000)
  expect((await overlay(p)).drawn).toBe(true)
  const box = (await p.locator('[data-viewport] canvas').first().boundingBox())!
  const pt = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  expect((await overlay(p, pt)).hits).toEqual([])
  await p.mouse.click(pt.x, pt.y)
  await expect(p.getByTestId('site-map-menu')).toBeVisible({ timeout: 15_000 })
  await shot(p, '7-site-menu-through-overlay-1440x900')
})

test('search finds Higher Buildings in the Planning group without moving the site', async ({ page: p }) => {
  test.setTimeout(300_000)
  await open(p)
  await setSite(p, site('outside'), 'Higher Buildings e2e: outside')
  const s0 = await snap(p)
  await p.getByRole('navigation', { name: 'Design process' }).locator('[data-step="site"]').click()
  const consent = p.getByRole('button', { name: 'Search online' })
  if (await consent.isVisible({ timeout: 5000 }).catch(() => false)) await consent.click()
  await p.getByRole('combobox', { name: 'Address or neighbourhood' }).fill('higher')
  const opt = p.getByRole('option', { name: /Higher Buildings/ })
  await expect(opt).toContainText('Planning layer')
  await shot(p, '8-search-1440x900')
  await opt.click()
  await expect(card(p)).toBeVisible()
  await expect(p.getByTestId('hb-relation')).toHaveAttribute('data-relation', 'outside')
  const s = await snap(p)
  expect(s.site).toBe(s0.site)
  expect(dist(s.camera, s0.camera)).toBeLessThan(0.01)
})

test('competition site: the Planning card says why nothing is drawn and offers Real Vancouver', async ({ page: p }) => {
  test.setTimeout(300_000)
  await open(p)
  await p.getByRole('tab', { name: 'Competition site' }).first().click()
  await p.waitForTimeout(3000)
  await p.getByRole('button', { name: 'Layers', exact: true }).or(p.getByTitle('Show the layers panel')).first().click()
  await p.getByRole('button', { name: /^Planning/ }).click()
  await expect(p.getByTestId('hb-vtc')).toContainText('Not drawn here')
  await expect(p.getByTestId('hb-vtc-open')).toBeVisible()
  expect((await overlay(p)).drawn).toBe(false)
  await shot(p, '9-competition-card-1440x900')
})
