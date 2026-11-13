// The results of the selected check, drawn out of sight while the Architectural set collects each workflow tool's
// drawings (lib/boardCapture.ts). The same components the right panel's Results tab shows.
import ClimateDrawings from '../ClimateDrawings'
import Inspector from '../Inspector'
import SwResults from '../sw/SwResults'

export default function CaptureHost() {
  return <><SwResults /><ClimateDrawings /><Inspector /></>
}
