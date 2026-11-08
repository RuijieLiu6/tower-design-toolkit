// Vista's Plain look for Real Vancouver (Ruijie, 3 Nov: "Make the model viewport page looks exactly like this as the one
// shown in vista", City overview, style=collage). Colours, shading, fog, chrome tokens and the overview camera come from
// Vista's explorer @ 917b28e, read only: explorer.js (COLLAGE_COLORS, setSceneStyle, the uSceneStyle 2 branch of the main
// fragment shader, computeCamera), explorer.css (body[data-scene-style="collage"]) and the live page's computed styles.
// Ported, not copied: the shading below is rewritten for three.js materials.
import * as THREE from 'three'
import { create } from 'zustand'
import { LOOKS, type Look } from '../data/stages'
import { MODEL } from './design/tokens'

/** Vista's Plain ("collage") palette, sRGB. */
export const VISTA = {
  background: '#f3f2ec', terrain: '#dedbce', parks: '#8c9c83', water: '#b7c9c9', buildings: '#fafbf8', roads: '#aaa899',
  shoreline: '#8a9f9d', extent: '#94978d', proposal: '#ce9581', observer: '#476f83', wedge: '#91b0bc', cone: '#726a87',
  plane: '#926574', studyBoundary: '#526e5b', backdrop: '#b8bcb0',
} as const

/**
 * The haze far context fades into: the model background (MODEL.background #f2f4f7 as linear 0-1 sRGB), so the horizon
 * meets the sky without a warm band. Vista's own was vec3(0.96, 0.96, 0.93).
 */
export const VISTA_FOG = [0.949, 0.957, 0.969] as const

/**
 * Real Vancouver's clay look: Vista's flat shading and water and parks, on the design system's neutral model (MODEL:
 * background, terrain as the ground, buildings one grey step below the proposal), so both projects read as one product.
 */
export const VISTA_LOOK: Look = {
  ...LOOKS.clay,
  background: MODEL.background, ground: MODEL.ground, water: VISTA.water, park: VISTA.parks, context: MODEL.context,
  shore: VISTA.shoreline, plinth: '#d3d9e0', plinthEdge: MODEL.edge, older: '#bcc3cc', edge: '#aab3bf', hemi: 0.9,
}

// The electric-blue proposed tower of 3 Nov (PROPOSED, proposedLook) gave way to the design system's display modes
// (7 Nov, lib/displayMode.ts): the proposal is picked out by form, edges and contrast, and the selection by an outline.

/** Chrome tokens: computed styles of Vista's live City overview (3 Nov), Plain style. */
export const CHROME = {
  box: 'rgba(250,248,241,0.93)', border: '#aab8ad', ink: '#2d4035', tabInk: '#2d3d33', active: '#426b61', activeInk: '#fffdf7',
  shadow: '0 2px 8px rgba(43,60,48,0.125)', labelBg: 'rgba(250,248,241,0.91)', labelInk: '#314239', labelBorder: '#acb9ae',
  labelExtBg: 'rgba(250,248,241,0.74)', labelExtInk: '#4f6158', swatchBorder: 'rgba(0,0,0,0.15)',
} as const

/** Vista's City overview camera (Ruijie's link: cam=0.018,0.682,9710.399,2440.256,-534.808,20) in the Toolkit frame. */
export const VISTA_OVERVIEW = { position: [9914.4, -118.2, 6160.9] as [number, number, number], target: [2365.1, -251.1, 20] as [number, number, number], fov: 45 }

/**
 * Plan: north up from straight above the proposed tower, 1 km across the view. Ruijie called about 6 km "a good scale in
 * general" (3 Nov), then asked for the tower "to the right scale" (3 km), then (6 Nov) "when I click on plan … the view
 * could be more zoomed in to the tower": at 1 km a 30 m tower is about 3% of the view's width, with its lot, the
 * neighbouring blocks and the streets around it readable. Zoom stays free (wheel, or Zoom in / Zoom out).
 */
export const PLAN_WIDTH_M = 1000
export const PLAN_FOV = 20
export function planCamera(centre: [number, number, number], aspect: number): { position: [number, number, number]; target: [number, number, number]; fov: number } {
  const h = PLAN_WIDTH_M / 2 / (Math.tan(THREE.MathUtils.degToRad(PLAN_FOV / 2)) * Math.max(0.3, aspect))
  return { position: [centre[0], centre[1] - 0.01, centre[2] + h], target: centre, fov: PLAN_FOV }
}

/** The map modes of Vista's viewport toolbar, each mapped onto a Toolkit feature (no parallel features). */
export type MapMode = 'city' | 'observer' | 'inspect' | 'plan' | 'viewcone'
export const MAP_MODES: { id: MapMode; label: string; title: string }[] = [
  { id: 'city', label: 'City', title: 'Back to the whole of Vancouver (the overview)' },
  { id: 'observer', label: 'Observer', title: 'Look from a protected viewpoint (choose the view cone)' },
  { id: 'inspect', label: 'Inspect', title: 'The proposed tower in axonometric, close up; click a building for its height, type and sources' },
  { id: 'plan', label: 'Plan', title: 'North-up plan centred on the proposed tower, 1 km across · drag to pan' },
  { id: 'viewcone', label: 'Viewcone', title: 'All view cones on, or all off' },
]

/** Vista's caption under the view, per mode. */
/** The same hints as gestures: what to do, one word for what it does (Ruijie, 6 Nov: icons and key words, not sentences). */
export const MODE_GESTURES: Record<MapMode, [string, string][]> = {
  city: [['drag', 'orbit'], ['right-drag', 'pan'], ['scroll', 'zoom']],
  observer: [['drag', 'look'], ['Esc', 'leave']],
  inspect: [['click', 'a building']],
  plan: [['drag', 'pan'], ['scroll', 'zoom']],
  viewcone: [['click', 'cones on / off']],
}

export const MODE_HINT: Record<MapMode, string> = {
  city: 'City · drag to orbit · right-drag to pan · scroll to zoom.',
  observer: 'Observer · from a protected viewpoint · drag to look around · Esc to leave.',
  inspect: 'Inspect · the proposed tower in axonometric · click a building for its height, type and sources.',
  plan: 'Plan · north up · drag to pan · scroll to zoom.',
  viewcone: 'Viewcone · all view cones on or off.',
}

interface LookState {
  mode: MapMode
  /** "Colour buildings by type" (Layers), on by default (Ruijie, 3 Nov: "keep it colourful with legend while keep the colour light"). */
  typeColours: boolean
  /** Neighbourhood and landmark labels (Vista's "Place labels"). */
  labels: boolean
  /** Building picked in Inspect (footprint index), where it was clicked, its roof and base (CGVD28 m). */
  inspected: { index: number; x: number; y: number; roof: number; ground: number } | null
  /** A short note under the view (why a mode could not start, or what a click found). */
  note: string | null
}
export const useVistaLook = create<LookState>(() => ({ mode: 'city', typeColours: true, labels: true, inspected: null, note: null }))

// ---------- shading ----------

/** Vista's light, in its model frame (x east, y north, z up): normalize(-0.45, -0.35, 0.82). */
export const VISTA_LIGHT = new THREE.Vector3(-0.45, -0.35, 0.82).normalize()

/** Uniforms shared by every Vista-shaded material (one object, so one update reaches all). */
export const VISTA_UNIFORMS = {
  /** Light direction in the model frame (z up): Vista's fixed light. */
  uVistaL: { value: VISTA_LIGHT.clone() },
  /** Vista's fog reach: max(4000, 3 x camera-to-target distance). */
  uVistaFogFar: { value: 29000 },
  /** How dark a cast shadow is (Sun & shadow preview); 1 = no shadow. */
  uVistaShadowTone: { value: 0.8 },
  uVistaPark: { value: new THREE.Color(VISTA.parks) },
  uVistaParkMask: { value: null as THREE.Texture | null },
  /** 1 once the park mask has loaded (an unset sampler reads black, which would make everything a park). */
  uVistaParkOn: { value: 0 },
  uVistaPlaneHalf: { value: 9000 },
  /** Water mask (black in OSM water: public/data/water.json), so terrain the elevation model puts just above 0 m over
   *  the water is drawn as water, not as beige specks. Display only. */
  uVistaWaterMask: { value: null as THREE.Texture | null },
  uVistaWaterOn: { value: 0 },
  uVistaWater: { value: new THREE.Color(VISTA.water) },
}

/** Sets the fog reach from the orbit distance, as Vista's computeCamera does. */
export function setVistaFog(distance: number) { VISTA_UNIFORMS.uVistaFogFar.value = Math.max(4000, distance * 3) }

export type VistaSurface = 'buildings' | 'terrain' | 'water'
const SURFACE: Record<VistaSurface, number> = { buildings: 1, terrain: 2, water: 4 }

// The shadow of the directional light (the sun preview) as a number, from three's own lighting chunk.
const SHADOW_FROM = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ]'
const SHADOW_TO = 'vistaShadowNow = ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ]'
const SHADOW_END = 'vDirectionalShadowCoord[ i ] ) : 1.0;'
/** three's lighting chunk with the directional shadow kept in `vistaShadow`; null if three's chunk changed (no shadows then). */
export function shadowCapturingLights(chunk: string = THREE.ShaderChunk.lights_fragment_begin): string | null {
  const at = chunk.indexOf(SHADOW_FROM)
  if (at < 0) return null
  const end = chunk.indexOf(SHADOW_END, at)
  if (end < 0) return null
  return chunk.slice(0, at) + SHADOW_TO + chunk.slice(at + SHADOW_FROM.length, end + SHADOW_END.length)
    + ' directLight.color *= vistaShadowNow; vistaShadow = min( vistaShadow, vistaShadowNow );' + chunk.slice(end + SHADOW_END.length)
}

const HELPERS = /* glsl */ `
varying vec3 vVistaWorld;
uniform vec3 uVistaL; uniform float uVistaFogFar; uniform float uVistaShadowTone;
uniform vec3 uVistaPark; uniform sampler2D uVistaParkMask; uniform float uVistaParkOn; uniform float uVistaPlaneHalf;
uniform sampler2D uVistaWaterMask; uniform float uVistaWaterOn; uniform vec3 uVistaWater;
float vistaShadow = 1.0; float vistaShadowNow = 1.0;
float vHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vHatch(float q){ float aa = max(fwidth(q), 0.001); float line = 1.0 - smoothstep(0.045, 0.045 + aa, abs(fract(q + 0.5) - 0.5)); return line * (1.0 - smoothstep(0.22, 0.7, aa)); }
float vStipple(vec2 q){ vec2 cell = floor(q); vec2 centre = vec2(vHash(cell), vHash(cell + vec2(83.0, 19.0))) * 0.5 + 0.25;
  float aa = max(length(fwidth(q)), 0.001); return (1.0 - smoothstep(0.085, 0.085 + aa, length(fract(q) - centre))) * (1.0 - smoothstep(0.28, 0.8, aa)); }
float vPaper(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(vHash(i), vHash(i + vec2(1, 0)), f.x), mix(vHash(i + vec2(0, 1)), vHash(i + vec2(1, 1)), f.x), f.y); }
vec3 vToSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 vToLinear(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
`

/** Vista's Plain shading (style 2), per surface; P is the model frame (z up), base and the result are sRGB. */
function shading(surface: number): string {
  return /* glsl */ `{
  vec3 P = vec3(vVistaWorld.x, -vVistaWorld.z, vVistaWorld.y);
  vec3 n = normalize(cross(dFdx(P), dFdy(P)));
  vec3 L = normalize(uVistaL);
  float light = max(dot(n, L), 0.0), shade = smoothstep(0.0, 0.85, light);
  vec3 base = vToSRGB(clamp(diffuseColor.rgb, 0.0, 1.0));
  vec3 c = base * (0.81 + 0.19 * shade);
  ${surface === 1 ? `float roof = smoothstep(0.6, 0.9, abs(n.z)); c = mix(base * (0.79 + 0.15 * shade), base, roof);` : ''}
  ${surface === 2 ? `c = base * (0.94 + 0.06 * shade); c *= 0.975 + 0.035 * vPaper(P.xy / 30.0);
    vec2 puv = (P.xy + uVistaPlaneHalf) / (2.0 * uVistaPlaneHalf);
    float park = uVistaParkOn * (1.0 - texture2D(uVistaParkMask, puv).r);
    if (park > 0.002) {
      vec3 pb = vToSRGB(uVistaPark);
      float wash = vPaper(P.xy / 65.0) * 0.65 + vPaper(P.xy / 16.0) * 0.35;
      vec3 pc = mix(pb * 0.84, pb * 1.07, wash);
      pc = mix(pc, vec3(0.94, 0.94, 0.85), vStipple(P.xy / 4.5) * 0.12);
      pc = mix(pc, vec3(0.92, 0.93, 0.85), vHatch(P.z / 10.0) * 0.17); // faint contours on the existing terrain only
      c = mix(c, pc, park);
    }
    float wet = uVistaWaterOn * (1.0 - texture2D(uVistaWaterMask, puv).r);
    if (wet > 0.002) {
      // Inside OSM water: Vista's water, exactly as the sea plane draws it, so the coast reads clean.
      vec3 wb = vToSRGB(uVistaWater);
      vec3 wc = wb * (0.985 + 0.025 * vPaper(P.xy / 95.0));
      wc = mix(wc, vec3(0.88, 0.92, 0.91), vHatch((P.y + sin(P.x * 0.012) * 2.0) / 18.0) * 0.06);
      c = mix(c, wc, smoothstep(0.3, 0.7, wet));
    }` : ''}
  ${surface === 4 ? `c = base * (0.985 + 0.025 * vPaper(P.xy / 95.0)); c = mix(c, vec3(0.88, 0.92, 0.91), vHatch((P.y + sin(P.x * 0.012) * 2.0) / 18.0) * 0.06);` : ''}
  c *= 0.994 + 0.012 * vHash(floor(gl_FragCoord.xy));
  c *= mix(uVistaShadowTone, 1.0, vistaShadow);
  outgoingLight = vToLinear(c);
}
`
}

/**
 * Turns a MeshStandardMaterial into Vista's Plain look: flat sRGB shading from Vista's light (walls 0.79-0.94, roofs
 * full), paper grain, park wash with stipple and contours, rippled water, and Vista's fog. Cast shadows from the Sun &
 * shadow preview still show (darkened by uVistaShadowTone). Not tone mapped, so the colours are Vista's numbers.
 */
export function vistaShaded<M extends THREE.MeshStandardMaterial>(material: M, surface: VistaSurface): M {
  const code = SURFACE[surface]
  const lights = shadowCapturingLights()
  material.toneMapped = false
  material.customProgramCacheKey = () => `vista-plain-${code}-${lights ? 1 : 0}`
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, VISTA_UNIFORMS)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vVistaWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvVistaWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${HELPERS}`)
      .replace('#include <lights_fragment_begin>', lights ?? '#include <lights_fragment_begin>')
      .replace('#include <opaque_fragment>', `${shading(code)}\n#include <opaque_fragment>`)
      .replace('#include <fog_fragment>', /* glsl */ `{ float f = clamp(distance(vVistaWorld, cameraPosition) / uVistaFogFar, 0.0, 1.0); f = f * f * 0.38;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(${VISTA_FOG.join(', ')}), f); }`)
  }
  material.needsUpdate = true
  return material
}

/** Black-in-water mask for the terrain shader (OSM water, display only). */
export function setWaterMask(mask: THREE.Texture | null) {
  VISTA_UNIFORMS.uVistaWaterMask.value = mask
  VISTA_UNIFORMS.uVistaWaterOn.value = mask ? 1 : 0
}

/** Black-in-parks mask for the terrain shader (parks drawn from the City's park polygons). */
export function setParkMask(mask: THREE.Texture | null, planeHalf: number) {
  VISTA_UNIFORMS.uVistaParkMask.value = mask
  VISTA_UNIFORMS.uVistaParkOn.value = mask ? 1 : 0
  VISTA_UNIFORMS.uVistaPlaneHalf.value = planeHalf
}
