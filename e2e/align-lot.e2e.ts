// Place on map lines the tower up with the lot under the click (lib/lotAlign.ts; Ruijie, 3 Nov). Driven like a user:
// press P, click a real downtown lot in the 3D view, read the hint, confirm with Enter, then read the tower's new
// rotation from the store. Before / proposal / after screenshots go to 04 Tool Plan/evaluation/2026-11-03-align/.
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const SHOTS = join(process.cwd(), '..', '04 Tool Plan', 'evaluation', '2026-11-03-align')
mkdirSync(SHOTS, { recursive: true })

/** Import one of the app's own modules (the instance the page loaded) by a pattern on its URL. */
const mod = (p: Page, pattern: string) => p.evaluate((pattern) => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => new RegExp(pattern).test(n)).pop() ?? null, pattern)

async function openCity(p: Page) {
  // Onboarding marked seen (as heights.e2e does): on a slow load the dialog can appear after the "Start designing" click
  // below has given up, and then it blocks every click (failed twice this way on 4 Nov).
  await p.addInitScript(() => { performance.setResourceTimingBufferSize(10_000); try { localStorage.setItem('ts.landing.skip', '0'); localStorage.setItem('ts.onboarding.seen', '1'); localStorage.removeItem('ts.citySite') } catch { /* ignore */ } })
  await p.goto('/#/guided')
  await p.waitForSelector('#root > *', { timeout: 60_000 })
  await p.getByRole('button', { name: 'Start designing' }).click({ timeout: 8000 }).catch(() => {})
  await p.getByRole('tab', { name: 'Real Vancouver' }).or(p.getByRole('button', { name: 'Real Vancouver' })).first().click()
  await p.waitForTimeout(5000)
  await p.getByRole('button', { name: 'Start designing' }).click({ timeout: 3000 }).catch(() => {})
}

// Real Vancouver frames are slow in software WebGL (SwiftShader, the project default): a screenshot can take minutes.
const SHOT = { timeout: 240_000 }

test('Place on map: the study tower turns to a downtown lot’s lines', async ({ page }) => {
  test.setTimeout(900_000)
  await openCity(page)
  const storeUrl = await mod(page, '/src/store\\.ts')
  const lotUrl = await mod(page, '/src/lib/lotAlign\\.ts')
  const parcelsUrl = await mod(page, '/src/lib/siteParcels\\.ts')
  const fiberUrl = await mod(page, '@react-three_fiber')
  expect(storeUrl && lotUrl && parcelsUrl && fiberUrl).toBeTruthy()

  // A downtown lot on the 45° grid, 150–300 m from the study tower (so the click lands on the ground, not the tower).
  const target = await page.evaluate(async ({ storeUrl, lotUrl, parcelsUrl }) => {
    const { useStore } = await import(/* @vite-ignore */ storeUrl!)
    const { lotFrame } = await import(/* @vite-ignore */ lotUrl!)
    const { loadParcelLayer } = await import(/* @vite-ignore */ parcelsUrl!)
    const layer = await loadParcelLayer()
    const t = useStore.getState().towers.city[0]
    for (let i = 0; i < layer.polys.length; i++) {
      const f = lotFrame(layer.polys[i].outer)
      const d = Math.hypot(f.centre[0] - t.x, f.centre[1] - t.y)
      if (d > 150 && d < 300 && f.angle > 40 && f.angle < 50 && Math.min(f.hu, f.hv) > 10) return { x: f.centre[0], y: f.centre[1], angle: f.angle, id: t.id, rotation: t.rotation }
    }
    return null
  }, { storeUrl, lotUrl, parcelsUrl })
  expect(target).not.toBeNull()
  const { x, y, angle } = target!

  // Top-down over the lot, the lot left of the centre (the layers dock covers the right of the canvas).
  await page.evaluate(async ({ storeUrl, x, y }) => {
    const { useStore } = await import(/* @vite-ignore */ storeUrl!)
    useStore.getState().set({ cameraRequest: { position: [x + 70, y - 2, 700], target: [x + 70, y, 30], fov: 30 } })
  }, { storeUrl, x, y })
  await page.waitForTimeout(4000)
  await page.screenshot({ path: join(SHOTS, '1-before.png'), ...SHOT })

  await page.keyboard.press('p')
  await page.waitForTimeout(800)
  const at = await page.evaluate(async ({ fiberUrl, storeUrl, x, y }) => {
    const f = await import(/* @vite-ignore */ fiberUrl!)
    const { useStore } = await import(/* @vite-ignore */ storeUrl!)
    const canvas = document.querySelector('[data-viewport] canvas') as HTMLCanvasElement
    const st = f._roots.get(canvas).store.getState()
    const v = st.camera.position.clone().set(x, useStore.getState().groundElevation, -y).project(st.camera)
    const r = canvas.getBoundingClientRect()
    return { cx: r.left + ((v.x + 1) / 2) * r.width, cy: r.top + ((1 - v.y) / 2) * r.height }
  }, { fiberUrl, storeUrl, x, y })
  await page.mouse.click(at.cx, at.cy)
  const hint = page.getByTestId('align-hint')
  await expect(hint).toContainText(/Aligned to the lot lines \(lot at /, { timeout: 30_000 })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: join(SHOTS, '2-proposal.png'), ...SHOT })

  await page.keyboard.press('Enter')
  await page.waitForTimeout(3000)
  const after = await page.evaluate(async ({ storeUrl }) => {
    const { useStore } = await import(/* @vite-ignore */ storeUrl!)
    const t = useStore.getState().towers.city[0]
    return { x: t.x, y: t.y, rotation: t.rotation, placing: useStore.getState().placing }
  }, { storeUrl })
  await page.screenshot({ path: join(SHOTS, '3-after.png'), ...SHOT })
  const mod90 = (a: number) => ((a % 90) + 90) % 90
  expect(Math.abs(mod90(after.rotation) - angle)).toBeLessThan(0.01) // parallel to the lot's lines
  expect(Math.hypot(after.x - x, after.y - y)).toBeLessThan(40) // on the clicked lot
  expect(after.placing).toBe(false)
})
