import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { contrast } from './buildingUse'
import { MODEL } from './design/tokens'
import { CHROME, MAP_MODES, MODE_HINT, VISTA, VISTA_LIGHT, VISTA_LOOK, VISTA_OVERVIEW, shadowCapturingLights, vistaShaded } from './vistaLook'

describe("Vista's Plain look for Real Vancouver", () => {
  it('keeps the shadow of the sun preview: three’s lighting chunk still has the line the shader rewrites', () => {
    const lights = shadowCapturingLights()
    expect(lights).not.toBeNull()
    expect(lights).toContain('vistaShadow = min( vistaShadow, vistaShadowNow );')
    expect(lights).not.toContain('directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap')
    expect(shadowCapturingLights('no lights here')).toBeNull()
  })

  it('patches a standard material for each surface without tone mapping', () => {
    for (const s of ['buildings', 'terrain', 'water'] as const) {
      const m = vistaShaded(new THREE.MeshStandardMaterial(), s)
      expect(m.toneMapped).toBe(false)
      expect(m.customProgramCacheKey()).toMatch(new RegExp(`vista-plain-\\d-1`))
      const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader } as unknown as THREE.WebGLProgramParametersWithUniforms
      m.onBeforeCompile(shader, {} as THREE.WebGLRenderer)
      expect(shader.fragmentShader).toContain('outgoingLight = vToLinear(c);')
      expect(shader.fragmentShader).not.toContain('#include <fog_fragment>')
      expect(shader.vertexShader).toContain('vVistaWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    }
  })

  it('keeps Vista’s Plain palette on record and light, on the design system’s neutral model (7 Nov)', () => {
    expect([VISTA.terrain, VISTA.water, VISTA.parks, VISTA.buildings]).toEqual(['#dedbce', '#b7c9c9', '#8c9c83', '#fafbf8'])
    // The scene itself is the neutral model (MODEL tokens); Vista's water and parks stay as map information.
    expect([VISTA_LOOK.background, VISTA_LOOK.ground, VISTA_LOOK.context]).toEqual([MODEL.background, MODEL.ground, MODEL.context])
    expect([VISTA_LOOK.water, VISTA_LOOK.park]).toEqual([VISTA.water, VISTA.parks])
    expect(VISTA_LIGHT.length()).toBeCloseTo(1, 6)
    expect(VISTA_LIGHT.z).toBeGreaterThan(0.8)
    // Vista's overview (yaw 0.018, pitch 0.682, 9,710 m) looks west at 39 degrees down from the east.
    const [ex, ey, ez] = VISTA_OVERVIEW.position, [tx, ty, tz] = VISTA_OVERVIEW.target
    const d = Math.hypot(ex - tx, ey - ty, ez - tz)
    expect(d).toBeGreaterThan(9600); expect(d).toBeLessThan(9800)
    expect(Math.asin((ez - tz) / d)).toBeCloseTo(0.682, 2)
    expect(ex - tx).toBeGreaterThan(7000)
  })

  it('maps the five Vista modes, each with its caption, and its chrome text passes WCAG AA', () => {
    expect(MAP_MODES.map((m) => m.label)).toEqual(['City', 'Observer', 'Inspect', 'Plan', 'Viewcone'])
    for (const m of MAP_MODES) expect(MODE_HINT[m.id]).toMatch(new RegExp(`^${m.label}`))
    const paper = '#faf8f1' // the chrome boxes (93% over the view)
    expect(contrast(CHROME.ink, paper)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(CHROME.tabInk, paper)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(CHROME.activeInk, CHROME.active)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(CHROME.labelInk, paper)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(CHROME.labelExtInk, paper)).toBeGreaterThanOrEqual(4.5)
  })

  it('places Vista’s 34 labels in the Toolkit frame, inside the model base', () => {
    const j = JSON.parse(readFileSync(new URL('../../public/data/vista_labels.json', import.meta.url), 'utf8')) as { labels: { text: string; x: number; y: number }[] }
    expect(j.labels.length).toBe(34)
    const downtown = j.labels.find((l) => l.text === 'Downtown')!
    // Vista's Downtown anchor (123, -77 in its frame) sits about 280 m north-west of the Toolkit origin's offset.
    expect(Math.hypot(downtown.x - 47, downtown.y - 206)).toBeLessThan(120)
    for (const l of j.labels) { expect(Math.abs(l.x)).toBeLessThan(9000); expect(Math.abs(l.y)).toBeLessThan(9000) }
  })
})

describe('Plan scale and the view-cone switches', () => {
  it('opens Plan north up over the proposed tower, PLAN_WIDTH_M (1 km) across whatever the aspect', async () => {
    const { planCamera, PLAN_FOV, PLAN_WIDTH_M } = await import('./vistaLook')
    for (const aspect of [1.0, 1.34, 1.8]) {
      const c = planCamera([100, 200, 30], aspect)
      const h = c.position[2] - c.target[2]
      const width = 2 * h * Math.tan(((PLAN_FOV / 2) * Math.PI) / 180) * aspect
      expect(width).toBeCloseTo(PLAN_WIDTH_M, 0)
      expect(c.position[0]).toBe(100); expect(c.position[1]).toBeLessThan(200); expect(200 - c.position[1]).toBeLessThan(0.1)
    }
  })

  it('shows, hides and isolates cones in one store, and picks the controlling cone from the check', async () => {
    const { useConeVisibility, showAllCones, showOnlyCones, toggleCone, controllingCone, shownSummary, conesOverSite } = await import('./coneVisibility')
    const { PLAN_WIDTH_M } = await import('./vistaLook')
    expect(PLAN_WIDTH_M).toBe(1000)
    const { CONES } = await import('../engine/viewCones')
    // Cones start hidden (Ruijie, 9 Nov: a quiet Site view; the Viewcone toggle or a view tool shows them).
    expect(shownSummary(useConeVisibility.getState().hidden)).toBe('all hidden')
    showAllCones(false); expect(shownSummary(useConeVisibility.getState().hidden)).toBe('all hidden')
    showAllCones(true); expect(shownSummary(useConeVisibility.getState().hidden)).toBe(`all ${CONES.length} shown`)
    showOnlyCones(['3.2.3', 'E']); expect(shownSummary(useConeVisibility.getState().hidden)).toBe(`2 of ${CONES.length} shown`)
    toggleCone('E'); expect(useConeVisibility.getState().hidden.E).toBe(true)
    showAllCones(true)
    const cone = (id: string) => CONES.find((c) => c.id === id)!
    const checks = [
      { cone: cone('E'), state: 'outside' as const, limit: 50, exceed: null },
      { cone: cone('3.2.4'), state: 'above' as const, limit: 140, exceed: 10 },
      { cone: cone('3.2.3'), state: 'above' as const, limit: 126.4, exceed: 26.4 },
      { cone: cone('A'), state: 'limit_unknown' as const, limit: null, exceed: null },
    ]
    expect(controllingCone(checks)).toBe('3.2.3')
    expect(controllingCone([checks[3]])).toBe('A')
    expect(controllingCone([checks[0]])).toBeNull()
    expect(conesOverSite(checks)).toEqual(['3.2.4', '3.2.3', 'A'])
  })
})
