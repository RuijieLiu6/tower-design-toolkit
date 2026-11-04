// Schematic design tools (core-and-lift session): drag a block top in the Section editor and a core edge in the Plan
// editor, check the store after each release, then undo each drag in one step.
import { expect, test, type Page } from '@playwright/test'

test.describe.configure({ mode: 'serial', timeout: 300_000 })

type Snap = { height: number; blocks: { id: string; height: number }[]; coreShare: number; coreAuto: boolean | undefined }

async function tower(p: Page): Promise<Snap> {
  return p.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\/src\/store\.ts/.test(n)).pop()!
    const { useStore } = await import(/* @vite-ignore */ url)
    const s = useStore.getState()
    const t = s.towers[s.project].find((x: { id: string }) => x.id === s.selectedTower) ?? s.towers[s.project][0]
    return { height: t.height, blocks: (t.blocks ?? []).map((b: { id: string; height: number }) => ({ id: b.id, height: b.height })), coreShare: t.coreShare, coreAuto: t.coreAuto }
  })
}

async function openSchematic(p: Page) {
  await p.addInitScript(() => { performance.setResourceTimingBufferSize(10_000); try { localStorage.setItem('ts.landing.skip', '0'); localStorage.setItem('ts.onboarding.seen', '1') } catch { /* ignore */ } })
  await p.goto('/#/guided')
  await p.waitForSelector('#root > *', { timeout: 60_000 })
  await p.getByRole('tab', { name: 'Competition site' }).or(p.getByRole('button', { name: 'Competition site' })).first().click({ timeout: 120_000 })
  await p.keyboard.press('2')
  await p.waitForTimeout(1500)
}

async function openTool(p: Page, id: 'plan' | 'section') {
  const head = p.locator(`[data-tool="${id}"] button[aria-expanded]`).first() // tools/ToolPanel.tsx wraps each tool in a div
  await head.waitFor({ timeout: 60_000 })
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click()
  await p.getByTestId(`open-${id}-tool`).click()
  await p.locator(`[data-design-tool="${id}"]`).waitFor({ timeout: 60_000 })
}

/** Press on a grip, move in steps, release (one drag = one store write). */
async function drag(p: Page, testId: string, dx: number, dy: number) {
  const box = (await p.getByTestId(testId).boundingBox())!
  const x = box.x + box.width / 2, y = box.y + box.height / 2
  await p.mouse.move(x, y)
  await p.mouse.down()
  for (let k = 1; k <= 8; k++) await p.mouse.move(x + (dx * k) / 8, y + (dy * k) / 8)
  await p.mouse.up()
  await p.waitForTimeout(800)
}

const undo = (p: Page) => p.getByRole('button', { name: 'Undo' }).click()

test('Section: dragging a block top lowers the tower to a floor line, and one undo restores it', async ({ page }) => {
  await openSchematic(page)
  await openTool(page, 'section')
  const before = await tower(page)
  const top = before.blocks.length - 1
  await drag(page, `section-top-${top}`, 0, 60)
  const after = await tower(page)
  expect(after.height).toBeLessThan(before.height - 4)
  expect(after.blocks[top].height).toBeLessThan(before.blocks[top].height)
  expect(after.blocks.slice(0, top)).toEqual(before.blocks.slice(0, top))
  await undo(page)
  await page.waitForTimeout(800)
  expect(await tower(page)).toEqual(before)
})

test('Plan: dragging a core edge enlarges the core and sets it by hand, and one undo restores it', async ({ page }) => {
  await openSchematic(page)
  await openTool(page, 'plan')
  const before = await tower(page)
  await drag(page, 'plan-core-e', 30, 0)
  const after = await tower(page)
  expect(after.coreShare).toBeGreaterThan(before.coreShare)
  expect(after.coreAuto).toBe(false)
  await undo(page)
  await page.waitForTimeout(800)
  const back = await tower(page)
  expect(back.coreShare).toBeCloseTo(before.coreShare, 6)
  expect(back.coreAuto).toBe(before.coreAuto)
})
