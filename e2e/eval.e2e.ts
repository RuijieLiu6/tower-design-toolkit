// Evaluation cases through the UI (backlog item 28): cases 3, 5 and 7 drive the Real Vancouver view-cone check in the
// running app, and every case gets a screenshot of its node's panel with the evidence flags shown there. Results go to
// EVAL_OUT/ui.json for tools/run_eval.mjs; a failing case is recorded, not hidden.
import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = process.env.EVAL_OUT ?? join(process.cwd(), 'test-results', 'eval')
const SHOTS = join(OUT, 'shots')
mkdirSync(SHOTS, { recursive: true })
const STORE = join(OUT, 'ui.json')

type UiResult = { id: string; screenshot: string; flags: string[]; observed?: string; pass?: boolean; note?: string }
function record(r: UiResult) {
  const all: Record<string, UiResult> = existsSync(STORE) ? JSON.parse(readFileSync(STORE, 'utf8')) : {}
  all[r.id] = r
  writeFileSync(STORE, JSON.stringify(all, null, 1))
}

const CITY_ORIGIN = [491300, 5458600]

async function open(p: Page, project: 'vtc' | 'city', stage: '1' | '2' = '1') {
  await p.addInitScript(() => { performance.setResourceTimingBufferSize(10_000); try { localStorage.setItem('ts.landing.skip', '0') } catch { /* ignore */ } })
  await p.goto('/#/guided')
  await p.waitForSelector('#root > *', { timeout: 30_000 })
  await p.getByRole('button', { name: 'Start designing' }).click({ timeout: 5000 }).catch(() => {})
  const label = project === 'city' ? 'Real Vancouver' : 'Competition site'
  await p.getByRole('tab', { name: label }).or(p.getByRole('button', { name: label })).first().click()
  await p.waitForTimeout(project === 'city' ? 3000 : 1200)
  if (stage !== '1') { await p.keyboard.press(stage); await p.waitForTimeout(1500) }
}

/** The onboarding dialog can come back after a project switch: close it so it doesn't block clicks. */
async function dismiss(p: Page) {
  const dlg = p.locator('[aria-labelledby="ob-title"]')
  if (await dlg.count()) {
    await p.getByRole('button', { name: 'Start designing' }).click({ timeout: 3000 }).catch(async () => { await p.keyboard.press('Escape') })
    await p.waitForTimeout(300)
  }
}

/** Selects a node in the library (switching it on if needed) and shows its results tab. */
async function node(p: Page, name: string) {
  await dismiss(p)
  const row = p.locator('aside').getByText(name, { exact: true }).first()
  await row.click()
  const sw = p.getByRole('switch', { name: `Use ${name}` })
  if (await sw.count() && (await sw.getAttribute('aria-checked')) === 'false') await sw.click()
  await p.getByRole('tab', { name: /Results/ }).click().catch(() => {})
  await p.waitForTimeout(1200)
}

/**
 * Moves the selected tower through the app's own store (the same instance the UI uses), lets the base follow the
 * terrain there (the default since 27 Oct), then sets the height so the top lands on the case's geodetic elevation.
 */
async function placeTower(p: Page, utm: [number, number], top: number) {
  await p.evaluate(async ({ x, y }) => {
    const url = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\/src\/store\.ts/.test(n)).pop()!
    const { useStore } = await import(/* @vite-ignore */ url)
    const s = useStore.getState()
    const t = s.towers[s.project][0]
    s.selectTower(t.id)
    s.updateTower(t.id, { x, y, podiumHeight: 0 })
  }, { x: utm[0] - CITY_ORIGIN[0], y: utm[1] - CITY_ORIGIN[1] })
  await p.waitForTimeout(600)
  await p.evaluate(async ({ top }) => {
    const url = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\/src\/store\.ts/.test(n)).pop()!
    const { useStore } = await import(/* @vite-ignore */ url)
    const s = useStore.getState()
    const t = s.towers[s.project][0]
    s.updateTower(t.id, { height: top - s.groundElevation })
  }, { top })
  await p.waitForTimeout(800)
}

async function panelText(p: Page) { return (await p.locator('aside[aria-label="Design and results"]').innerText()).replace(/\s+/g, ' ') }
async function flags(p: Page) {
  return [...new Set(await p.locator('aside[aria-label="Design and results"]').locator('span[title]').filter({ hasText: /Verified|Team assumption|Unverified|Unresolved|False assumption/ }).allInnerTexts())].map((s) => s.trim()).filter(Boolean)
}
async function shot(p: Page, id: string) {
  const file = join(SHOTS, `${id}.png`)
  await p.screenshot({ path: file })
  return `shots/${id}.png`
}

// Real Vancouver now draws about 14,000 measured building parts (LiDAR 2022 core + City 2009 ring, 27 Oct). In software
// WebGL (SwiftShader) one frame takes seconds and a screenshot can take over a minute, so the 90 s default is too short.
// The checks themselves are unchanged.
test.describe.configure({ mode: 'serial', timeout: 300_000 })

test('C3 · out of scope: inside 3.2.2 only, the UI stops', async ({ page }) => {
  await open(page, 'city'); await node(page, 'View-cone height check')
  const seen: string[] = []
  for (const top of [50, 150, 400]) { await placeTower(page, [491272.2, 5458589.7], top); seen.push(await panelText(page)) }
  const ok = seen.every((t) => /3\.2\.2/.test(t) && /In cone: no estimate/i.test(t))
  record({ id: 'C3', screenshot: await shot(page, 'C3'), flags: await flags(page), observed: ok ? '3.2.2 · In cone: no estimate at 50, 150 and 400 m' : 'expected text not shown', pass: ok })
  expect(ok).toBe(true)
})

test('C5 · boundary: 3.2.3 at its limit reads within uncertainty', async ({ page }) => {
  await open(page, 'city'); await node(page, 'View-cone height check')
  await placeTower(page, [491636.1, 5458755.9], 126.37)
  const t = await panelText(page)
  const ok = /3\.2\.3/.test(t) && /Within uncertainty/i.test(t) && /126\.4/.test(t)
  record({ id: 'C5', screenshot: await shot(page, 'C5'), flags: await flags(page), observed: (t.match(/3\.2\.3[^.]{0,120}/)?.[0] ?? '').slice(0, 140), pass: ok })
  expect(ok).toBe(true)
})

test('C7 · repeated: the same result five times', async ({ page }) => {
  // Five fresh loads of the Real Vancouver scene in software WebGL take about 88 s since the terrain upgrade (22 Oct):
  // the 90 s default left no room for the screenshot. The check itself is unchanged.
  test.setTimeout(900_000)
  const runs: string[] = []
  for (let i = 0; i < 5; i++) {
    await open(page, 'city'); await node(page, 'View-cone height check')
    await placeTower(page, [491636.1, 5458755.9], 130)
    runs.push((await panelText(page)).match(/RESULTS[\s\S]{0,400}/i)?.[0] ?? '')
  }
  const ok = new Set(runs).size === 1 && runs[0].length > 0
  record({ id: 'C7', screenshot: await shot(page, 'C7'), flags: await flags(page), observed: `${new Set(runs).size} distinct panel text(s) over 5 fresh loads`, pass: ok })
  expect(ok).toBe(true)
})

// Evidence screenshots for the node cases: the panel each case belongs to, with the flags it shows.
const EVIDENCE: { ids: string[]; project: 'vtc' | 'city'; stage: '1' | '2'; name: string }[] = [
  { ids: ['C1', 'C2', 'C4', 'C6'], project: 'city', stage: '1', name: 'View-cone height check' },
  { ids: ['LIFT-T', 'LIFT-O'], project: 'vtc', stage: '2', name: 'Core & lift check' },
  { ids: ['PR-T', 'PR-O'], project: 'vtc', stage: '1', name: 'Streetwall & tower form' },
  { ids: ['SUN-T', 'SUN-O'], project: 'vtc', stage: '1', name: 'Solar access & sun hours' },
  { ids: ['STR-T', 'STR-O'], project: 'vtc', stage: '2', name: 'Wind procedure (slenderness)' },
  { ids: ['EN-T', 'EN-O'], project: 'vtc', stage: '2', name: 'Energy & carbon' },
  { ids: ['MOB-T', 'MOB-O'], project: 'vtc', stage: '2', name: 'Parking, loading & bikes' },
  { ids: ['VIEW-T', 'VIEW-O'], project: 'city', stage: '1', name: 'View from here' },
  { ids: ['VISTA-T', 'VISTA-K', 'VISTA-F', 'VISTA-H', 'VISTA-B', 'VISTA-O', 'ENV-T', 'ENV-V', 'ENV-F', 'ENV-O', 'SITE-T', 'SITE-O', 'GEO-T', 'GEO-O', 'ADDR-T', 'ADDR-O'], project: 'city', stage: '1', name: 'Vista view studies' },
  { ids: ['RHINO-B', 'RHINO-O', 'RHINO-R', 'RHINO-N', 'RHINO-K', 'RHINO-A'], project: 'vtc', stage: '1', name: 'Your model: upload & provenance' },
]

for (const e of EVIDENCE) {
  test(`evidence · ${e.name}`, async ({ page }) => {
    await open(page, e.project, e.stage)
    await node(page, e.name)
    const file = await shot(page, e.ids[0])
    const f = await flags(page)
    const text = await panelText(page)
    for (const id of e.ids) record({ id, screenshot: file, flags: f, note: `${e.name} panel, default design (${e.project === 'city' ? 'Real Vancouver' : 'Competition site'})` })
    expect(text.length).toBeGreaterThan(50)
  })
}

// Rhino upload (3 Nov 2026): the typical fixture dropped on the app, mapped, checked and used through the dialog, then the
// "Your model" panel. The fixture is synthetic (tools/make_import_fixtures.mjs); it is written first if missing.
test('RHINO-T · upload a Rhino file through the dialog', async ({ page }) => {
  test.setTimeout(300_000)
  const fixture = join(process.cwd(), 'tools', 'import-fixtures', 'typical-two-towers-mm.3dm')
  if (!existsSync(fixture)) execFileSync(process.execPath, ['tools/make_import_fixtures.mjs'], { cwd: process.cwd() })
  const bytes = [...readFileSync(fixture)]
  await open(page, 'vtc', '1')
  await dismiss(page)
  await page.evaluate((b) => {
    const dt = new DataTransfer()
    dt.items.add(new File([new Uint8Array(b)], 'typical-two-towers-mm.3dm'))
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt }))
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }))
  }, bytes)
  await page.getByRole('combobox', { name: 'Role for Core' }).waitFor({ timeout: 120_000 })
  await shot(page, 'RHINO-T-map')
  await page.getByRole('button', { name: /Check units, north and datum/ }).click()
  await page.getByText('In plain words').waitFor({ timeout: 120_000 })
  await shot(page, 'RHINO-T-check')
  const checks = (await page.locator('[role="dialog"]').innerText()).replace(/\s+/g, ' ')
  await page.getByRole('button', { name: /Use this model/ }).click()
  await node(page, 'Your model: upload & provenance')
  const file = await shot(page, 'RHINO-T')
  const text = await panelText(page)
  const pass = /2 towers, found by plan overlap/.test(checks) && /Site boundary: 1 outline, 11,468 m²/.test(checks) && /typical-two-towers-mm\.3dm/.test(text) && /Lot line 11,468 m²/.test(text)
  record({ id: 'RHINO-T', screenshot: file, flags: await flags(page), observed: pass ? 'Dropped, mapped, checked and used in the app; panel shows 2 towers, the lot line and the provenance list' : text.slice(0, 300), pass, note: 'Uploaded through the dialog (drop on the app, map, check, use); screenshots RHINO-T-map and RHINO-T-check show the two steps' })
  expect(pass).toBe(true)
})
