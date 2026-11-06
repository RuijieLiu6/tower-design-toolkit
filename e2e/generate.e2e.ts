// Generate (Sinnie Choi's massing generator from her Downtown Massing Tool, ported with her permission, 6 Nov 2026): on
// the competition site's empty Volume step, open Generate from the "Place your tower" card, place Podium + Tower (one
// parametric tower with its podium storeys), then the Courtyard (one exact generated mass with the open court), and
// Undo back through both to the empty site.
import { expect, test, type Page } from '@playwright/test'
import { join } from 'node:path'

const SHOTS = join('..', '04 Tool Plan', 'evaluation', '2026-11-06-generate')

type Snap = { n: number; towers: { name: string; imported: string | null; floors: number; podiumFloors: number; ring: boolean }[] }
async function towers(p: Page): Promise<Snap> {
  return p.evaluate(async () => {
    const pick = (re: RegExp) => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => re.test(n)).pop()!
    const { useStore } = await import(/* @vite-ignore */ pick(/\/src\/store\.ts/))
    const m = await import(/* @vite-ignore */ pick(/\/src\/engine\/massing\.ts/))
    const list = useStore.getState().towers.vtc
    return {
      n: list.length,
      towers: list.map((t: { name: string; imported?: { format: string; storeys: { loops: unknown[]; podium: boolean }[] } }) => {
        const f = m.towerFloors(t) as { podium: boolean }[]
        return { name: t.name, imported: t.imported?.format ?? null, floors: f.length, podiumFloors: f.filter((x) => x.podium).length, ring: !!t.imported?.storeys.some((s) => s.podium && s.loops.length === 2) }
      }),
    }
  })
}

test('Generate: Podium + Tower and Courtyard on the competition site, then Undo', async ({ page: p }) => {
  test.setTimeout(600_000)
  await p.addInitScript(() => { performance.setResourceTimingBufferSize(10_000); try { localStorage.setItem('ts.landing.skip', '1'); localStorage.setItem('ts.onboarding.seen', '1') } catch { /* ignore */ } })
  const errors: string[] = []
  p.on('pageerror', (e) => errors.push(e.message))
  await p.goto('/#/guided')
  await p.waitForSelector('#root > *', { timeout: 60_000 })
  await p.getByRole('tab', { name: 'Competition site' }).or(p.getByRole('button', { name: 'Competition site' })).first().click({ timeout: 120_000 })
  await p.getByRole('navigation', { name: 'Design process' }).locator('[data-step="volume"]').click()

  // An empty site: "Place your tower" leads, and Generate is the one tool beside it (it makes towers).
  await expect(p.getByTestId('place-first-tower')).toBeVisible({ timeout: 30_000 })
  await expect(p.getByRole('tablist', { name: 'Design tools' }).getByRole('tab')).toHaveCount(1)
  await expect(p.locator('[role="tab"][data-tool="generate"]')).toContainText('Generate')
  await p.getByTestId('open-generate').click()
  const tool = p.getByTestId('generate-tool')
  await expect(tool).toBeVisible()
  await expect(tool).toContainText('Downtown Massing Tool')
  await expect(p.getByTestId('generate-site')).toContainText('144.8 × 79.2')

  // Podium + Tower: one parametric tower; the podium keeps the generator's storeys.
  await p.getByRole('radio', { name: 'Podium + Tower', exact: true }).click()
  await expect(p.getByTestId('generate-result')).toContainText('of 120,000 m²')
  await p.getByTestId('generate-place').click()
  await expect(p.getByTestId('generate-result').getByRole('status')).toContainText('Placed Podium + Tower: 1 tower')
  await expect(p.getByTestId('place-first-tower')).toHaveCount(0)
  const podium = await towers(p)
  expect(podium.n).toBe(1)
  expect(podium.towers[0].imported).toBeNull()
  expect(podium.towers[0].podiumFloors).toBeGreaterThanOrEqual(3)
  await p.screenshot({ path: join(SHOTS, '01-podium-tower.png') })

  // Courtyard: one exact generated mass, its podium storeys a ring around the open court.
  await p.getByRole('radio', { name: 'Courtyard Podium + Tower', exact: true }).click()
  await p.getByTestId('generate-place').click()
  await expect(p.getByTestId('generate-result').getByRole('status')).toContainText('Placed Courtyard Podium + Tower')
  const court = await towers(p)
  expect(court.n).toBe(1)
  expect(court.towers[0].imported).toBe('generated')
  expect(court.towers[0].ring).toBe(true)
  // The towers list says where it came from (the Massing panel, open now, says it too).
  await expect(p.getByText('· generated').first()).toBeVisible()
  await p.screenshot({ path: join(SHOTS, '02-courtyard.png') })

  // Undo: back to Podium + Tower, then to the empty site.
  const undo = p.getByRole('button', { name: 'Undo' }).first()
  await undo.click()
  await expect.poll(async () => (await towers(p)).towers[0]?.imported ?? 'none').toBe('none')
  expect((await towers(p)).n).toBe(1)
  await undo.click()
  await expect.poll(async () => (await towers(p)).n).toBe(0)
  await expect(p.getByTestId('place-first-tower')).toBeVisible()
  expect(errors).toEqual([])
})
