// Real Vancouver's Context style: Vista's illustrative facades, paving, asphalt, grass and water (Ruijie Liu, Vista @
// 917b28e, explorer/building-materials.js and the Context branch of explorer.js), ported to three.js materials. Textures
// in public/textures/vista/ (sources.json: Poly Haven and ProcTexture CC0, Ruijie's own paving and asphalt, a generated
// grass watercolour). Illustrative surfaces only: facade families, window rhythms and paving are not surveyed.
import { useThree } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import * as THREE from 'three'

// ---------- textures (loaded once, on first use of the Context style) ----------
export interface VistaTextures { brick: THREE.Texture; whiteBrick: THREE.Texture; mineral: THREE.Texture; asphalt: THREE.Texture; paving: THREE.Texture; grass: THREE.Texture; water: THREE.Texture }
let loading: Promise<VistaTextures> | null = null
function loadTextures(): Promise<VistaTextures> {
  loading ??= (async () => {
    const loader = new THREE.TextureLoader()
    const get = async (file: string) => {
      const t = await loader.loadAsync(`./textures/vista/${file}`)
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      // Read as plain numbers: albedos stay in sRGB, as Vista mixes them with its own colours (the shaders convert once
      // at the end), and the water normal map is linear data.
      t.colorSpace = THREE.NoColorSpace
      t.anisotropy = 4
      t.needsUpdate = true
      return t
    }
    const [brick, whiteBrick, mineral, asphalt, paving, grass, water] = await Promise.all([
      get('facade-brick.jpg'), get('facade-white-brick.jpg'), get('facade-concrete.jpg'), get('asphalt.jpg'), get('paving.jpg'), get('grass.jpg'), get('water-normal.png'),
    ])
    return { brick, whiteBrick, mineral, asphalt, paving, grass, water }
  })()
  loading.catch(() => { loading = null })
  return loading
}

/** Vista's textures once loaded (null until then, or when not asked for); redraws the view when they arrive. */
export function useVistaTextures(on: boolean): VistaTextures | null {
  const [t, setT] = useState<VistaTextures | null>(null)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    if (!on || t) return
    let live = true
    loadTextures().then((v) => { if (live) { setT(v); invalidate() } }, () => {})
    return () => { live = false }
  }, [on, t, invalidate])
  return on ? t : null
}

// ---------- facade families (Vista building-materials.js `choose`) ----------
const HOMES = new Set(['apartments', 'residential', 'house', 'detached', 'terrace', 'semidetached_house', 'dormitory'])
const UTILITARIAN = new Set(['industrial', 'warehouse', 'garage', 'garages', 'shed', 'service', 'parking', 'hangar', 'greenhouse'])
const PUBLIC = new Set(['school', 'university', 'college', 'hospital', 'church', 'civic', 'public'])

/** FNV-1a of the OSM id, as Vista seeds its per-building variation. */
export function vistaSeed(id: string): number {
  let n = 2166136261
  for (let i = 0; i < id.length; i++) n = Math.imul(n ^ id.charCodeAt(i), 16777619)
  return (n >>> 0) / 4294967296
}

/**
 * Vista's facade family (0 office grid, 1 residential ribbon, 2 buff stone, 3 brick, 4 white brick, 5 concrete) and floor
 * height. A use comes from the OSM type; without one, tall proportions choose only an illustrative glazing rhythm.
 */
export function vistaFamily(osmType: string, height: number, width: number, seed: number): { family: number; floorH: number } {
  if (osmType === 'office') return { family: 0, floorH: 3.8 }
  if (HOMES.has(osmType)) return { family: height >= 24 ? 1 : seed < 0.68 ? 4 : 2, floorH: 3.1 }
  if (osmType === 'hotel') return { family: height >= 30 ? 1 : 2, floorH: 3.2 }
  if (osmType === 'commercial') return { family: height >= 30 ? 0 : seed < 0.38 ? 3 : 2, floorH: 3.7 }
  if (osmType === 'retail') return { family: height <= 24 && seed < 0.55 ? 3 : 2, floorH: 3.8 }
  if (UTILITARIAN.has(osmType)) return { family: 5, floorH: 4 }
  if (PUBLIC.has(osmType)) return { family: seed < 0.26 && height <= 24 ? 3 : 2, floorH: 3.6 }
  if (height >= 40 && width >= 45) return { family: 0, floorH: 3.6 }
  if (height >= 30 && width < 45) return { family: 1, floorH: 3.2 }
  return { family: seed < 0.45 ? 5 : seed < 0.75 ? 2 : 4, floorH: 3.4 }
}

/**
 * Per-vertex facade data for a merged building geometry: [family × 16 + floor-height step, seed × 1000, base dm, top dm]
 * as 16-bit integers (8 bytes a vertex). `ranges` are [part, first vertex, vertex count] as built by CityContext's prisms.
 */
export function facadeAttribute(count: number, ranges: [number, number, number][], info: (part: number) => { family: number; floorH: number; seed: number; base: number; top: number }): THREE.BufferAttribute {
  const a = new Int16Array(count * 4)
  for (const [part, start, n] of ranges) {
    const f = info(part)
    const v0 = f.family * 16 + Math.max(0, Math.min(15, Math.round((f.floorH - 2.5) * 10))), v1 = Math.round(f.seed * 1000)
    const v2 = Math.max(-32767, Math.min(32767, Math.round(f.base * 10))), v3 = Math.max(-32767, Math.min(32767, Math.round(f.top * 10)))
    for (let k = start; k < start + n; k++) { a[k * 4] = v0; a[k * 4 + 1] = v1; a[k * 4 + 2] = v2; a[k * 4 + 3] = v3 }
  }
  return new THREE.BufferAttribute(a, 4)
}

// ---------- the facade material ----------
const SHADER_COMMON = /* glsl */ `
float vHash21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float vHatch(float q){ float aa=max(fwidth(q),0.001); float line=1.0-smoothstep(0.045,0.045+aa,abs(fract(q+0.5)-0.5)); return line*(1.0-smoothstep(0.22,0.7,aa)); }
float vPaperNoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(vHash21(i),vHash21(i+vec2(1,0)),f.x),mix(vHash21(i+vec2(0,1)),vHash21(i+vec2(1,1)),f.x),f.y); }
vec3 vToLinear(vec3 c){ return pow(max(c,vec3(0.0)),vec3(2.2)); }
`
const FACADE_FNS = /* glsl */ `
uniform sampler2D uBrick; uniform sampler2D uWhiteBrick; uniform sampler2D uMineral;
varying vec4 vFacade; varying vec3 vObjPos; varying vec3 vObjNormal;
float facadePane(vec2 grid,vec2 margin){
  vec2 aa=max(fwidth(grid),vec2(0.002)), f=fract(grid);
  vec2 edge=smoothstep(margin-aa,margin+aa,f)*(1.0-smoothstep(1.0-margin-aa,1.0-margin+aa,f));
  float coverage=(1.0-2.0*margin.x)*(1.0-2.0*margin.y);
  return mix(edge.x*edge.y,coverage,smoothstep(0.25,0.8,max(aa.x,aa.y)));
}
vec3 facadeCladding(vec2 uv,vec2 dx,vec2 dy,float family){
  if(family>2.5 && family<3.5) return textureGrad(uBrick,uv/4.0,dx/4.0,dy/4.0).rgb;
  if(family>3.5 && family<4.5) return textureGrad(uWhiteBrick,uv/2.0,dx/2.0,dy/2.0).rgb;
  return textureGrad(uMineral,uv/1.5,dx/1.5,dy/1.5).rgb;
}
float facadeOpening(vec2 grid,vec2 margin,float arched){
  float pane=facadePane(grid,margin);
  vec2 aa=max(fwidth(grid),vec2(0.002)),f=fract(grid);
  float halfWidth=max(0.05,0.5-margin.x),rise=halfWidth*0.65;
  float spring=1.0-margin.y-rise,xx=(f.x-0.5)/halfWidth;
  float top=spring+rise*sqrt(max(0.0,1.0-xx*xx));
  float archEdge=1.0-smoothstep(top-aa.y,top+aa.y,f.y);
  float fade=smoothstep(0.20,0.65,max(aa.x,aa.y));
  return mix(pane,mix(pane*archEdge,pane*0.95,fade),arched);
}
// Vista's contextFacade; window cells are kept whole between the building's base and top (not at its corners).
vec3 contextFacade(vec2 uv,float family,float floorH,float seed,vec3 glass,float baseZ,float topZ){
  vec2 dx=dFdx(uv),dy=dFdy(uv);
  vec3 material=facadeCladding(uv,dx,dy,family);
  float value=dot(material,vec3(0.2126,0.7152,0.0722));
  vec3 wall=vec3(0.87,0.87,0.83)*(0.90+0.12*value);
  float bay=2.5,arched=0.0; vec2 margin=vec2(0.22,0.20);
  if(family<0.5){ wall=vec3(0.88,0.90,0.88)*(0.92+0.10*value);bay=1.75;margin=vec2(0.09,0.17); }
  else if(family<1.5){ wall=vec3(0.91,0.89,0.83)*(0.91+0.10*value);bay=2.8;margin=vec2(0.055,0.24); }
  else if(family<2.5){ wall=vec3(0.90,0.86,0.76)*(0.91+0.11*value);bay=2.45;margin=vec2(0.24,0.17); }
  else if(family<3.5){ wall=mix(material*0.72+vec3(0.26,0.17,0.14),vec3(0.82,0.67,0.57),0.28);bay=2.6;margin=vec2(0.23,0.15);arched=step(0.5,seed); }
  else if(family<4.5){ wall=mix(material*0.83+vec3(0.15,0.16,0.15),vec3(0.90,0.89,0.82),0.22);bay=2.3;margin=vec2(0.23,0.19); }
  else { wall=vec3(0.83,0.86,0.84)*(0.92+0.10*value);bay=3.6;margin=vec2(0.24,0.28); }
  vec2 grid=vec2((uv.x+seed*19.0)/bay,(uv.y-0.25)/floorH);
  vec2 aa=max(fwidth(grid),vec2(0.002)),fr=fract(grid);
  // Far away a window cell is under a pixel: Vista's pattern has faded to the wall and its average glazing, so stop here.
  if(max(aa.x,aa.y)>0.8) return mix(wall,glass,(1.0-2.0*margin.x)*(1.0-2.0*margin.y)*0.95);
  float detail=1.0-smoothstep(0.20,0.70,max(aa.x,aa.y));
  float panes=facadeOpening(grid,margin,arched);
  vec2 outerMargin=max(vec2(0.015),margin-vec2(0.035,0.025));
  float surround=facadeOpening(grid,outerMargin,arched);
  float cellLo=(floor(grid.y)+outerMargin.y)*floorH+0.25+baseZ, cellHi=(floor(grid.y)+1.0-outerMargin.y)*floorH+0.25+baseZ;
  float complete=step(baseZ+0.2,cellLo)*step(cellHi,topZ-0.8);
  panes*=complete;surround*=complete;
  vec3 frame=mix(vec3(0.91,0.91,0.86),vec3(0.69,0.75,0.75),step(4.5,family));
  vec3 cladding=mix(wall,frame,surround);
  float cell=vHash21(floor(grid)+seed*79.3);
  vec3 glazing=glass*(0.95+0.05*cell);
  glazing=mix(glazing,vec3(0.78,0.82,0.78),step(0.83,cell)*0.42*detail);
  float vertical=vHatch(grid.x*2.0),horizontal=vHatch(grid.y*2.0);
  float mullion=vertical*0.32;
  if(family>1.5 && family<4.5)mullion=max(vertical*0.5,horizontal*0.55);
  glazing=mix(glazing,vec3(0.35,0.44,0.47),mullion*detail);
  vec3 result=mix(cladding,glazing,panes);
  float band=vHatch(grid.y)*detail;
  result=mix(result,wall*0.92,band*(family<1.5?0.30:0.10));
  if(family>1.5 && family<3.5){
    float sill=(1.0-smoothstep(0.008,0.028+aa.y,abs(fr.y-margin.y+0.015)))*surround*detail;
    result=mix(result,vec3(0.94,0.91,0.84),sill*0.55);
  }
  return result;
}
`

/** Vista's Context facades on a merged building geometry carrying the `aFacade` attribute (facadeAttribute). */
export function contextFacadeMaterial(t: VistaTextures): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.82, metalness: 0 })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uBrick = { value: t.brick }
    shader.uniforms.uWhiteBrick = { value: t.whiteBrick }
    shader.uniforms.uMineral = { value: t.mineral }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aFacade; varying vec4 vFacade; varying vec3 vObjPos; varying vec3 vObjNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFacade = aFacade; vObjPos = position; vObjNormal = normal;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SHADER_COMMON}\n${FACADE_FNS}`)
      .replace('#include <map_fragment>', /* glsl */ `#include <map_fragment>
  {
    vec3 n = normalize(vObjNormal);
    float family = floor(vFacade.x / 16.0 + 0.001);
    float floorH = 2.5 + (vFacade.x - family * 16.0) * 0.1;
    float seed = vFacade.y / 1000.0, baseZ = vFacade.z / 10.0, topZ = vFacade.w / 10.0;
    float wallMask = 1.0 - smoothstep(0.25, 0.55, abs(n.z));
    vec2 tang = normalize(vec2(-n.y, n.x) + vec2(1e-6));
    vec3 facade = contextFacade(vec2(dot(vObjPos.xy, tang), vObjPos.z - baseZ), family, floorH, seed, vec3(0.55, 0.68, 0.74), baseZ, topZ);
    facade *= mix(0.90, 1.0, smoothstep(0.0, 3.5, max(vObjPos.z - baseZ, 0.0)));
    vec3 roofMat = (family > 2.5 && family < 3.5 ? vec3(0.84, 0.78, 0.72) : vec3(0.84, 0.86, 0.83)) * (0.97 + 0.035 * vPaperNoise(vObjPos.xy / 2.0));
    diffuseColor.rgb = vToLinear(mix(roofMat, facade, wallMask));
  }`)
  }
  m.customProgramCacheKey = () => 'vista-context-facade'
  return m
}

// ---------- ground: paving on land, grass in parks (Vista pavingAlbedo + grass) ----------
const GROUND_FNS = /* glsl */ `
uniform sampler2D uPaving; uniform sampler2D uGrass; uniform sampler2D uParkMask; uniform float uPlaneHalf;
varying vec3 vObjPos;
vec3 pavingAlbedo(vec2 xy){
  vec2 q=xy/vec2(5.0,10.0), dx=dFdx(q), dy=dFdy(q), tile=1.0-abs(mod(q,2.0)-1.0);
  vec2 s=1.0-2.0*step(vec2(1.0),mod(q,2.0)); dx*=s; dy*=s;
  vec3 grain=textureGrad(uPaving,tile,dx,dy).rgb;
  float detail=1.0-smoothstep(0.015,0.06,max(length(dx),length(dy)));
  return mix(vec3(0.86,0.86,0.85),grain,detail*0.78);
}
`

/**
 * Land as Vista's pale concrete paving (grain resolves close up, fades to one pale surface far away) and mapped parks as
 * its grass watercolour. `parkMask`: black where parks are, white elsewhere, over the square ±planeHalf.
 */
export function contextGroundMaterial(t: VistaTextures, parkMask: THREE.Texture | null, planeHalf: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0 })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uPaving = { value: t.paving }
    shader.uniforms.uGrass = { value: t.grass }
    shader.uniforms.uParkMask = { value: parkMask }
    shader.uniforms.uPlaneHalf = { value: planeHalf }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SHADER_COMMON}\n${GROUND_FNS}`)
      .replace('#include <map_fragment>', /* glsl */ `#include <map_fragment>
  {
    vec2 muv = (vObjPos.xy + uPlaneHalf) / (2.0 * uPlaneHalf);
    float park = ${parkMask ? '1.0 - texture(uParkMask, muv).r' : '0.0'};
    vec3 grass = texture(uGrass, vObjPos.xy / 60.0).rgb;
    vec3 land = pavingAlbedo(vObjPos.xy);
    diffuseColor.rgb = vToLinear(mix(land, grass, smoothstep(0.35, 0.65, park)));
  }`)
  }
  m.customProgramCacheKey = () => `vista-context-ground-${parkMask ? 'parks' : 'none'}`
  return m
}

/** Vista's Context water: an illustrative turquoise wash with the CC0 ocean normal map for ripples (not depth or quality). */
export function contextWaterMaterial(t: VistaTextures, size: [number, number]): THREE.MeshStandardMaterial {
  const normal = t.water.clone()
  normal.repeat.set(size[0] / 60, size[1] / 60)
  normal.needsUpdate = true
  return new THREE.MeshStandardMaterial({ color: '#7fb3b8', roughness: 0.35, metalness: 0, normalMap: normal, normalScale: new THREE.Vector2(0.35, 0.35) })
}

/** Vista's asphalt (world-aligned, so overlapping road strips show the same grain and never flicker) or sidewalk paving. */
export function contextPavingMaterial(t: VistaTextures, asphalt: boolean): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: asphalt ? -2 : -1, polygonOffsetUnits: asphalt ? -2 : -1 })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTex = { value: asphalt ? t.asphalt : t.paving }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SHADER_COMMON}\nuniform sampler2D uTex; varying vec3 vObjPos;`)
      .replace('#include <map_fragment>', /* glsl */ `#include <map_fragment>
  {
    vec2 q = vObjPos.xy / ${asphalt ? 'vec2(4.0, 8.0)' : 'vec2(5.0, 10.0)'}, dx = dFdx(q), dy = dFdy(q), tile = 1.0 - abs(mod(q, 2.0) - 1.0);
    vec2 s = 1.0 - 2.0 * step(vec2(1.0), mod(q, 2.0)); dx *= s; dy *= s;
    vec3 c = textureGrad(uTex, tile, dx, dy).rgb;
    ${asphalt ? 'c = mix(clamp(c, vec3(0.12), vec3(0.42)), vec3(0.40, 0.41, 0.42), 0.35);' : 'c = mix(vec3(0.86, 0.86, 0.85), c, (1.0 - smoothstep(0.015, 0.06, max(length(dx), length(dy)))) * 0.78);'}
    diffuseColor.rgb = vToLinear(c);
  }`)
  }
  m.customProgramCacheKey = () => `vista-context-${asphalt ? 'asphalt' : 'paving'}`
  return m
}
