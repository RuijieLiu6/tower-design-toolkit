// The site model's base (lib/plinth.ts): skirt walls and underside in the look's plinth colour, a crisp top edge line.
// The top itself is the scene's own ground (the city terrain and sea, or the competition site's street level).
import { useEffect, useMemo } from 'react'
import type { Look } from '../data/stages'
import { plinthGeometry, type Plinth, type Side } from '../lib/plinth'

export default function PlinthBase({ plinth, ring, look, pad, edges }: { plinth: Plinth; ring: [number, number, number][]; look: Look; pad: number; edges?: Side[] }) {
  const key = edges?.join() ?? ''
  const g = useMemo(() => plinthGeometry(plinth, ring, pad, edges), [plinth, ring, pad, key]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { g.solid.dispose(); g.edge.dispose() }, [g])
  return (
    <>
      <mesh geometry={g.solid} receiveShadow>
        <meshStandardMaterial color={look.plinth} roughness={1} metalness={0} />
      </mesh>
      <lineSegments geometry={g.edge}>
        <lineBasicMaterial color={look.plinthEdge} />
      </lineSegments>
    </>
  )
}
