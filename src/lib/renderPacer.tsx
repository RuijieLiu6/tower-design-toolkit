// Draw the 3D view when something changes, not 30-60 times a second regardless.
//
// Measured on 4 Nov 2026 (Intel UHD, Real Vancouver): drawing the whole city takes about 33 ms of GPU time, so with
// R3F's default loop the GPU was always busy and a click waited behind queued frames: 120-136 ms from a click to the
// frame that shows it, against 24-40 ms for the same clicks on the lighter competition site. With <Canvas
// frameloop="demand"> and this pacer, a click after a pause is drawn within 16 ms (measured the same day). The view is
// drawn:
//   - whenever React changes something in the scene (R3F does that itself);
//   - for a moment after any input or app state change (the tower gizmo, the view rigs and effects that start a
//     move read their state inside useFrame), and continuously while dragging;
//   - while an animation runs: the stage easing and the Schematic lens move in Viewport.tsx ask for their next frame
//     until they settle, and OrbitControls asks while it damps;
//   - a few times a second when idle, as a safety net for anything changed outside React and the stores below.
// Keep the active window short: continuous drawing refills the GPU queue, and a click then waits behind it again.
// `?alwaysrender` in the URL keeps R3F's continuous loop, for before/after timing on the same build.
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import type { StoreApi, UseBoundStore } from 'zustand'
import { useHideUnderDesign } from '../components/CityContext'
import { useStreetDisplay } from '../components/CityStreets'
import { useContextLayers } from '../components/ContextLayers'
import { useHeightSurface } from '../components/HeightSurface'
import { useEnvelopeStore } from '../components/SolarEnvelope'
import { useDock } from '../components/ViewportDock'
import { useGroundUnder } from '../hooks/useProposal'
import { useSolar } from '../hooks/useSolarAccess'
import { useStore } from '../store'
import { useEnergyStore } from './energyStore'
import { useFacadeStore } from './facadeStore'
import { useRelax } from './relaxStore'
import { useSiteGeometry } from './siteGeometry'
import { useSiteStore } from './siteStore'
import { useTowerEdit } from './towerEdit'
import { useUnits } from './units'
import { useViewFromStore } from './viewFromStore'
import { useVistaStore } from './vistaStore'
import { useWindScreenStore } from './windScreenStore'

/** After input or a state change, keep drawing for this long (a few frames; animations then ask for their own). */
export const ACTIVE_MS = 200
/** When idle, still draw this often. */
export const IDLE_FRAME_MS = 250

export const alwaysRender = (): boolean => typeof location !== 'undefined' && /[?&]alwaysrender\b/.test(location.search)

/** <Canvas frameloop={canvasFrameloop()}>. */
export const canvasFrameloop = (): 'always' | 'demand' => (alwaysRender() ? 'always' : 'demand')

type AnyStore = UseBoundStore<StoreApi<object>>
/** The app stores the 3D scene reads (some only inside useFrame, outside React); a change in any wakes it for ACTIVE_MS. */
const SCENE_STORES = [
  useStore, useTowerEdit, useViewFromStore, useVistaStore, useDock, useHeightSurface, useContextLayers, useHideUnderDesign,
  useStreetDisplay, useEnvelopeStore, useSolar, useSiteStore, useSiteGeometry, useGroundUnder, useRelax, useEnergyStore,
  useWindScreenStore, useFacadeStore, useUnits,
] as unknown as readonly AnyStore[]

/** Keeps the view drawing while anything is moving (see the header). Place once inside the <Canvas>. */
export function RenderPacer({ stores = SCENE_STORES }: { stores?: readonly AnyStore[] }): null {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    if (alwaysRender()) return
    const wake = () => { activeUntil = performance.now() + ACTIVE_MS; invalidate() }
    const onMove = (e: PointerEvent) => { if (e.buttons) wake() } // dragging; plain hovering redraws only if React changes something
    const opts = { passive: true, capture: true } as const
    window.addEventListener('pointerdown', wake, opts)
    window.addEventListener('pointerup', wake, opts)
    window.addEventListener('pointermove', onMove, opts)
    window.addEventListener('wheel', wake, opts)
    window.addEventListener('keydown', wake, opts)
    window.addEventListener('resize', wake, opts)
    const unsub = stores.map((s) => s.subscribe(wake))
    const idle = setInterval(() => invalidate(), IDLE_FRAME_MS)
    wake()
    return () => {
      for (const t of ['pointerdown', 'pointerup', 'wheel', 'keydown', 'resize'] as const) window.removeEventListener(t, wake, opts)
      window.removeEventListener('pointermove', onMove, opts)
      unsub.forEach((u) => u())
      clearInterval(idle)
    }
  }, [invalidate, stores])
  useFrame((state) => { if (performance.now() < activeUntil) state.invalidate() })
  return null
}

let activeUntil = 0
