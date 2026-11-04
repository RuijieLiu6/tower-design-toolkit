// The design: the part of the app state that a project file holds, undo steps through and autosave keeps.
// Everything else (stage, camera, panels, captures) is how you look at the design, not the design itself.
import { useStore } from '../../store'

type AppState = ReturnType<typeof useStore.getState>

// Add new design inputs here (and to history.ts KEYS and project.schema.json), or they won't be saved or undone.
export const DESIGN_KEYS = ['project', 'towers', 'models', 'citySite', 'selectedTower', 'enabled', 'fsrTier', 'transitLink', 'groundElevation', 'groundMode', 'sun', 'liftPresets', 'egressPresets', 'publicRealm', 'cityInNature', 'windPresets', 'systemsPresets'] as const
export type Design = Pick<AppState, (typeof DESIGN_KEYS)[number]>

export const pickDesign = (s: AppState | Design): Design => Object.fromEntries(DESIGN_KEYS.map((k) => [k, s[k]])) as Design

/** The design a fresh app starts with. */
export const defaultDesign = (): Design => pickDesign(useStore.getInitialState())

/** Replace the design in the app (opening a file, New, undo). */
export function applyDesign(d: Design, announce?: string) {
  useStore.setState({ ...d, placing: false, ...(announce ? { announce } : {}) })
}
