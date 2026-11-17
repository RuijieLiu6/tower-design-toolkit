// Board fonts (Ruijie, 17 Nov: "an option to change the font, and users can also download and upload the font type
// they want"). Driven like a user: Presentation → the board composer → a built-in face for the headings (the picker
// draws every name in its face, the choice persists) → a font file of their own added (a small OFL WOFF fixture; a text
// file is refused in plain words) and picked → a board exported, its JPEG drawn with that font loaded → a reload keeps
// the font under Your fonts. Screenshots go to docs/evaluation/2026-11-17-board-fonts/.
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { placeStartingTower } from './helpers'

const SHOTS = join(process.cwd(), 'docs', 'evaluation', '2026-11-17-board-fonts')
mkdirSync(SHOTS, { recursive: true })
const FIXTURE = join(process.cwd(), 'e2e', 'fixtures', 'space-grotesk-latin-400.woff')
const NOT_A_FONT = join(process.cwd(), 'e2e', 'fixtures', 'space-grotesk-LICENSE.txt')

const composer = (p: Page) => p.getByRole('dialog', { name: 'Board composer' })
const fontLoaded = (p: Page, family: string) => p.evaluate((f) => document.fonts.check(`12px "${f}"`), family)
const savedFonts = (p: Page) => p.evaluate(() => { try { return JSON.parse(localStorage.getItem('ts.boards') ?? '{}').state?.fonts ?? null } catch { return null } })

async function openComposer(p: Page) {
  await p.getByRole('radiogroup', { name: 'Model or Presentation' }).getByRole('radio', { name: 'Presentation' }).click()
  const right = p.getByRole('complementary', { name: 'Present and results' })
  await right.getByRole('tab', { name: 'Present' }).click()
  // The door sits low in the Present tab's scroll region; a DOM click opens it without waiting on the scroll.
  await right.getByRole('button', { name: /Open the board composer/ }).evaluate((e) => (e as HTMLElement).click())
  await expect(composer(p)).toBeVisible()
}

test('Board fonts: a built-in face, your own font file, the export drawn with it, kept after a reload', async ({ page: p }) => {
  test.setTimeout(420_000)
  await p.addInitScript(() => { try { localStorage.setItem('ts.landing.skip', '1'); localStorage.setItem('ts.onboarding.seen', '1') } catch { /* ignore */ } })
  const errors: string[] = []
  p.on('pageerror', (e) => errors.push(e.message))
  await p.goto('/#/guided')
  await p.waitForSelector('#root > *', { timeout: 60_000 })
  await p.getByRole('tab', { name: 'Competition site' }).or(p.getByRole('button', { name: 'Competition site' })).first().click({ timeout: 120_000 })
  await placeStartingTower(p, { stay: true })
  await openComposer(p)
  const c = composer(p)

  // The Type panel: a heading and a text face for the board; the built-in faces load with the composer.
  await expect(c.getByTestId('font-panel')).toBeVisible()
  await expect.poll(() => fontLoaded(p, 'Lora'), { timeout: 30_000 }).toBe(true)
  await c.locator('[data-font-pick="heading"]').click()
  const list = c.getByRole('listbox', { name: 'Headings' })
  await expect(list).toBeVisible()
  // Every name is drawn in its own face.
  expect(await list.locator('[data-font-option="Lora"] span').first().evaluate((e) => getComputedStyle(e).fontFamily)).toMatch(/^"?Lora"?/)
  await list.locator('[data-font-option="Lora"]').click()
  await expect(c.locator('[data-font-pick="heading"]')).toContainText('Lora')
  await expect.poll(() => savedFonts(p)).toMatchObject({ heading: 'Lora', body: 'Inter Variable' })

  // A title and a text frame, so the board is used and the faces show.
  await c.getByRole('button', { name: /^Frame f0/ }).click()
  await c.getByRole('textbox').first().fill('A tower on the high street')
  await c.getByRole('button', { name: /^Frame f1/ }).click()
  await c.getByRole('radiogroup', { name: 'Frame content' }).getByRole('radio', { name: 'Text', exact: true }).click()
  await c.getByRole('textbox').first().fill('The massing steps back from the street, with a public sky room at the top of the podium.')

  // A text file is refused in plain words; a font file is read, named from its own name table and listed under Your fonts.
  await c.getByTestId('font-file').setInputFiles(NOT_A_FONT)
  await expect(c.getByTestId('font-msg')).toContainText('not a font file')
  await c.getByTestId('font-file').setInputFiles(FIXTURE)
  await expect(c.getByTestId('font-msg')).toContainText('Space Grotesk added')
  await expect(c.locator('[data-user-font="Space Grotesk"]')).toBeVisible()
  await expect.poll(() => fontLoaded(p, 'Space Grotesk'), { timeout: 30_000 }).toBe(true)
  await c.locator('[data-font-pick="heading"]').click()
  await c.getByRole('listbox', { name: 'Headings' }).locator('[data-font-option="Space Grotesk"]').click()
  await expect(c.locator('[data-font-pick="heading"]')).toContainText('Space Grotesk')
  await expect(c.getByTestId('font-missing')).toHaveCount(0)
  // The frame's own face: this frame in the mono face, the rest of the board unchanged.
  await c.locator('[data-font-pick="frame-f1"]').click()
  await c.getByRole('listbox', { name: 'Font for this frame' }).locator('[data-font-option="IBM Plex Mono"]').click()
  await expect(c.locator('[data-font-pick="frame-f1"]')).toContainText('IBM Plex Mono')
  await p.waitForTimeout(800)
  await p.screenshot({ path: join(SHOTS, '01-board-fonts.png') })

  // Export: the JPEG is drawn with those faces loaded, and the export line says which.
  await c.getByRole('tablist', { name: 'Panel' }).getByRole('tab').nth(1).click()
  const download = p.waitForEvent('download', { timeout: 120_000 })
  await c.getByRole('button', { name: /^Export \d JPEG/ }).click()
  expect((await download).suggestedFilename()).toBe('board-1.jpg')
  const line = c.getByTestId('export-line').first()
  await expect(line).toBeVisible({ timeout: 120_000 })
  await expect(line).toHaveAttribute('data-export-fonts', /Space Grotesk/)
  await expect(line).toHaveAttribute('data-export-fonts', /IBM Plex Mono/)
  expect(await fontLoaded(p, 'Space Grotesk')).toBe(true)
  await p.screenshot({ path: join(SHOTS, '02-board-fonts-exported.png') })

  // A reload keeps the font in this browser and the board's choice; nothing is missing.
  await p.keyboard.press('Escape')
  await p.reload()
  await p.waitForSelector('#root > *', { timeout: 60_000 })
  await expect(p.getByTestId('mode-switch')).toBeVisible({ timeout: 120_000 })
  await openComposer(p)
  await expect(composer(p).locator('[data-user-font="Space Grotesk"]')).toBeVisible({ timeout: 30_000 })
  await expect(composer(p).locator('[data-font-pick="heading"]')).toContainText('Space Grotesk')
  await expect(composer(p).getByTestId('font-missing')).toHaveCount(0)
  await expect.poll(() => fontLoaded(p, 'Space Grotesk'), { timeout: 30_000 }).toBe(true)
  // Removing it: the board says the face is missing and draws Inter instead.
  await composer(p).getByRole('button', { name: 'Remove Space Grotesk' }).click()
  await expect(composer(p).locator('[data-user-font="Space Grotesk"]')).toHaveCount(0)
  await expect(composer(p).getByTestId('font-missing')).toContainText('Space Grotesk')
  expect(errors).toEqual([])
})
