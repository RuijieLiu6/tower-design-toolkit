// Board names, order and formats (Ruijie, 17 Nov: "rename the canvas … export JPEG, PNG or PDF … the boards can be
// rearranged by their names"). Driven like a user: Presentation → the board composer → a board renamed on its tab
// (double-click) and in the inspector → Sort by name → a tab dragged to a new place → exported as JPEG, PNG and PDF, each
// file named after its board. No screenshots.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { placeStartingTower } from './helpers'

const composer = (p: Page) => p.getByRole('dialog', { name: 'Board composer' })
const tabNames = (p: Page) => composer(p).getByTestId('board-tab').evaluateAll((els) => els.map((e) => e.getAttribute('data-board-name')))

test('Boards: rename, sort by name, drag to reorder, export as JPEG, PNG or PDF', async ({ page: p }) => {
  test.setTimeout(420_000)
  await p.addInitScript(() => { try { localStorage.setItem('ts.landing.skip', '1'); localStorage.setItem('ts.onboarding.seen', '1'); if (!sessionStorage.getItem('e2e.boards')) { localStorage.removeItem('ts.boards'); sessionStorage.setItem('e2e.boards', '1') } } catch { /* ignore */ } })
  await p.goto('/#/guided')
  await p.waitForSelector('#root > *', { timeout: 60_000 })
  await p.getByRole('tab', { name: 'Competition site' }).or(p.getByRole('button', { name: 'Competition site' })).first().click({ timeout: 120_000 })
  await placeStartingTower(p, { stay: true })
  await p.getByRole('radiogroup', { name: 'Model or Presentation' }).getByRole('radio', { name: 'Presentation' }).click()
  const right = p.getByRole('complementary', { name: 'Present and results' })
  await right.getByRole('tab', { name: 'Present' }).click()
  await right.getByRole('button', { name: /Open the board composer/ }).evaluate((e) => (e as HTMLElement).click())
  const c = composer(p)
  await expect(c).toBeVisible()
  await expect.poll(() => tabNames(p)).toEqual(['Board 1', 'Board 2', 'Board 3', 'Board 4'])

  // Rename on the tab (double-click the name) and in the inspector.
  await c.getByTestId('board-tab').nth(0).locator('span').dblclick()
  await c.getByTestId('board-name-input').fill('3 Story')
  await c.getByTestId('board-name-input').press('Enter')
  await c.getByTestId('board-tab').nth(1).getByRole('button').click()
  await c.getByTestId('board-name').fill('1 Site strategy')
  await c.getByTestId('board-name').press('Enter')
  await c.getByTestId('board-tab').nth(2).getByRole('button').click()
  await c.getByTestId('board-name').fill('2 Plans')
  await c.getByTestId('board-name').press('Enter')
  await expect.poll(() => tabNames(p)).toEqual(['3 Story', '1 Site strategy', '2 Plans', 'Board 4'])

  // Sort by name: numbers first, unnamed after; the open board ("2 Plans") stays open.
  await c.getByTestId('boards-sort').click()
  await expect.poll(() => tabNames(p)).toEqual(['1 Site strategy', '2 Plans', '3 Story', 'Board 4'])
  await expect(c.getByTestId('board-tab').nth(1).getByRole('button')).toHaveAttribute('aria-pressed', 'true')

  // Drag the last tab to the front, then Alt+→ moves it back one place.
  await c.getByTestId('board-tab').nth(3).dragTo(c.getByTestId('board-tab').nth(0))
  await expect.poll(() => tabNames(p)).toEqual(['Board 1', '1 Site strategy', '2 Plans', '3 Story'])
  await c.getByTestId('board-tab').nth(0).getByRole('button').focus()
  await p.keyboard.press('Alt+ArrowRight')
  // An unnamed board is called by its place, so it reads Board 2 now.
  await expect.poll(() => tabNames(p)).toEqual(['1 Site strategy', 'Board 2', '2 Plans', '3 Story'])

  // A body frame with text on the first board, so it is used and can be exported.
  await c.getByTestId('board-tab').nth(0).getByRole('button').click()
  await c.getByRole('button', { name: /^Frame f1/ }).click()
  await c.getByRole('radiogroup', { name: 'Frame content' }).getByRole('radio', { name: 'Text', exact: true }).click()
  await c.locator('textarea').first().fill('The massing steps back from the street.')
  await c.getByRole('tablist', { name: 'Panel' }).getByRole('tab').nth(1).click()

  const save = async (format: 'jpeg' | 'png' | 'pdf') => {
    await c.getByTestId('export-format').locator(`[data-format="${format}"]`).click()
    const download = p.waitForEvent('download', { timeout: 120_000 })
    await c.getByRole('button', { name: format === 'pdf' ? /^Export 1 board as one PDF/ : new RegExp(`^Export 1 ${format.toUpperCase()}`) }).click()
    const d = await download
    return { name: d.suggestedFilename(), bytes: readFileSync(await d.path()) }
  }
  const jpg = await save('jpeg')
  expect(jpg.name).toBe('01-site-strategy.jpg')
  expect([...jpg.bytes.subarray(0, 2)]).toEqual([0xff, 0xd8])
  await expect(c.getByTestId('export-line').first()).toContainText('01-site-strategy.jpg', { timeout: 120_000 })
  const png = await save('png')
  expect(png.name).toBe('01-site-strategy.png')
  expect(png.bytes.subarray(1, 4).toString('latin1')).toBe('PNG')
  await expect(c.getByTestId('export-saved')).toContainText('3508 × 2480 px')
  const pdf = await save('pdf')
  expect(pdf.name).toBe('01-site-strategy.pdf')
  const text = pdf.bytes.toString('latin1')
  expect(text.startsWith('%PDF-1.4')).toBe(true)
  expect(text).toContain('/MediaBox [0 0 1683.78 1190.55]')
  expect(text).not.toMatch(/\/Author|\/Creator|\/Producer/)

  // A reload keeps the names and the order (this browser's storage).
  await p.keyboard.press('Escape')
  await p.reload()
  await p.waitForSelector('#root > *', { timeout: 60_000 })
  await expect.poll(() => p.evaluate(() => JSON.parse(localStorage.getItem('ts.boards') ?? '{}').state?.boards?.map((b: { name?: string }) => b.name ?? null)), { timeout: 30_000 })
    .toEqual(['1 Site strategy', null, '2 Plans', '3 Story'])
})
