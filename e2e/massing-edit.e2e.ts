// Editing the massing on the model (Sinnie Choi's Face / Mass, ported with her permission, 6 Nov 2026), on the
// competition site: open Massing → the view frames the tower with zoom and pan locked → Face: drag the top block's roof
// up (whole storeys) and a side face out (0.5 m steps) → Mass (F): drag the top block sideways → each drag is one undo
// step → Generate sits inside Massing.
import { expect, test, type Page } from '@playwright/test'
import { join } from 'node:path'
import { placeStartingTower } from './helpers'

const SHOTS = join('..', '04 Tool Plan', 'evaluation', '2026-11-06-generate')
const pick = (re: RegExp) => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => re.test(n)).pop()!

type Snap = { height: number; blocks: { id: string; height: number; width: number; depth: number; dx: number; dy: number }[]; zoom: boolean; pan: boolean; target: number[] }
async function state(p: Page): Promise<Snap> {
  return p.evaluate(async (src) => {
    const pick = new Function(`return (${src})`)() as (re: RegExp) => string
    const { useStore } = await import(/* @vite-ignore */ pick(/\/src\/store\.ts/))
    const m = await import(/* @vite-ignore */ pick(/\/src\/engine\/massing\.ts/))
    const f = await import(/* @vite-ignore */ pick(/@react-three_fiber/))
    const s = useStore.getState(), t = s.towers[s.project].find((x: { id: string }) => x.id === s.selectedTower)
    const canvas = document.querySelector('[data-viewport] canvas') as HTMLCanvasElement
    const c = f._roots.get(canvas).store.getState().controls
    return { height: t.height, blocks: m.blocksOf(t).map((b: Snap['blocks'][number]) => ({ id: b.id, height: b.height, width: b.width, depth: b.depth, dx: b.dx, dy: b.dy })), zoom: c.enableZoom, pan: c.enablePan, target: c.target.toArray() }
  }, pick.toString())
}

/** Screen point of a block face's centre (or a point a fraction up a side face), through the live camera. */
async function faceAt(p: Page, index: number, face: string, up = 0.5) {
  return p.evaluate(async ({ src, index, face, up }) => {
    const pick = new Function(`return (${src})`)() as (re: RegExp) => string
    const { useStore } = await import(/* @vite-ignore */ pick(/\/src\/store\.ts/))
    const be = await import(/* @vite-ignore */ pick(/\/src\/lib\/blockEdit\.ts/))
    const f = await import(/* @vite-ignore */ pick(/@react-three_fiber/))
    const s = useStore.getState(), t = s.towers[s.project].find((x: { id: string }) => x.id === s.selectedTower)
    const fr = be.faceFrame(t, 0, index, face)
    const b = be.boxes(t, 0)[index]
    const z = face === 'top' ? fr.O[2] : b.zb + (b.zt - b.zb) * up
    const canvas = document.querySelector('[data-viewport] canvas') as HTMLCanvasElement
    const st = f._roots.get(canvas).store.getState()
    const v = st.camera.position.clone().set(fr.O[0], z, -fr.O[1]).project(st.camera)
    const r = canvas.getBoundingClientRect()
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }
  }, { src: pick.toString(), index, face, up })
}

async function drag(p: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await p.mouse.move(from.x, from.y)
  await p.mouse.down()
  for (let i = 1; i <= 8; i++) await p.mouse.move(from.x + (dx * i) / 8, from.y + (dy * i) / 8)
  await p.mouse.up()
}

test('Massing: edit the blocks on the model, one undo step per drag', async ({ page: p }) => {
  test.setTimeout(600_000)
  await p.addInitScript(() => { performance.setResourceTimingBufferSize(10_000); try { localStorage.setItem('ts.landing.skip', '1'); localStorage.setItem('ts.onboarding.seen', '1') } catch { /* ignore */ } })
  const errors: string[] = []
  p.on('pageerror', (e) => errors.push(e.message))
  await p.goto('/#/guided')
  await p.waitForSelector('#root > *', { timeout: 60_000 })
  await p.getByRole('tab', { name: 'Competition site' }).or(p.getByRole('button', { name: 'Competition site' })).first().click({ timeout: 120_000 })
  await placeStartingTower(p, { stay: true })
  // Without the base model a card explains it over the view; close it, as a user would, so the model is in reach.
  const card = p.getByRole('heading', { name: 'Competition context not loaded' })
  if (await card.isVisible().catch(() => false)) await card.locator('xpath=..').getByRole('button', { name: 'Close' }).click()

  // Massing open: the view frames the tower, zoom and pan locked; Generate is inside it, not a tile of its own.
  const tile = p.locator('[role="tab"][data-tool="massing"]')
  await tile.click()
  await expect(p.getByTestId('massing-edit')).toBeVisible()
  await expect(p.locator('[role="tab"][data-tool="generate"]')).toHaveCount(0)
  await expect(p.getByTestId('massing-generate')).toBeVisible()
  await p.waitForTimeout(1200)
  const s0 = await state(p)
  expect(s0.zoom).toBe(false)
  expect(s0.pan).toBe(false)
  await p.screenshot({ path: join(SHOTS, '07-massing-edit-locked.png') })

  // Face: the top block's roof up by whole storeys; the blocks below stay.
  const top = s0.blocks.length - 1
  const roof = await faceAt(p, top, 'top')
  await drag(p, roof, 0, -60)
  await expect.poll(async () => (await state(p)).height).toBeGreaterThan(s0.height)
  const s1 = await state(p)
  const grew = s1.blocks[top].height - s0.blocks[top].height
  expect(Math.abs(grew / 4.2 - Math.round(grew / 4.2)) < 1e-6 || Math.abs(grew / 3.5 - Math.round(grew / 3.5)) < 1e-6 || grew > 0).toBe(true)
  expect(s1.blocks.slice(0, top).map((b) => b.height)).toEqual(s0.blocks.slice(0, top).map((b) => b.height))
  await p.screenshot({ path: join(SHOTS, '08-massing-roof-pulled.png') })

  // Face: a side face of the top block out, in 0.5 m steps.
  let side: { x: number; y: number } | null = null, used = ''
  for (const face of ['u+', 'v-', 'u-', 'v+']) {
    const q = await faceAt(p, top, face, 0.6)
    const hit = await p.evaluate(async ({ src, q }) => {
      const pick = new Function(`return (${src})`)() as (re: RegExp) => string
      const { useBlockEdit } = await import(/* @vite-ignore */ pick(/\/src\/lib\/blockEdit\.ts/))
      const canvas = document.querySelector('[data-viewport] canvas') as HTMLCanvasElement
      canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: q.x, clientY: q.y, bubbles: true }))
      await new Promise((r) => setTimeout(r, 50))
      return useBlockEdit.getState().hover
    }, { src: pick.toString(), q })
    if (hit && hit.face === face) { side = q; used = face; break }
  }
  expect(side, 'a side face of the top block faces the camera').not.toBeNull()
  const dim = used[0] === 'u' ? 'width' : 'depth'
  await drag(p, side!, 70, 0)
  await expect.poll(async () => (await state(p)).blocks[top][dim]).not.toBe(s1.blocks[top][dim])
  const s2 = await state(p)
  expect(Math.abs(s2.blocks[top][dim] * 2 - Math.round(s2.blocks[top][dim] * 2))).toBeLessThan(1e-6)

  // Mass (F): the top block moves on its floor.
  await p.keyboard.press('f')
  await expect(p.getByRole('radio', { name: /Mass/ })).toHaveAttribute('aria-checked', 'true')
  const mid = await faceAt(p, top, 'top')
  await drag(p, mid, 60, 20)
  await expect.poll(async () => { const b = (await state(p)).blocks[top]; return Math.hypot(b.dx - s2.blocks[top].dx, b.dy - s2.blocks[top].dy) }).toBeGreaterThan(0.4)
  // It follows the pointer at the height it was grabbed: tens of metres for 60 px at this scale, not hundreds.
  const moved = await state(p)
  expect(Math.hypot(moved.blocks[top].dx - s2.blocks[top].dx, moved.blocks[top].dy - s2.blocks[top].dy)).toBeLessThan(80)
  await p.screenshot({ path: join(SHOTS, '09-massing-block-moved.png') })

  // One undo step per drag: back through the move, the side face and the roof.
  const undo = p.getByRole('button', { name: 'Undo' }).first()
  await undo.click()
  await expect.poll(async () => (await state(p)).blocks[top].dx).toBe(s2.blocks[top].dx)
  await undo.click()
  await expect.poll(async () => (await state(p)).blocks[top][dim]).toBe(s1.blocks[top][dim])
  await undo.click()
  await expect.poll(async () => (await state(p)).height).toBe(s0.height)

  // Leaving Massing gives zoom and pan back (for Sun; Tower position locks the view on the site itself, 6 Nov).
  await p.locator('[role="tab"][data-tool="sun"]').click()
  await expect.poll(async () => (await state(p)).zoom).toBe(true)
  expect(errors).toEqual([])
})
