// Place a tower (T4, 21 Nov): the design rail's "Place a tower" (A) on an empty project, then one click on the site
// puts exactly one tower there, on the Competition site's block and on Real Vancouver's default site. Live repro
// (21 Nov): the hint appeared but a click on the block placed nothing, since the click only moved a selected tower and
// an empty project has none. Driven like a user: the rail's tile, then a click on the canvas over the site.
// Run: node node_modules/playwright/cli.js test e2e/place-tower.e2e.ts
import { expect, test, type Page } from '@playwright/test'

type Pt = [number, number]
type Store = { getState: () => { project: 'vtc' | 'city'; towers: Record<'vtc' | 'city', { id: string; x: number; y: number }[]>; citySite: { ring: Pt[] } | null; groundElevation: number; placing: boolean; set: (p: object) => void } }
type Win = { __tdt?: { useStore: Store } }

/** The app's store (exposed in development by lib/drawn.ts). */
const towers = (p: Page) => p.evaluate(() => { const s = (window as unknown as Win).__tdt!.useStore.getState(); return s.towers[s.project].map((t) => ({ x: t.x, y: t.y })) })

/** A top-down camera over the model point `at`, so it lands near the middle of the canvas. */
async function lookDownAt(p: Page, at: Pt, height: number) {
  await p.evaluate(({ at, height }) => {
    const s = (window as unknown as Win).__tdt!.useStore.getState()
    const g = s.project === 'city' ? s.groundElevation : 0
    s.set({ cameraRequest: { position: [at[0], at[1] - 2, g + height], target: [at[0], at[1], g], fov: 30 } })
  }, { at, height })
  await p.waitForTimeout(1500)
}

/** Screen point of the model point `at` (on the ground), read from the 3D view's camera. */
async function screenOf(p: Page, at: Pt) {
  const fiberUrl = await p.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /@react-three_fiber/.test(n)).pop() ?? null)
  expect(fiberUrl).toBeTruthy()
  return p.evaluate(async ({ fiberUrl, at }) => {
    const f = await import(/* @vite-ignore */ fiberUrl!)
    const s = (window as unknown as Win).__tdt!.useStore.getState()
    const canvas = document.querySelector('[data-viewport] canvas') as HTMLCanvasElement
    const st = f._roots.get(canvas).store.getState()
    const g = s.project === 'city' ? s.groundElevation : 0
    const v = st.camera.position.clone().set(at[0], g, -at[1]).project(st.camera)
    const r = canvas.getBoundingClientRect()
    const x = r.left + ((v.x + 1) / 2) * r.width, y = r.top + ((1 - v.y) / 2) * r.height
    // Nothing of the page's chrome over that point: the click reaches the canvas.
    return { x, y, onCanvas: document.elementFromPoint(x, y) === canvas }
  }, { fiberUrl, at })
}

async function open(p: Page, project: 'Competition site' | 'Real Vancouver') {
  await p.addInitScript(() => { performance.setResourceTimingBufferSize(10_000); try { localStorage.setItem('ts.landing.skip', '1'); localStorage.setItem('ts.onboarding.seen', '1'); localStorage.removeItem('ts.citySite') } catch { /* private mode */ } })
  await p.goto('/#/guided')
  await p.waitForSelector('#root > *', { timeout: 60_000 })
  await p.getByRole('button', { name: 'Start designing' }).click({ timeout: 5000 }).catch(() => {})
  await p.getByRole('tab', { name: project }).or(p.getByRole('button', { name: project })).first().click({ timeout: 120_000 })
  await p.getByRole('button', { name: 'Start designing' }).click({ timeout: 3000 }).catch(() => {})
  await p.waitForFunction(() => !!(window as unknown as Win).__tdt, null, { timeout: 60_000 })
  const rail = p.getByRole('navigation', { name: 'Design process' })
  if (project === 'Real Vancouver') {
    // The app opens on Real Vancouver with no site (the empty start, 6 Nov), so the top bar's tab has nothing to switch:
    // the Site step's Default tile sets the default site (lib/openCity.ts), as a user would.
    await rail.locator('[data-step="site"]').click({ timeout: 120_000 })
    await p.getByTestId('use-default-site').click({ timeout: 60_000 })
  }
  // The Form step (Massing), where a new project offers to start its massing.
  await rail.locator('[data-step="volume"]').click({ timeout: 120_000 })
  const card = p.getByRole('heading', { name: 'Competition context not loaded' })
  if (await card.isVisible().catch(() => false)) await card.locator('xpath=..').getByRole('button', { name: 'Close' }).click()
}

/** Rail › Place a tower, then one click on the canvas over `at`. */
async function placeAt(p: Page, at: Pt, height: number) {
  await lookDownAt(p, at, height)
  await p.getByTestId('tower-rail').locator('[data-tool="place"]').click()
  await expect(p.getByText('Click the ground where the tower should stand')).toBeVisible()
  const pt = await screenOf(p, at)
  expect(pt.onCanvas).toBe(true)
  await p.mouse.click(pt.x, pt.y)
}

test('Place a tower on the Competition site: one click on the block puts exactly one tower there', async ({ page: p }) => {
  test.setTimeout(300_000)
  const errors: string[] = []
  p.on('pageerror', (e) => errors.push(e.message))
  await open(p, 'Competition site')
  expect(await towers(p)).toHaveLength(0)
  // A point on the brief's block (centred on the origin, 30 m off its middle so the result is not the default spot).
  const at: Pt = [30, 10]
  await placeAt(p, at, 520)
  await expect.poll(() => towers(p).then((t) => t.length), { timeout: 20_000 }).toBe(1)
  const [t] = await towers(p)
  // Lined up with the block, so it may slide to fit; it stands on the block near the click.
  expect(Math.hypot(t.x - at[0], t.y - at[1])).toBeLessThan(40)
  // The click ends placing (the rail goes back to Select); another click on the ground adds nothing.
  await expect.poll(() => p.evaluate(() => (window as unknown as Win).__tdt!.useStore.getState().placing)).toBe(false)
  await expect(p.getByTestId('tower-rail').locator('[data-tool="select"]')).toHaveAttribute('aria-pressed', 'true')
  const again = await screenOf(p, [-40, -10])
  await p.mouse.click(again.x, again.y)
  await p.waitForTimeout(800)
  expect(await towers(p)).toHaveLength(1)
  expect(errors).toEqual([])
})

test('Place a tower on Real Vancouver: one click on the default site puts exactly one tower there', async ({ page: p }) => {
  test.setTimeout(600_000)
  const errors: string[] = []
  p.on('pageerror', (e) => errors.push(e.message))
  await open(p, 'Real Vancouver')
  // The Site step's Default tile set the default site (lib/defaultSite.ts).
  await p.waitForFunction(() => !!(window as unknown as Win).__tdt!.useStore.getState().citySite, null, { timeout: 60_000 })
  expect(await towers(p)).toHaveLength(0)
  const ring = await p.evaluate(() => (window as unknown as Win).__tdt!.useStore.getState().citySite!.ring)
  const at: Pt = [ring.reduce((a, q) => a + q[0], 0) / ring.length, ring.reduce((a, q) => a + q[1], 0) / ring.length]
  await placeAt(p, at, 600)
  await expect.poll(() => towers(p).then((t) => t.length), { timeout: 60_000 }).toBe(1)
  const [t] = await towers(p)
  expect(Math.hypot(t.x - at[0], t.y - at[1])).toBeLessThan(60)
  await expect.poll(() => p.evaluate(() => (window as unknown as Win).__tdt!.useStore.getState().placing)).toBe(false)
  expect(errors).toEqual([])
})
