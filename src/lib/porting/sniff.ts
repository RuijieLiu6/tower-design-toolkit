// What a file is, from its contents, not only its name (Result B brief §4: "different JSON files represent different
// kinds of information"): a model by its extension (the readers decide the rest), a .json by its `format` field or its
// GeoJSON shape. Null when it is none of the kinds the centre takes.
import type { ImportPurpose } from './capabilities'
import { DESIGN_TOOL_FORMAT } from '../designTools/contract'

const MODEL = /\.(3dm|obj|glb|gltf|ifc)$/i
// Both tool package kinds land on the same purpose: an evaluation node (tower-studio-node@1) and a connected design tool
// (tower-studio-design-tool@1); the tool pane tells them apart by `format` (components/porting/TransferDialog.tsx).
const FORMATS: Record<string, ImportPurpose> = { 'tower-studio-project@1': 'project', 'tower-studio-phase@1': 'package', 'tower-studio-node@1': 'tool', [DESIGN_TOOL_FORMAT]: 'tool' }

/** The purpose a JSON text fits, or null. */
export function purposeOfJson(text: string): ImportPurpose | null {
  let j: unknown
  try { j = JSON.parse(text.replace(/^﻿/, '')) } catch { return null }
  if (!j || typeof j !== 'object') return null
  const o = j as { format?: unknown; type?: unknown }
  if (typeof o.format === 'string' && o.format in FORMATS) return FORMATS[o.format]
  if (o.type === 'Feature' || o.type === 'FeatureCollection' || o.type === 'Polygon' || o.type === 'MultiPolygon') return 'site'
  return null
}

/** The purpose a file fits: models by name, JSON by contents (read once; a model file is never read here). */
export async function sniff(file: File): Promise<ImportPurpose | null> {
  if (MODEL.test(file.name)) return 'model'
  if (!/\.(geo)?json$/i.test(file.name) || file.size > 50_000_000) return null
  return purposeOfJson(await file.text())
}
