// Milestone 1 acceptance (Ruijie, 9 Nov, "Viewport acceptance test"), at 1440 × 900 and 1280 × 800:
//  1 Real Vancouver without a tower  2 search a location  3 preview it  4 select a site  5 Frame site: boundary and nearby
//  streets  6 Plan view  7 back to 3D  8 orbit, pan, zoom  9 a nearby building, Frame selection  10 Frame site again
//  11 Form and back  12 the site and the working view are still there. Never stranded far away or around an odd target.
// Plus: Frame tower says why it can't run with no tower; grabbing the view stops a move; Home, overview, neighbourhood keys.
// Runs in Edge (hardware WebGL): under the headless shell's software WebGL the city's frames are too slow for camera moves.
// The BC Address Geocoder is blocked: the City's own address list is used, and nothing typed leaves the test.
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

test.use({ channel: 'msedge', launchOptions: { args: [] } })
const SHOTS = join(process.cwd(), 'test-results', 'site-navigation')
mkdirSync(SHOTS, { recursive: true })

/** The camera and the site, measured in the page (the app's own modules). */
async function measure(p: Page) {
  return p.evaluate(async () => {
    const urls = performance.getEntriesByType('resource').map((e) => e.name)
    const N = await import(urls.filter((n) => /\/src\/lib\/viewNav\.ts/.test(n)).pop()!)
    const S = await import(urls.filter((n) => /\/src\/store\.ts/.test(n)).pop()!)
    const cam = N.nav.camera, el = N.nav.el
    const pose = N.currentPose()
    const s = S.useStore.getState(), ring: [number, number][] = s.citySite?.ring ?? []
    const ins = N.viewInsets(), g = s.groundElevation ?? 0
    // each site corner on screen, as fractions of the free part of the view (0..1 inside)
    const fx = (x: number) => ((x + 1) / 2 - ins.left) / (1 - ins.left - ins.right), fy = (y: number) => ((1 - y) / 2 - ins.top) / (1 - ins.top - ins.bottom)
    const corners = ring.map(([x, y]) => { const q = N.toThree(x, y, g).project(cam); return [fx(q.x), fy(q.y), q.z] })
    const d = Math.hypot(pose.position[0] - pose.target[0], pose.position[1] - pose.target[1], pose.position[2] - pose.target[2])
    const widthM = 2 * d * Math.tan((pose.fov * Math.PI) / 360) * (el.clientWidth / el.clientHeight)
    const sc = N.siteCentre()
    return {
      pose, corners, widthM, distance: d, scale: N.useNav.getState().scale, status: N.useNav.getState().status,
      elevation: (Math.asin((pose.position[2] - pose.target[2]) / d) * 180) / Math.PI,
      targetToSite: sc ? Math.hypot(pose.target[0] - sc[0], pose.target[1] - sc[1]) : null,
      towers: s.towers.city.length, hasSite: ring.length > 0, flying: !!N.flight.to,
    }
  })
}
const settle = async (p: Page) => { await expect.poll(async () => (await measure(p)).flying, { timeout: 10_000 }).toBe(false); await p.waitForTimeout(400) }
const inside = (c: number[][], margin = 0) => c.every(([x, y, z]) => z < 1 && x >= margin && x <= 1 - margin && y >= margin && y <= 1 - margin)
async function nav(p: Page, id: string) {
  await p.getByTestId('nav-menu').click()
  const item = p.locator(`[data-nav="${id}"]`)
  await expect(item).toBeEnabled()
  await item.click()
  await settle(p)
}

for (const [W, H] of [[1440, 900], [1280, 800]] as const) {
  test(`Site navigation journey at ${W} × ${H}`, async ({ browser }) => {
    test.setTimeout(420_000)
    const ctx = await browser.newContext({ viewport: { width: W, height: H } })
    await ctx.addInitScript(() => { performance.setResourceTimingBufferSize(20000); try { localStorage.setItem('ts.landing.skip', '0'); localStorage.setItem('ts.onboarding.seen', '1') } catch { /* */ } })
    await ctx.route(/geocoder\.api\.gov\.bc\.ca/, (r) => r.abort())
    const p = await ctx.newPage()
    const shot = (n: string) => p.screenshot({ path: join(SHOTS, `${W}x${H}-${n}.png`) })
    const rail = p.getByRole('navigation', { name: 'Design process' })

    // 1 · Real Vancouver, Site, no tower
    await p.goto('/#/guided')
    await p.getByRole('button', { name: 'Start designing' }).click({ timeout: 8000 }).catch(() => {})
    await p.getByRole('tab', { name: 'Real Vancouver' }).first().click({ timeout: 120_000 })
    await p.getByRole('button', { name: 'Start designing' }).click({ timeout: 3000 }).catch(() => {})
    await rail.locator('[data-step="site"]').click({ timeout: 120_000 })
    await expect(p.getByTestId('nav-menu')).toBeVisible({ timeout: 120_000 })
    await expect.poll(async () => (await measure(p)).towers).toBe(0)
    await p.getByTestId('nav-menu').click()
    await expect(p.locator('[data-nav="tower"]')).toBeDisabled()
    await expect(p.locator('[data-nav="tower"]')).toContainText('No tower yet')
    await p.keyboard.press('Escape')
    await expect(p.getByRole('menu', { name: 'View commands' })).toHaveCount(0)
    await shot('01-enter')

    // 2–3 · search a location and preview it (the view moves to the marked point; the site has not moved)
    await p.getByRole('button', { name: 'Search online' }).click()
    const box = p.getByRole('combobox', { name: 'Address or neighbourhood' })
    await expect(p.getByText(/City addresses in the downtown box/)).toBeVisible({ timeout: 90_000 })
    await box.fill('1128 W Georgia')
    await p.getByRole('option').first().click()
    await settle(p)
    const preview = await measure(p)
    expect(preview.hasSite).toBe(false)
    expect(preview.widthM).toBeLessThan(800) // a block, not the city
    await shot('02-preview')

    // 4 · select the site: the City parcel there
    await p.getByRole('button', { name: 'Place site here' }).click()
    await p.getByRole('button', { name: 'Use as study site' }).click({ timeout: 2000 }).catch(() => {})
    await expect.poll(async () => (await measure(p)).hasSite, { timeout: 20_000 }).toBe(true)
    await settle(p)

    // 5 · Frame site: the whole boundary inside the free view with breathing room, and the streets around it
    await nav(p, 'site')
    let m = await measure(p)
    expect(inside(m.corners, 0.05)).toBe(true)
    expect(m.widthM).toBeGreaterThanOrEqual(250)
    expect(m.targetToSite!).toBeLessThan(60)
    await expect(p.getByTestId('nav-scale')).toHaveAttribute('data-scale', 'site')
    await shot('05-frame-site')

    // 6 · Plan: straight down, north up, over the site
    await nav(p, 'plan')
    m = await measure(p)
    expect(m.elevation).toBeGreaterThan(89)
    expect(m.targetToSite!).toBeLessThan(60)
    expect(inside(m.corners)).toBe(true)
    await expect(p.getByTestId('nav-scale')).toHaveAttribute('data-scale', 'plan')
    await shot('06-plan')

    // 7 · back to 3D, over the same place
    await nav(p, '3d')
    m = await measure(p)
    expect(m.elevation).toBeGreaterThan(30); expect(m.elevation).toBeLessThan(75)
    expect(inside(m.corners)).toBe(true)
    await shot('07-3d')

    // 8 · orbit, pan, zoom: still around the site, not stranded
    const cv = (await p.locator('[data-viewport] canvas').first().boundingBox())!
    const cx = cv.x + cv.width / 2, cy = cv.y + cv.height / 2
    await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx + 140, cy + 20, { steps: 8 }); await p.mouse.up()
    await p.mouse.move(cx, cy); await p.mouse.down({ button: 'right' }); await p.mouse.move(cx - 60, cy + 30, { steps: 8 }); await p.mouse.up({ button: 'right' })
    await p.mouse.move(cx, cy); for (let k = 0; k < 3; k++) await p.mouse.wheel(0, -200)
    await p.waitForTimeout(800)
    m = await measure(p)
    expect(m.targetToSite!).toBeLessThan(400)
    expect(['site', 'neighbourhood', 'close']).toContain(m.scale)
    await shot('08-orbit-pan-zoom')

    // 9 · a nearby building: Inspect, click the roof of a City building next to the site, Frame selection (the . key)
    await p.getByRole('toolbar', { name: 'Map mode' }).getByRole('button', { name: 'Inspect', exact: true }).click()
    await p.waitForTimeout(600)
    const roofs = await p.evaluate(async () => {
      const urls = performance.getEntriesByType('resource').map((e) => e.name)
      const N = await import(urls.filter((n) => /\/src\/lib\/viewNav\.ts/.test(n)).pop()!)
      const sc = N.siteCentre(), r = N.nav.el.getBoundingClientRect(), out: { x: number; y: number; c: [number, number] }[] = []
      let nulls = 0
      for (let i = 0; i < 400000 && nulls < 50 && out.length < 12; i++) {
        const b = N.nav.building(i)
        if (!b) { nulls++; continue }
        nulls = 0
        const c = [b.ring.reduce((a: number, q: number[]) => a + q[0], 0) / b.ring.length, b.ring.reduce((a: number, q: number[]) => a + q[1], 0) / b.ring.length] as [number, number]
        const d = Math.hypot(c[0] - sc[0], c[1] - sc[1])
        if (d < 70 || d > 200 || b.roof - b.ground < 8) continue
        const q = N.toThree(c[0], c[1], b.roof).project(N.nav.camera)
        if (Math.abs(q.x) > 0.8 || Math.abs(q.y) > 0.6 || q.z > 1) continue
        out.push({ x: r.left + ((q.x + 1) / 2) * r.width, y: r.top + ((1 - q.y) / 2) * r.height, c })
      }
      return out
    })
    expect(roofs.length).toBeGreaterThan(0)
    let picked: [number, number] | null = null
    for (const r of roofs) {
      await p.mouse.click(r.x, r.y)
      await p.waitForTimeout(400)
      if (await p.getByText(/^Height .* m · roof/).count()) { picked = r.c; break }
    }
    expect(picked).not.toBeNull()
    await shot('09-building-picked')
    await p.locator('[data-viewport] canvas').first().focus()
    await p.keyboard.press('.')
    await settle(p)
    m = await measure(p)
    expect(m.status).toBe('Framed the inspected building')
    expect(Math.hypot(m.pose.target[0] - picked![0], m.pose.target[1] - picked![1])).toBeLessThan(150)
    await expect(p.getByText(/^Height .* m · roof/)).toBeVisible() // still picked (Inspect stays)
    await shot('09-frame-selection')

    // 10 · back to the site (the S key)
    await p.keyboard.press('s')
    await settle(p)
    m = await measure(p)
    expect(inside(m.corners, 0.05)).toBe(true)
    await shot('10-frame-site-again')

    // 11–12 · Form and back: the same view, the same site, the Site tool's working view
    const before = m
    await rail.locator('[data-phase="form"]').click(); await p.waitForTimeout(1200)
    await rail.locator('[data-phase="site"]').click(); await p.waitForTimeout(1200)
    m = await measure(p)
    expect(m.hasSite).toBe(true)
    expect(Math.hypot(...([0, 1, 2].map((i) => m.pose.target[i] - before.pose.target[i]) as [number, number, number]))).toBeLessThan(1)
    expect(Math.abs(m.distance - before.distance)).toBeLessThan(1)
    await expect(p.getByTestId('context-pins')).toContainText('Site')
    await shot('12-form-and-back')

    // Grabbing the view stops a move: start the overview, grab at once
    await p.locator('[data-viewport] canvas').first().focus()
    await p.keyboard.press('c')
    await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx + 30, cy, { steps: 3 }); await p.mouse.up()
    await settle(p)
    m = await measure(p)
    expect(m.widthM).toBeLessThan(8000) // stopped on the way, not at the 9 km overview
    // The overview, the neighbourhood and Home (keys)
    await p.keyboard.press('c'); await settle(p)
    await expect(p.getByTestId('nav-scale')).toHaveAttribute('data-scale', 'city')
    await p.keyboard.press('n'); await settle(p)
    await expect(p.getByTestId('nav-scale')).toHaveAttribute('data-scale', 'neighbourhood')
    await p.keyboard.press('Home'); await settle(p)
    m = await measure(p)
    expect(inside(m.corners)).toBe(true)
    expect(m.targetToSite!).toBeLessThan(120)
    await shot('13-home')
    await ctx.close()
  })
}
