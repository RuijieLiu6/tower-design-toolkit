// Sinnie Choi's drawing tools in the Toolkit (Ruijie, 17 Nov), driven like a user on both projects: Start your massing's
// four tiles; a rectangle drawn on the ground becomes a mass (a tower with a drawn outline and sliced storeys); Push /
// pull with a typed height sets its storeys and the VTC rules read it; Offset by a typed value; Copy with a typed count;
// Split across it; a Boolean union of two overlapping masses; Erase; Undo. On Real Vancouver a case-study tower is
// placed and a mass drawn. Screenshots go to docs/evaluation/2026-11-17-drawing-tools/.
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { openResultDetails } from './helpers'

const SHOTS = join(process.cwd(), 'docs', 'evaluation', '2026-11-17-drawing-tools')
mkdirSync(SHOTS, { recursive: true })
const pick = (re: RegExp) => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => re.test(n)).pop()!

type Mass = { id: string; name: string; height: number; pts: [number, number][]; floors: number; area: number }
/** The towers of the open project: drawn masses with their outline, the rest with their height. */
async function masses(p: Page): Promise<Mass[]> {
  return p.evaluate(async (src) => {
    const pick = new Function(`return (${src})`)() as (re: RegExp) => string
    const { useStore } = await import(/* @vite-ignore */ pick(/\/src\/store\.ts/))
    const s = useStore.getState()
    const area = (r: [number, number][]) => Math.abs(r.reduce((a: number, q: [number, number], i: number) => { const n = r[(i + 1) % r.length]; return a + q[0] * n[1] - n[0] * q[1] }, 0) / 2)
    return s.towers[s.project].map((t: { id: string; name: string; height: number; drawn?: { pts: [number, number][]; floors: number } }) => ({ id: t.id, name: t.name, height: t.height, pts: t.drawn?.pts ?? [], floors: t.drawn?.floors ?? 0, area: t.drawn ? area(t.drawn.pts) : 0 }))
  }, pick.toString())
}
/** Screen point of a project-frame point (x east, y north, z up) through the live camera. */
async function screenOf(p: Page, pt: [number, number, number]) {
  return p.evaluate(async ({ src, pt }) => {
    const pick = new Function(`return (${src})`)() as (re: RegExp) => string
    const f = await import(/* @vite-ignore */ pick(/@react-three_fiber/))
    const canvas = document.querySelector('[data-viewport] canvas') as HTMLCanvasElement
    const st = f._roots.get(canvas).store.getState()
    const v = st.camera.position.clone().set(pt[0], pt[2], -pt[1]).project(st.camera)
    const r = canvas.getBoundingClientRect()
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }
  }, { src: pick.toString(), pt })
}
async function drag(p: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await p.mouse.move(from.x, from.y); await p.mouse.down()
  for (let i = 1; i <= 8; i++) await p.mouse.move(from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8)
  await p.mouse.up()
}
const centroid = (r: [number, number][]): [number, number] => [r.reduce((s, q) => s + q[0], 0) / r.length, r.reduce((s, q) => s + q[1], 0) / r.length]
const rail = (p: Page) => p.getByRole('toolbar', { name: 'Design tools' })
const drawTile = (p: Page, id: string) => rail(p).locator(`[data-draw="${id}"]`)

async function closeContextCard(p: Page) {
  const card = p.getByRole('heading', { name: 'Competition context not loaded' })
  if (await card.isVisible().catch(() => false)) await card.locator('xpath=..').getByRole('button', { name: 'Close' }).click()
}

test('Drawing tools: rectangle, push / pull, offset, copy, split, union, erase, undo; a case study on Real Vancouver', async ({ page: p }) => {
  test.setTimeout(600_000)
  await p.addInitScript(() => { performance.setResourceTimingBufferSize(10_000); try { localStorage.setItem('ts.landing.skip', '1'); localStorage.setItem('ts.onboarding.seen', '1') } catch { /* ignore */ } })
  const errors: string[] = []
  p.on('pageerror', (e) => errors.push(e.message))
  await p.goto('/#/guided')
  await p.waitForSelector('#root > *', { timeout: 60_000 })
  await p.getByRole('tab', { name: 'Competition site' }).or(p.getByRole('button', { name: 'Competition site' })).first().click({ timeout: 120_000 })
  await p.getByRole('navigation', { name: 'Design process' }).locator('[data-step="volume"]').click()

  // Start your massing: four tiles; From scratch starts the Rectangle tool; the link under them places the starting tower.
  const start = p.getByTestId('place-first-tower')
  await expect(start).toBeVisible({ timeout: 60_000 })
  await expect(start.locator('[data-start]')).toHaveCount(4)
  await start.locator('[data-start="case"]').click()
  await expect(p.getByTestId('case-studies').locator('[data-case]')).toHaveCount(9)
  await expect(p.getByTestId('case-studies')).toContainText('Unverified')
  await p.waitForTimeout(500)
  await p.screenshot({ path: join(SHOTS, '01-start-massing.png') })
  await start.locator('[data-start="scratch"]').click()
  await expect(p.getByTestId('draw-panel')).toHaveAttribute('data-draw-tool', 'rect')
  await p.keyboard.press('Escape')
  await expect(p.getByTestId('draw-panel')).toHaveCount(0)
  await start.locator('[data-testid="place-tower"]').click()
  await start.waitFor({ state: 'detached', timeout: 30_000 })
  await p.keyboard.press('Escape')
  await closeContextCard(p)
  await p.waitForTimeout(1200)

  // The rail has the drawing tools on the Form step; Rectangle by its key, the Drawing tab opens with the snapping panel.
  await expect(drawTile(p, 'rect')).toBeVisible()
  await expect(drawTile(p, 'split')).toBeVisible()
  await p.keyboard.press('b')
  await expect(drawTile(p, 'rect')).toHaveAttribute('aria-pressed', 'true')
  const panel = p.getByTestId('draw-panel')
  await expect(panel).toHaveAttribute('data-draw-tool', 'rect')
  await expect(panel.getByTestId('snap-panel')).toBeVisible()
  // A rectangle on the ground east of the tower: 30 × 15 m becomes Mass 1 with 6 storeys; the tool goes to Push / pull.
  const n0 = (await masses(p)).length
  await drag(p, await screenOf(p, [20, -20, 0]), await screenOf(p, [50, -5, 0]))
  await expect.poll(async () => (await masses(p)).length).toBe(n0 + 1)
  let m1 = (await masses(p)).find((m) => m.pts.length)!
  expect(m1.name).toBe('Mass 1')
  expect(m1.floors).toBe(6)
  expect(m1.area).toBeCloseTo(450, 0)
  await expect(p.getByTestId('draw-toast')).toContainText('Mass 1')
  await expect(drawTile(p, 'pull')).toHaveAttribute('aria-pressed', 'true')
  // Push / pull with a typed height: 36 m → 10 storeys; the competition rules then read the mass.
  await p.keyboard.type('36')
  await expect(p.getByTestId('draw-tag')).toContainText('36')
  await p.keyboard.press('Enter')
  await expect.poll(async () => (await masses(p)).find((m) => m.name === 'Mass 1')!.floors).toBe(10)
  m1 = (await masses(p)).find((m) => m.name === 'Mass 1')!
  // A wall taken near its top and let go after one pixel stays put: the pointer's plane is the wall's hit height.
  {
    const c = centroid(m1.pts), ys = m1.pts.map((q) => q[1]), south = Math.min(...ys)
    const at = await screenOf(p, [c[0], south, m1.height * 0.85])
    await p.mouse.move(at.x, at.y); await p.mouse.down(); await p.mouse.move(at.x + 1, at.y, { steps: 2 }); await p.mouse.up()
    await p.waitForTimeout(300)
    const after = (await masses(p)).find((m) => m.name === 'Mass 1')!
    // one pixel is under a metre at this zoom; the old mid-height plane moved it by the wall's height over the view's slope (about 10 m)
    expect(Math.abs(Math.min(...after.pts.map((q) => q[1])) - south)).toBeLessThan(2.5)
    // a half-metre grid step may have been taken: Ctrl+Z puts the outline back (one undo step)
    if (after.area !== m1.area) { await p.keyboard.press('Control+z'); await expect.poll(async () => (await masses(p)).find((m) => m.name === 'Mass 1')!.area).toBeCloseTo(m1.area, 3) }
  }
  expect(m1.height).toBeCloseTo(36, 3)
  await p.getByRole('tab', { name: 'Results', exact: true }).click()
  await openResultDetails(p)
  await expect(p.getByText(/Height band: Mass 1/).first()).toBeVisible({ timeout: 60_000 })
  await p.waitForTimeout(500)
  await p.screenshot({ path: join(SHOTS, '02-drawing.png') })
  // Offset by a typed 2 m: the outline grows.
  await p.keyboard.press('g')
  await expect(panel).toHaveAttribute('data-draw-tool', 'offset')
  await p.keyboard.type('2'); await p.keyboard.press('Enter')
  await expect.poll(async () => (await masses(p)).find((m) => m.name === 'Mass 1')!.area).toBeCloseTo(34 * 19, 0)
  m1 = (await masses(p)).find((m) => m.name === 'Mass 1')!
  const c1 = centroid(m1.pts)
  // Copy: drag the mass, then type 3 and Enter for three in a row.
  await p.keyboard.press('c')
  await drag(p, await screenOf(p, [c1[0], c1[1], m1.height]), await screenOf(p, [c1[0] + 45, c1[1], m1.height]))
  await expect.poll(async () => (await masses(p)).filter((m) => m.pts.length).length).toBe(2)
  await p.keyboard.type('3'); await p.keyboard.press('Enter')
  await expect.poll(async () => (await masses(p)).filter((m) => m.pts.length).length).toBe(4)
  // Split Mass 1 across its middle: two parts of one building.
  await p.keyboard.press('x')
  const ys = m1.pts.map((q) => q[1]), y0 = Math.min(...ys), y1 = Math.max(...ys)
  await p.mouse.click(...(Object.values(await screenOf(p, [c1[0], y0, m1.height])) as [number, number]))
  await p.mouse.click(...(Object.values(await screenOf(p, [c1[0], y1, m1.height])) as [number, number]))
  await expect.poll(async () => (await masses(p)).filter((m) => m.pts.length).length).toBe(5)
  await expect(p.getByTestId('draw-toast')).toContainText('cut into')
  // Boolean union: a second rectangle over the first part, then union: one mass fewer.
  await p.keyboard.press('b')
  await drag(p, await screenOf(p, [c1[0] - 8, c1[1] - 6, 0]), await screenOf(p, [c1[0] + 8, c1[1] + 6, 0]))
  await expect.poll(async () => (await masses(p)).filter((m) => m.pts.length).length).toBe(6)
  const before = (await masses(p)).filter((m) => m.pts.length)
  const over = before[before.length - 1]
  // the overlapped first part is set to the same storeys as the new mass, so the union is plain
  await p.keyboard.press('u')
  await p.mouse.click(...(Object.values(await screenOf(p, [centroid(over.pts)[0], centroid(over.pts)[1], over.height])) as [number, number]))
  await p.keyboard.press('Escape')
  await p.keyboard.press('j')
  await expect(panel).toHaveAttribute('data-draw-tool', 'bool')
  const first = before.find((m) => m.name === 'Mass 1')!
  await p.mouse.click(...(Object.values(await screenOf(p, [centroid(first.pts)[0], centroid(first.pts)[1] - 1, first.height])) as [number, number]))
  await expect(p.getByTestId('draw-toast')).toContainText('first mass')
  await p.mouse.click(...(Object.values(await screenOf(p, [centroid(over.pts)[0] + 6, centroid(over.pts)[1], over.height])) as [number, number]))
  await expect(p.getByTestId('draw-toast')).toContainText(/Joined/)
  // Erase a copy, then Undo brings it back.
  const nBefore = (await masses(p)).length
  await p.keyboard.press('e')
  const copy = (await masses(p)).find((m) => m.name === 'Mass 1 copy')!
  await p.mouse.click(...(Object.values(await screenOf(p, [centroid(copy.pts)[0], centroid(copy.pts)[1], copy.height])) as [number, number]))
  await expect.poll(async () => (await masses(p)).length).toBe(nBefore - 1)
  await p.keyboard.press('Escape')
  await p.keyboard.press('Control+z')
  await expect.poll(async () => (await masses(p)).length).toBe(nBefore)

  // Real Vancouver: a case-study tower placed with its published numbers, then a mass drawn on the city.
  await p.getByRole('tab', { name: 'Real Vancouver' }).click()
  await p.waitForTimeout(4000)
  await p.getByRole('button', { name: 'Start designing' }).click({ timeout: 3000 }).catch(() => {})
  await p.getByRole('navigation', { name: 'Design process' }).locator('[data-step="volume"]').click()
  // Switching brings the competition design along (lib/defaultSite.ts); this part starts from an empty city.
  await p.evaluate(async (src) => { const pick = new Function(`return (${src})`)() as (re: RegExp) => string; const { useStore } = await import(/* @vite-ignore */ pick(/\/src\/store\.ts/)); const s = useStore.getState(); useStore.setState({ towers: { ...s.towers, city: [] }, selectedTower: '' }) }, pick.toString())
  const start2 = p.getByTestId('place-first-tower')
  await expect(start2).toBeVisible({ timeout: 60_000 })
  await start2.locator('[data-start="case"]').click()
  await p.getByTestId('case-studies').locator('[data-case="vancouver-house"]').click()
  await expect.poll(async () => (await masses(p)).length).toBe(1)
  const vh = (await masses(p))[0]
  expect(vh.name).toBe('Vancouver House')
  expect(vh.height).toBe(150)
  await p.keyboard.press('Escape')
  await p.waitForTimeout(1500)
  await p.keyboard.press('b')
  await expect(drawTile(p, 'rect')).toHaveAttribute('aria-pressed', 'true')
  const site = await p.evaluate(async (src) => { const pick = new Function(`return (${src})`)() as (re: RegExp) => string; const { useStore } = await import(/* @vite-ignore */ pick(/\/src\/store\.ts/)); const s = useStore.getState(); const t = s.towers.city[0]; return { x: t.x, y: t.y, g: s.groundElevation } }, pick.toString())
  await drag(p, await screenOf(p, [site.x + 60, site.y - 10, site.g]), await screenOf(p, [site.x + 80, site.y + 10, site.g]))
  await expect.poll(async () => (await masses(p)).length).toBe(2)
  expect(errors).toEqual([])
})
