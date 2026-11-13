// A card the 3D view hands to the right panel (Sinnie, 12 Nov: "stuff like this should show up on the right panel"):
// the map's click menu (Build / Use lot / Combine, components/site/SiteMapMenu.tsx) is drawn at the top of Properties
// instead of floating over the view. The element is made where the click is handled (inside the 3D scene) and shown by
// RightPanel.tsx; it only uses global stores, so it renders the same outside the scene.
import type { ReactNode } from 'react'
import { create } from 'zustand'

export const useContextCard = create<{ card: ReactNode | null; seq: number }>(() => ({ card: null, seq: 0 }))
