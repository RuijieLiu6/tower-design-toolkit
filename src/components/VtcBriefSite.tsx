// The competition site from the brief alone, for a computer without the base model (the live website before an entrant
// adds their copy; Ruijie, 6 Nov: "now the competition site is missing on the other computer"). VtcScene draws the
// 144.8 x 79.2 m block (BRIEF_SITE) as the site surface; this names the four streets from engine/publicRealm's measured
// edges and, once the model is known to be missing, frames the camera on the block (the default view is sized for the
// 600 m context model, where the bare block reads as a speck). Nothing here is read from Buildner's model file.
import { useEffect } from 'react'
import { VTC_EDGES } from '../engine/publicRealm'
import { BRIEF_SITE, useVtcSource } from '../lib/vtcContextSource'
import { useStore } from '../store'
import Label from './Label'

/** From the south-east like the default view, close enough that the block fills the middle of the frame. */
const FRAME = { position: [190, -240, 165] as [number, number, number], target: [0, 0, 10] as [number, number, number], fov: 40 }
/** The competition view's opening camera (Viewport: three [520, 430, 640] looking at [0, 60, 0]), in the model frame. */
const OVERVIEW = { position: [520, -640, 430] as [number, number, number], target: [0, 0, 60] as [number, number, number] }

export default function VtcBriefSite() {
  const missing = useVtcSource((s) => s.status === 'missing' || s.status === 'error')
  useEffect(() => { if (missing) useStore.getState().set({ cameraRequest: { ...FRAME } }) }, [missing])
  // Unmounted because the model has just been added (the context arrived): back to the overview of the whole context.
  useEffect(() => () => { if (useVtcSource.getState().ctx && useStore.getState().project === 'vtc') useStore.getState().set({ cameraRequest: { ...OVERVIEW } }) }, [])
  const w = BRIEF_SITE.width_m / 2, d = BRIEF_SITE.depth_m / 2
  return (
    <group name="vtc-brief-site">
      {VTC_EDGES.map((e) => (
        <Label quiet key={e.id} text={e.street.toUpperCase()} position={[e.out[0] * (w + e.row / 2), e.out[1] * (d + e.row / 2), 1]} size={0.013} background={null} color="#6b6f76" bold />
      ))}
    </group>
  )
}
