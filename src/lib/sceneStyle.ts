import { create } from 'zustand'

/**
 * Real Vancouver's look. 'plain' (default): pure, flat colours, buildings tinted by type (lib/buildingUse.ts).
 * 'context': Vista's Context style, with facade, paving, asphalt, grass and water textures (components/ContextStyle.tsx).
 * Chosen in the Layers dock and in Present (representation), so captures and boards use it too.
 */
export type SceneStyle = 'plain' | 'context'
export const useSceneStyle = create<{ style: SceneStyle }>(() => ({ style: 'plain' }))
