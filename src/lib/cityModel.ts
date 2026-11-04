import { create } from 'zustand'

/**
 * Which buildings Real Vancouver stands on. 'vista' (the default since 3 Nov): Vista's unified model, OpenStreetMap
 * footprints and heights (lib/vistaBuildings.ts). 'city': the earlier City model, LiDAR 2022 roof parts in the core and
 * the City's 2009 heights around them, kept for comparison. The viewport and the solar worker read the same choice.
 */
export type CityModel = 'vista' | 'city'
export const useCityModel = create<{ model: CityModel }>(() => ({ model: 'vista' }))
