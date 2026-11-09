// The five map tabs over Real Vancouver's view (Vista layout, 3 Nov), driven like a user: City returns to the overview,
// Plan looks straight down 1 km across, Inspect frames the proposed tower in axonometric and reads a click, Observer goes to a protected viewpoint with a
// cone picker, Viewcone turns every cone on or off (in step with the Layers dock). Screenshots go to
// test-results/vista-tabs/.
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { placeStartingTower } from './helpers'

const SHOTS = join(process.cwd(), 'test-results', 'vista-tabs')
mkdirSync(SHOTS, { recursive: true })

async function openCity(p: Page) {
  await p.addInitScript(() => { performance.setResourceTimingBufferSize(10_000); try { localStorage.setItem('ts.landing.skip', '0'); localStorage.setItem('ts.onboarding.seen', '1') } catch { /* ignore */ } })
  await p.goto('/#/guided')
  await p.waitForSelector('#root > *', { timeout: 60_000 })
  await p.getByRole('button', { name: 'Start designing' }).click({ timeout: 8000 }).catch(() => {})
  await p.getByRole('tab', { name: 'Real Vancouver' }).or(p.getByRole('button', { name: 'Real Vancouver' })).first().click()
  await p.getByRole('button', { name: 'Start designing' }).click({ timeout: 3000 }).catch(() => {})
  // A project opens with no tower (6 Nov): place the study tower first (Plan and Inspect frame it), as a user does.
  await placeStartingTower(p)
  // The place labels need the city data and a drawn frame: once any shows (which ones depends on the view's width), the scene is up.
  await p.waitForFunction(() => [...document.querySelectorAll<HTMLElement>('[data-viewport] [data-x]')].some((d) => d.style.display === ''), null, { timeout: 420_000 })
}

/** The orbit camera in the model frame (x east, y north, z up), from the canvas's own store. */
async function camera(p: Page) {
  return p.evaluate(async () => {
    // Vite names the R3F chunk either @react-three_fiber.js or react-three-fiber.esm-<hash>.js (after a deps re-optimise).
    const res = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /react-three[_-]fiber/.test(n))
    type Roots = { _roots?: Map<unknown, { store: { getState: () => { camera: { position: { x: number; y: number; z: number }; fov: number }; controls: { target: { x: number; y: number; z: number } } } } }> }
    let F: Roots | null = null
    for (const url of res.reverse()) { const m = (await import(/* @vite-ignore */ url)) as Roots; if (m._roots) { F = m; break } }
    if (!F?._roots) throw new Error('react-three-fiber module not found among ' + res.join(', '))
    const roots = [...F._roots.values()]
    const st = roots[roots.length - 1].store.getState(), c = st.camera.position, t = st.controls.target
    return { pos: [c.x, -c.z, c.y], target: [t.x, -t.z, t.y], fov: st.camera.fov }
  })
}

const tabs = (p: Page) => p.getByRole('toolbar', { name: 'Map mode' })
const tab = (p: Page, name: string) => tabs(p).getByRole('button', { name, exact: true })

test('the five map tabs change the view; Viewcone toggles the cones and Materials the textured style', async ({ page }) => {
  test.setTimeout(900_000) // SwiftShader: about 10 minutes with the cone volumes and Context
  await openCity(page)
  await expect(tab(page, 'City')).toHaveAttribute('aria-pressed', 'true')
  const box = (await page.locator('[data-viewport] canvas').first().boundingBox())!

  // Plan: straight down, north up, over the site or the selection (here the proposed tower), fitted to it with its streets:
  // at least about 400 m across (9 Nov, Milestone 1: Plan frames the relevant place instead of a fixed 1 km).
  await tab(page, 'Plan').click()
  await expect(tab(page, 'Plan')).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => (await camera(page)).fov, { timeout: 30_000 }).toBeCloseTo(20, 0)
  await page.waitForTimeout(1500)
  const plan = await camera(page)
  const width = 2 * (plan.pos[2] - plan.target[2]) * Math.tan((plan.fov / 2) * Math.PI / 180) * (box.width / box.height)
  expect(width).toBeGreaterThan(380); expect(width).toBeLessThan(1500)
  expect(Math.hypot(plan.pos[0] - plan.target[0], plan.pos[1] - plan.target[1])).toBeLessThan(1)
  await page.screenshot({ path: join(SHOTS, '01-plan.png') })

  // City: every press goes back to Vista's overview, wherever the view was.
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await tab(page, 'City').click()
  await expect.poll(async () => (await camera(page)).fov, { timeout: 30_000 }).toBeCloseTo(45, 0)
  await page.waitForTimeout(1500)
  const city = await camera(page)
  expect(Math.hypot(city.pos[0] - 9914.4, city.pos[1] + 118.2, city.pos[2] - 6160.9)).toBeLessThan(5)
  await page.screenshot({ path: join(SHOTS, '02-city.png') })

  // Inspect: a close near-parallel axonometric of the proposed tower; a click still answers with a card or says why not.
  await tab(page, 'Inspect').click()
  await expect(tab(page, 'Inspect')).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => (await camera(page)).fov, { timeout: 30_000 }).toBeCloseTo(6, 0)
  await page.waitForTimeout(1500)
  const axo = await camera(page)
  const d = Math.hypot(axo.pos[0] - axo.target[0], axo.pos[1] - axo.target[1], axo.pos[2] - axo.target[2])
  expect(Math.asin((axo.pos[2] - axo.target[2]) / d) * 180 / Math.PI).toBeCloseTo(35.26, 0) // isometric elevation
  expect(d).toBeLessThan(3000) // close: a 120 m tower fills the view
  await page.screenshot({ path: join(SHOTS, '03-inspect.png') })
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.7)
  await expect(page.getByText(/OSM building w\d+|No building there|no roof height/).first()).toBeVisible({ timeout: 15_000 })
  await page.keyboard.press('Escape')
  await expect(tab(page, 'City')).toHaveAttribute('aria-pressed', 'true')

  // Observer: the eye at the protected viewpoint of the cone that controls the study tower, with a picker for the others.
  await tab(page, 'Observer').click()
  await expect(tab(page, 'Observer')).toHaveAttribute('aria-pressed', 'true')
  const picker = page.getByLabel('Protected view to look from')
  await expect(picker).toHaveValue('3.2.3')
  await expect(page.getByText(/Lv 124\.6 m/).first()).toBeVisible()
  await page.waitForTimeout(2000)
  await page.screenshot({ path: join(SHOTS, '04-observer.png') })
  await picker.selectOption('E')
  await expect(picker).toHaveValue('E')
  await tab(page, 'City').click()
  await expect(tab(page, 'City')).toHaveAttribute('aria-pressed', 'true')
  // Let City's camera move finish before measuring that Viewcone does not move the camera.
  await expect.poll(async () => { const c = await camera(page); return Math.hypot(c.pos[0] - 9914.4, c.pos[1] + 118.2, c.pos[2] - 6160.9) }, { timeout: 30_000 }).toBeLessThan(5)

  // Viewcone: one toggle; the cones start hidden (Ruijie, 9 Nov: a quiet Site view), then all on, then all off again;
  // no camera move; the Layers dock says the same.
  const before = await camera(page)
  const cones = tab(page, 'Viewcone')
  await expect(cones).toHaveAttribute('aria-pressed', 'false')
  await cones.click()
  await expect(cones).toHaveAttribute('aria-pressed', 'true')
  await page.screenshot({ path: join(SHOTS, '05-viewcone-on.png') })
  await cones.click()
  await expect(cones).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('button', { name: 'Layers', exact: true }).click()
  await expect(page.locator('#vp-dock').getByRole('button', { name: /View cone layers/ })).toContainText('all hidden')
  await page.getByRole('button', { name: 'Layers', exact: true }).click()

  // Names: the neighbourhood names on and off from the map bar (9 Nov), remembered in this browser.
  const names = page.getByTestId('names-toggle')
  await expect(names).toHaveAttribute('aria-pressed', 'true')
  await names.click()
  await expect(names).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('[data-viewport] [data-place]')).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('ts.map.names'))).toBe('0')
  await names.click()
  await expect(names).toHaveAttribute('aria-pressed', 'true')

  // Materials: the display mode that replaced the Context toggle (design system §9, 7 Nov): Vista's textured style on or
  // off, in step with the Layers dock's Plain / Context; Massing brings the neutral model back.
  const mode = (name: string) => page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name, exact: true })
  const context = mode('Materials')
  await expect(context).toHaveAttribute('aria-checked', 'false')
  await context.click()
  await expect(context).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: 'Layers', exact: true }).click()
  const styleCard = page.locator('#vp-dock').getByRole('button', { name: /Style & building types/ })
  if ((await styleCard.getAttribute('aria-expanded')) === 'false') await styleCard.click()
  await expect(page.locator('#vp-dock').getByRole('radio', { name: 'Context' })).toBeChecked()
  await page.waitForTimeout(4000)
  await page.screenshot({ path: join(SHOTS, '06-context-on.png') })
  await mode('Geometry').click()
  await expect(context).toHaveAttribute('aria-checked', 'false')
  await expect(page.locator('#vp-dock').getByRole('radio', { name: 'Plain' })).toBeChecked()
  await page.getByRole('button', { name: 'Layers', exact: true }).click()
  const after = await camera(page)
  expect(Math.hypot(after.pos[0] - before.pos[0], after.pos[1] - before.pos[1], after.pos[2] - before.pos[2])).toBeLessThan(1)
})
