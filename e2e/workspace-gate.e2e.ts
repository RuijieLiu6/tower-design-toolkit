// The interface gate of the overnight brief (8 Nov), at 1440 × 900 and 1280 × 800: UI01 one phase row and Overview on
// demand; UI02 no overlap, clipping or horizontal scroll, a prominent model, Overview restoring the working state; UI03
// Inter and the type roles; UI04 a long local workflow never pushes the active tool's inputs out of reach; UI05 tool
// selection coordinating controls, results and the View, with pinned context; UI07 keyboard alternatives and targets;
// UI08 the Value result as distinct outcome / method / evidence / freshness. Entered through the landing workflow.
import { expect, test, type Page } from '@playwright/test'
import { placeStartingTower } from './helpers'

const rail = (p: Page) => p.getByRole('navigation', { name: 'Design process' })
const panel = (p: Page) => p.getByTestId('phase-panel')
const rows = (p: Page) => panel(p).locator('[data-phase-node]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.phaseNode))
const viewRadio = (p: Page, name: string) => p.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name, exact: true })
async function addTool(p: Page, id: string, search?: string) {
  if ((await p.getByTestId('phase-add').getAttribute('aria-expanded')) !== 'true') await p.getByTestId('phase-add').click()
  const list = p.getByTestId('phase-add-list')
  if (search) await list.getByPlaceholder('Search tools').fill(search)
  await list.locator(`[data-add="${id}"]`).click()
  await list.getByTestId('add-confirm-yes').click()
}

for (const vp of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
  test.describe(`${vp.width} × ${vp.height}`, () => {
    test.use({ viewport: vp })
    test('interface gate', async ({ page: p }) => {
      test.setTimeout(360_000)
      await p.addInitScript(() => { try { localStorage.setItem('ts.onboarding.seen', '1'); localStorage.setItem('ts.landing.skip', '0') } catch { /* */ } })
      await p.goto('/#/start')
      await p.getByTestId('cover-enter').click({ timeout: 120_000 })
      await rail(p).waitFor({ timeout: 120_000 })
      await p.getByRole('tab', { name: 'Competition site' }).click()

      // UI01: one permanent phase row; Overview closed on entry; no whole-workflow strip underneath
      await expect(p.getByRole('navigation', { name: 'Design process' })).toHaveCount(1)
      expect(await rail(p).locator('[data-phase]').count()).toBe(5)
      await expect(p.getByTestId('workflow-overview')).toHaveCount(0)
      await expect(p.getByTestId('workflow-dock')).toHaveCount(0)
      await expect(p.getByTestId('phase-overview')).toHaveCount(0) // Overview went on 9 Nov: Edit workflow does the same

      // UI03: Inter loads; type roles compute
      await placeStartingTower(p, { stay: true })
      const type = await p.evaluate(async () => {
        await document.fonts.ready
        const cs = (sel: string) => { const el = document.querySelector(sel); if (!el) return null; const s = getComputedStyle(el); return `${s.fontSize}/${s.lineHeight}` }
        return {
          inter: document.fonts.check('14px "Inter Variable"') && [...document.fonts].some((f) => /Inter/.test(f.family) && f.status === 'loaded'),
          family: getComputedStyle(document.body).fontFamily.split(',')[0],
          phaseTab: cs('nav[aria-label="Design process"] [data-phase]'), overview: cs('[data-testid="edit-workflow-button"]'),
          heading: cs('[data-testid="phase-panel"] h2'), importBtn: cs('[data-testid="transfer-import"]'), edit: cs('[data-testid="phase-edit"]'),
          toolName: cs('[data-testid="phase-rows"] [data-node] > span:last-child'), view: cs('[role="radiogroup"][aria-label="View"] [role="radio"]'),
          resultsTab: cs('[data-panel="right"] [role="tab"]'), autoRun: cs('[data-testid="analysis-switch"]'),
        }
      })
      expect(type.inter).toBe(true)
      expect(type.family).toMatch(/Inter Variable/)
      for (const k of ['phaseTab', 'overview', 'importBtn', 'edit', 'toolName', 'view', 'resultsTab', 'autoRun'] as const) expect(type[k], k).toBe('14px/20px')
      expect(type.heading).toBe('18px/26px')

      // UI02: no horizontal scroll, nothing clipped or overlapping in the bars and the panel header, a prominent model
      const geo = await p.evaluate(() => {
        const box = (e: Element) => e.getBoundingClientRect()
        const issues: string[] = []
        for (const sel of ['header', 'nav[aria-label="Design process"]', '[data-testid="phase-panel"] > div:first-child']) {
          const c = document.querySelector(sel)!, cr = box(c)
          const kids = [...c.querySelectorAll('button, select, [role="tab"]')].filter((e) => (e as HTMLElement).offsetParent && !(e as HTMLElement).closest('[role="menu"], [role="dialog"]'))
          for (const k of kids) { const r = box(k); if (r.right > cr.right + 0.5 || r.left < cr.left - 0.5 || r.bottom > cr.bottom + 0.5) issues.push(`clipped ${sel}: ${(k.getAttribute('aria-label') || k.textContent || '').trim().slice(0, 24)}`) }
          const top = kids.filter((k) => !kids.some((o) => o !== k && o.contains(k)))
          for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) {
            const a = box(top[i]), b = box(top[j]), w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
            if (w > 1 && h > 1) issues.push(`overlap ${sel}: ${(top[i].textContent || '').trim().slice(0, 16)} / ${(top[j].textContent || '').trim().slice(0, 16)}`)
          }
        }
        const m = box(document.querySelector('[data-model-region]')!)
        return { scrollW: document.documentElement.scrollWidth, w: innerWidth, h: innerHeight, issues, mw: m.width / innerWidth, mh: m.height / innerHeight,
          shell: getComputedStyle(document.querySelector('.workspace-shell')!).backgroundColor }
      })
      expect(geo.scrollW).toBeLessThanOrEqual(geo.w)
      expect(geo.issues).toEqual([])
      expect(geo.mw).toBeGreaterThanOrEqual(0.55)
      expect(geo.mh).toBeGreaterThanOrEqual(0.7)
      expect(geo.shell).toBe('rgb(251, 248, 243)') // UI06: the warm shell

      // UI04: a four-tool phase shows its workflow and usable controls without the page scrolling; a long one scrolls
      // inside its own region and leaves the controls in reach
      const formRows = await rows(p)
      expect(formRows.length).toBeLessThanOrEqual(4)
      await expect(panel(p).getByTestId('phase-controls')).toBeVisible()
      expect(await p.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true)
      for (const id of ['built.solar-access', 'built.wind-study', 'built.city-in-nature']) await addTool(p, id)
      await addTool(p, 'built.heights', 'height')
      await p.keyboard.press('Escape')
      if ((await p.getByTestId('phase-add').getAttribute('aria-expanded')) === 'true') await p.getByTestId('phase-add').click()
      expect((await rows(p)).length).toBeGreaterThanOrEqual(7)
      await panel(p).locator('[data-phase-node="design.massing"] [data-node]').click()
      const reach = await p.evaluate(() => {
        const region = document.querySelector('[data-testid="phase-workflow-region"]')!.getBoundingClientRect()
        const controls = document.querySelector('[data-testid="phase-controls"]')!.getBoundingClientRect()
        const firstInput = document.querySelector('[data-testid="phase-controls"] :is(input, select, button[role="tab"])')?.getBoundingClientRect()
        return { region: region.height, controls: controls.height, inputBottom: firstInput ? firstInput.bottom : 1e9, vh: innerHeight }
      })
      expect(reach.region).toBeLessThanOrEqual(230)
      expect(reach.controls).toBeGreaterThanOrEqual(180)
      expect(reach.inputBottom).toBeLessThanOrEqual(reach.vh)

      // UI05: a tool's selection sets its controls, its results and the View; pinned context is named
      await panel(p).locator('[data-phase-node="built.wind-screen"] [data-node]').click()
      await expect(viewRadio(p, 'Analysis')).toHaveAttribute('aria-checked', 'true')
      await expect(p.getByRole('radiogroup', { name: 'Quantity on the model' }).getByRole('radio', { name: /Wind risk/ })).toHaveAttribute('aria-checked', 'true')
      await expect(p.getByLabel('Show results for')).toHaveValue('built.wind-screen')
      await expect(p.getByTestId('context-pins')).toHaveAttribute('data-active', 'built.wind-screen')
      await panel(p).locator('[data-phase-node="built.solar-access"] [data-node]').click()
      await expect(p.getByRole('radiogroup', { name: 'Quantity on the model' }).getByRole('radio', { name: /Sun hours/ })).toHaveAttribute('aria-checked', 'true')
      await panel(p).locator('[data-phase-node="built.sun"] [data-node]').click()
      await expect(viewRadio(p, 'Geometry')).toHaveAttribute('aria-checked', 'true')
      await rail(p).locator('[data-phase="program"]').click()
      await addTool(p, 'built.economics')
      await expect(viewRadio(p, 'Building use')).toHaveAttribute('aria-checked', 'true')
      await expect(p.getByLabel('Show results for')).toHaveValue('built.economics')
      // UI08: Value as distinct outcome, method status, evidence and freshness; never "Doesn't work"
      const value = p.getByTestId('value-result')
      await expect(value).toBeVisible()
      await expect(value.getByTestId('value-outcome')).toContainText(/Estimated residual|Not computed/)
      await expect(value).not.toContainText("Doesn't work")
      await expect(value).toContainText('Preliminary estimate')
      await expect(value).toContainText('Unverified')
      await expect(value.getByTestId('value-freshness')).toContainText(/Computed for the current model \(revision [0-9a-f]{8}\)/)
      // pin the Analysis view on Wind, then open Value: the View stays, and the wind layer is named as pinned context
      await rail(p).locator('[data-phase="form"]').click()
      await panel(p).locator('[data-phase-node="built.wind-screen"] [data-node]').click()
      await p.getByTestId('pin-view').click()
      await rail(p).locator('[data-phase="program"]').click()
      await expect(viewRadio(p, 'Analysis')).toHaveAttribute('aria-checked', 'true')
      await expect(p.getByTestId('context-pins').locator('[data-pin="layer"]')).toContainText('Pinned context: Wind risk')
      await p.getByTestId('context-pins').getByRole('button', { name: /Hide Wind risk/ }).click()
      await expect(viewRadio(p, 'Building use')).toHaveAttribute('aria-checked', 'true')

      // UI02: the editor over the workspace, and back: the phase, the open tool and the results shown are restored
      await p.getByTestId('phase-edit').click()
      const ov = p.getByTestId('workflow-overview')
      await expect(ov.locator('[data-lane]')).toHaveCount(5)
      await ov.locator('[data-dock-node="design.massing"]').click() // selecting there opens nothing
      await p.keyboard.press('Escape') // UI07: Esc returns to the design
      await expect(ov).toHaveCount(0)
      await expect(panel(p)).toHaveAttribute('data-phase', 'program')
      await expect(panel(p).getByTestId('phase-active')).toHaveAttribute('data-active', 'built.economics')
      await expect(p.getByLabel('Show results for')).toHaveValue('built.economics')

      // UI07: keyboard alternatives: the phase row's arrow keys; reorder by the handle's arrow keys; resize by keys
      await rail(p).locator('[data-phase="program"]').focus()
      await p.keyboard.press('ArrowLeft')
      await expect(panel(p)).toHaveAttribute('data-phase', 'form')
      await p.getByTestId('phase-edit').click() // the editor (9 Nov): ← → move a focused tool, as on the landing page
      const edk = p.getByTestId('workflow-overview')
      const before = await rows(p)
      await edk.locator('[data-dock-node="built.sun"]').focus()
      await p.keyboard.press('ArrowRight')
      await expect.poll(() => rows(p)).not.toEqual(before)
      await edk.getByRole('button', { name: 'Undo the last workflow change' }).click()
      await expect.poll(() => rows(p)).toEqual(before)
      await p.keyboard.press('Escape')
      await expect(edk).toHaveCount(0)
      const w0 = (await panel(p).boundingBox())!.width
      await p.locator('[data-resizer="left"]').focus()
      await p.keyboard.press('ArrowRight')
      await expect.poll(async () => (await panel(p).boundingBox())!.width).toBeGreaterThan(w0)
      await p.keyboard.press('Enter') // back to the default width
      // targets: every control in the bars and the phase panel is at least 24 × 24 px (inline "?" helps extend theirs)
      const small = await p.evaluate(() => [...document.querySelectorAll('header button, nav[aria-label="Design process"] button, [data-testid="phase-panel"] button, [data-testid="phase-panel"] select')]
        .filter((e) => (e as HTMLElement).offsetParent && !e.hasAttribute('data-help'))
        .map((e) => { const r = e.getBoundingClientRect(); return { n: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 24), w: r.width, h: r.height } })
        .filter((r) => r.w < 24 || r.h < 24))
      expect(small).toEqual([])
      await p.screenshot({ path: `test-results/workspace-gate-${vp.width}x${vp.height}.png` })
    })
  })
}
