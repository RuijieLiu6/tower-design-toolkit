// The parts that exist only once something is brought in (Ruijie, 17 Nov: "If a user imports features or add-ons,
// they appear in this button's options too"): the custom and community tools installed (lib/communityStore.ts), the
// fonts the viewer added (lib/fonts/fontStore.ts), the sync links (lib/interchange/platforms.ts) and Real Vancouver's
// context layers (components/ContextLayers.tsx), registered in the UI registry as they appear and dropped as they go.
// A layer's entry turns the layer off in the view when hidden and brings it back as it was when shown again.
import { Package, Plug, Type as TypeIcon, Layers } from '../../components/icons'
import { useContextLayers } from '../../components/ContextLayers'
import { useCommunityStore } from '../communityStore'
import { useFonts } from '../fonts/fontStore'
import { PLATFORMS } from '../interchange/platforms'
import { registerUiItems, type UiItem } from './registry'

const LAYER_LABEL: Record<string, string> = { trees: 'Street trees', parcels: 'Parcels and land value', zoning: 'Zoning districts', heritage: 'Heritage buildings', traffic: 'Traffic counts' }
/** What each hidden layer was before it was hidden, kept in this browser so a reload still brings it back as it was. */
const WAS_KEY = 'ts.ui.layersWere'
export function layersWere(): Record<string, boolean> {
  try { const v = JSON.parse(localStorage.getItem(WAS_KEY) ?? 'null'); return v && typeof v === 'object' ? v : {} } catch { return {} }
}
export function rememberLayer(id: string, on: boolean | undefined) {
  const w = layersWere()
  if (on === undefined) delete w[id]; else w[id] = on
  try { localStorage.setItem(WAS_KEY, JSON.stringify(w)) } catch { /* this visit only */ }
}

let started = false
/** Start the registrations once (the drawer calls it; idempotent). */
export function startUiAddons() {
  if (started) return
  started = true
  const tools = () => registerUiItems('addons.tools', useCommunityStore.getState().packages.map((p): UiItem => ({ id: `addons.tools.${p.id}`, label: p.name, parent: 'addons.tools', icon: Package, hint: `${p.author?.name ? `${p.author.name} · ` : ''}v${p.version}: hidden from the workflow lists and Add tool; it stays installed` })))
  tools(); useCommunityStore.subscribe(tools)
  const fonts = () => registerUiItems('addons.fonts', useFonts.getState().user.map((u): UiItem => ({ id: `addons.fonts.${u.family}`, label: u.family, parent: 'addons.fonts', icon: TypeIcon, mode: 'presentation', hint: 'Hidden from the font picker; it stays in this browser' })))
  fonts(); useFonts.subscribe(fonts)
  registerUiItems('addons.sync', PLATFORMS.filter((p) => p.link).map((p): UiItem => ({ id: `addons.sync.${p.id}`, label: `${p.name} link`, parent: 'addons.sync', icon: Plug, hint: p.tested.ok ? 'Tested in the app' : 'Unverified: not yet run inside the app' })))
  registerUiItems('viewport.layers', (Object.keys(LAYER_LABEL) as (keyof typeof LAYER_LABEL)[]).map((id): UiItem => ({
    id: `viewport.layers.${id}`, label: LAYER_LABEL[id], parent: 'viewport.layers', icon: Layers, mode: 'model',
    apply: (visible) => {
      const on = useContextLayers.getState().on as Record<string, boolean | undefined>
      if (!visible) { rememberLayer(id, !!on[id]); if (on[id]) useContextLayers.setState({ on: { ...on, [id]: false } }) }
      else { if (layersWere()[id]) useContextLayers.setState({ on: { ...on, [id]: true } }); rememberLayer(id, undefined) }
    },
  })))
}
