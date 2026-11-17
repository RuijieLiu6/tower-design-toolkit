// The tool rail beside the model (components/ToolRail.tsx; Sinnie Choi's vertical column of tools, Ruijie 16 Nov), on
// the competition site with a tower placed: a toolbar with the edit modes first, then the same tools as the left panel's
// row for the step; a tool picked in the rail opens in the panel; Mass picked in the rail switches the panel's edit mode;
// Move from the rail switches the tower's toolbar; hover shows a name, nothing is written beside the icons; the arrow
// keys walk the rail (one tab stop); H hides it, leaving a small Show button, the choice survives a reload, and the
// button (or H) brings it back. The grip drags the rail to the model's right edge (the nearer drop zone lit), which a
// reload keeps; Esc cancels a drag; Left on the grip brings it back. Screenshots go to docs/evaluation/2026-11-16-tool-rail/.
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { placeStartingTower } from './helpers'

const SHOTS = join(process.cwd(), 'docs', 'evaluation', '2026-11-16-tool-rail')
mkdirSync(SHOTS, { recursive: true })

const rail = (p: Page) => p.getByRole('toolbar', { name: 'Design tools' })
const ids = (l: ReturnType<Page['locator']>, attr: 'tool' | 'mode') => l.evaluateAll((els, attr) => els.map((e) => (e as HTMLElement).dataset[attr]), attr)

test('Tool rail: the step\'s tools beside the model, the same as the panel; H hides it and is remembered', async ({ page: p }) => {
  test.setTimeout(420_000)
  await p.addInitScript(() => { try { localStorage.setItem('ts.landing.skip', '1'); localStorage.setItem('ts.onboarding.seen', '1') } catch { /* ignore */ } })
  const errors: string[] = []
  p.on('pageerror', (e) => errors.push(e.message))
  await p.goto('/#/guided')
  await p.waitForSelector('#root > *', { timeout: 60_000 })
  await p.getByRole('tab', { name: 'Competition site' }).or(p.getByRole('button', { name: 'Competition site' })).first().click({ timeout: 120_000 })
  await placeStartingTower(p, { stay: true })
  const card = p.getByRole('heading', { name: 'Competition context not loaded' })
  if (await card.isVisible().catch(() => false)) await card.locator('xpath=..').getByRole('button', { name: 'Close' }).click()

  // The rail is a vertical toolbar between the panel and the model, 48 px wide.
  await expect(rail(p)).toBeVisible()
  await expect(rail(p)).toHaveAttribute('aria-orientation', 'vertical')
  const box = (await rail(p).boundingBox())!
  const panelBox = (await p.getByTestId('phase-panel').boundingBox())!
  const modelBox = (await p.locator('[data-model-region]').boundingBox())!
  expect(Math.round(box.width)).toBe(48)
  expect(box.x).toBeGreaterThanOrEqual(panelBox.x + panelBox.width)
  expect(box.x + box.width).toBeLessThanOrEqual(modelBox.x + 1)

  // The same tools as the panel's row for this step (Form), in the same order; the edit modes first, then a divider.
  const panelRow = p.locator('[role="tablist"][aria-label="Design tools"] [data-tool]')
  await expect(panelRow.first()).toBeVisible()
  const panelTools = await ids(panelRow, 'tool')
  expect(panelTools.length).toBeGreaterThan(1)
  await expect.poll(() => ids(rail(p).locator('[data-tool]'), 'tool')).toEqual(panelTools)
  expect(await ids(rail(p).locator('[data-mode]'), 'mode')).toEqual(['place', 'move', 'rotate', 'face', 'mass'])
  const order = await rail(p).locator('[data-mode], [role="separator"], [data-tool]').evaluateAll((els) => els.map((e) => (e.hasAttribute('data-mode') ? 'mode' : e.hasAttribute('data-tool') ? 'tool' : 'sep')).join(' '))
  expect(order).toMatch(/^(mode )+sep( tool)+$/)

  // A tool picked in the rail opens in the panel, and the rail shows it open.
  await rail(p).locator('[data-tool="massing"]').click()
  await expect(p.locator('[role="tab"][data-tool="massing"]')).toHaveAttribute('aria-selected', 'true')
  await expect(p.locator('[data-tool-body="massing"]')).toBeVisible()
  await expect(rail(p).locator('[data-tool="massing"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(rail(p).locator('[data-tool="towers"]')).toHaveAttribute('aria-pressed', 'false')
  await expect(p.getByTestId('massing-edit')).toBeVisible()
  // And the other way: the panel's tile lights the rail's.
  await p.locator('[role="tab"][data-tool="towers"]').click()
  await expect(rail(p).locator('[data-tool="towers"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(rail(p).locator('[data-tool="massing"]')).toHaveAttribute('aria-pressed', 'false')

  // An edit mode from the rail: Mass opens Massing and the panel's radio follows; Face likewise.
  await rail(p).locator('[data-mode="mass"]').click()
  await expect(p.locator('[data-tool-body="massing"]')).toBeVisible()
  await expect(p.getByRole('radio', { name: /^Mass: / })).toHaveAttribute('aria-checked', 'true')
  await expect(rail(p).locator('[data-mode="mass"]')).toHaveAttribute('aria-pressed', 'true')
  await rail(p).locator('[data-mode="face"]').click()
  await expect(p.getByRole('radio', { name: /^Face: / })).toHaveAttribute('aria-checked', 'true')
  await expect(rail(p).locator('[data-mode="mass"]')).toHaveAttribute('aria-pressed', 'false')
  // Move from the rail: the tower's toolbar shows Move on; again turns it off.
  await rail(p).locator('[data-mode="move"]').click()
  const towerBar = p.getByRole('toolbar', { name: /^Selected tower/ })
  await expect(towerBar.getByRole('button', { name: 'Move the tower' })).toHaveAttribute('aria-pressed', 'true')
  await rail(p).locator('[data-mode="move"]').click()
  await expect(towerBar.getByRole('button', { name: 'Move the tower' })).toHaveAttribute('aria-pressed', 'false')

  // Hover reveals the full name and what it does; nothing is written beside the icons.
  await rail(p).locator('[data-tool="massing"]').hover()
  await expect(p.getByRole('tooltip')).toContainText('Massing')
  expect((await rail(p).innerText()).trim()).toBe('')
  await p.mouse.move(modelBox.x + modelBox.width / 2, modelBox.y + 40)
  await p.waitForTimeout(600)
  await p.screenshot({ path: join(SHOTS, '01-tool-rail.png') })

  // Keyboard: one tab stop; the arrow keys walk the rail; Enter opens the tool reached.
  const massing = rail(p).locator('[data-tool="massing"]')
  await massing.focus()
  await expect(massing).toBeFocused()
  const i = panelTools.indexOf('massing')
  const next = panelTools[(i + 1) % panelTools.length]
  await p.keyboard.press(i + 1 < panelTools.length ? 'ArrowDown' : 'Home')
  if (i + 1 < panelTools.length) await expect(rail(p).locator(`[data-tool="${next}"]`)).toBeFocused()
  expect(await rail(p).locator('button[tabindex="0"]').count()).toBe(1)
  await p.keyboard.press('ArrowUp')
  await expect(massing).toBeFocused()
  await p.keyboard.press('Enter')
  await expect(p.locator('[role="tab"][data-tool="massing"]')).toHaveAttribute('aria-selected', 'true')

  // H hides the rail; a small Show button stays at the model's edge; the choice is remembered.
  await p.keyboard.press('h')
  await expect(rail(p)).toHaveCount(0)
  const show = p.getByRole('button', { name: 'Show the tool rail (H)' })
  await expect(show).toBeVisible()
  expect(await p.evaluate(() => localStorage.getItem('ts.toolRail.hidden'))).toBe('1')
  await p.screenshot({ path: join(SHOTS, '02-tool-rail-hidden.png') })

  await p.reload()
  await p.waitForSelector('#root > *', { timeout: 60_000 })
  await expect(p.getByRole('button', { name: 'Show the tool rail (H)' })).toBeVisible({ timeout: 120_000 })
  await expect(rail(p)).toHaveCount(0)
  await p.getByRole('button', { name: 'Show the tool rail (H)' }).click()
  await expect(rail(p)).toBeVisible()
  expect(await p.evaluate(() => localStorage.getItem('ts.toolRail.hidden'))).toBe('0')
  // The rail's own Hide button, then H brings it back.
  await rail(p).getByRole('button', { name: 'Hide the tool rail (H)' }).click()
  await expect(rail(p)).toHaveCount(0)
  await p.keyboard.press('h')
  await expect(rail(p)).toBeVisible()

  // The grip (17 Nov): a drag to the right side of the model lifts a ghost, lights the right drop zone and snaps there.
  const main = p.locator('main').first()
  const grip = rail(p).getByRole('button', { name: 'Move the tool rail' })
  const railRight = async () => { const r = (await rail(p).boundingBox())!, m = (await main.boundingBox())!; return Math.round(m.x + m.width - (r.x + r.width)) }
  const railLeft = async () => { const r = (await rail(p).boundingBox())!, m = (await main.boundingBox())!; return Math.round(r.x - m.x) }
  expect(await railLeft()).toBe(0)
  const g = (await grip.boundingBox())!, m0 = (await main.boundingBox())!
  await p.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
  await p.mouse.down()
  for (let k = 1; k <= 10; k++) await p.mouse.move(g.x + ((m0.x + m0.width - 80 - g.x) * k) / 10, g.y + 6 * k)
  await expect(p.getByTestId('tool-rail-ghost')).toBeVisible()
  await expect(p.locator('[data-drop="right"][data-near]')).toBeVisible()
  await expect(p.locator('[data-drop="left"][data-near]')).toHaveCount(0)
  await p.screenshot({ path: join(SHOTS, '03-tool-rail-dragging.png') })
  await p.mouse.up()
  await expect.poll(railRight).toBe(0)
  await expect(p.getByTestId('tool-rail-ghost')).toHaveCount(0)
  await expect(p.locator('[data-drop]')).toHaveCount(0)
  expect(await p.evaluate(() => localStorage.getItem('ts.toolRail.side'))).toBe('right')
  await expect(rail(p)).toHaveAttribute('data-side', 'right')
  // On the right, the hover panel opens toward the model (to the left of the icon).
  await rail(p).locator('[data-tool="massing"]').hover()
  await expect(p.getByRole('tooltip')).toContainText('Massing')
  const tipBox = (await p.getByRole('tooltip').boundingBox())!, railBox = (await rail(p).boundingBox())!
  expect(tipBox.x + tipBox.width).toBeLessThanOrEqual(railBox.x)
  await p.mouse.move(m0.x + 200, m0.y + 300)
  await p.waitForTimeout(600)
  await p.screenshot({ path: join(SHOTS, '04-tool-rail-right.png') })
  // Hidden on the right, the Show button is on the right too.
  await p.keyboard.press('h')
  await expect(rail(p)).toHaveCount(0)
  const sb = (await p.getByRole('button', { name: 'Show the tool rail (H)' }).boundingBox())!, m1 = (await main.boundingBox())!
  expect(Math.round(m1.x + m1.width - (sb.x + sb.width))).toBe(0)
  await p.keyboard.press('h')
  await expect(rail(p)).toBeVisible()
  // A reload keeps the side.
  await p.reload()
  await p.waitForSelector('#root > *', { timeout: 60_000 })
  await expect(rail(p)).toBeVisible({ timeout: 120_000 })
  await expect.poll(railRight).toBe(0)
  // Esc during a drag puts the rail back where it was.
  const g2 = (await grip.boundingBox())!
  await p.mouse.move(g2.x + g2.width / 2, g2.y + g2.height / 2)
  await p.mouse.down()
  for (let k = 1; k <= 6; k++) await p.mouse.move(g2.x - 60 * k, g2.y + 40)
  await expect(p.getByTestId('tool-rail-ghost')).toBeVisible()
  await p.keyboard.press('Escape')
  await expect(p.getByTestId('tool-rail-ghost')).toHaveCount(0)
  await p.mouse.up()
  expect(await railRight()).toBe(0)
  expect(await p.evaluate(() => localStorage.getItem('ts.toolRail.side'))).toBe('right')
  // The keyboard: Left on the grip moves the rail back to the left side.
  await grip.focus()
  await p.keyboard.press('ArrowLeft')
  await expect.poll(railLeft).toBe(0)
  await expect(grip).toBeFocused()
  expect(await p.evaluate(() => localStorage.getItem('ts.toolRail.side'))).toBe('left')
  await expect(p.locator('[aria-live="polite"]')).toContainText('Tool rail on the left')

  // Presentation (17 Nov): the rail shows that mode's own tools and no edit modes (the model is locked); Model brings the design tools back.
  await p.getByRole('radio', { name: 'Presentation' }).click()
  await expect(rail(p)).toBeVisible()
  await expect(rail(p).locator('[data-tool="boards"]')).toBeVisible()
  await expect(rail(p).locator('[data-mode]')).toHaveCount(0)
  await p.getByRole('radio', { name: 'Model' }).click()
  await expect(rail(p).locator('[data-tool="boards"]')).toHaveCount(0)
  await expect(rail(p).locator('[data-mode="place"]')).toBeVisible()
  expect(errors).toEqual([])
})
