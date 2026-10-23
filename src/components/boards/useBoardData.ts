// Data the board composer needs from the rest of the app: evidence sets from the built nodes, loaded images, and a
// measuring pass that finds text cut off by its frame.
import { useEffect, useMemo, useState } from 'react'
import { BOARD_W, type Board, type BoardImage } from '../../engine/boards'
import { useResults } from '../../hooks/useResults'
import { drawBoard, loadBoardImages, type EvidenceSet } from '../../lib/boardRender'
import { useTowers } from '../../store'

/** Rule lists from the built evaluation nodes, by node id, for evidence frames. */
export function useEvidence(): Record<string, EvidenceSet> {
  const res = useResults()
  const towers = useTowers()
  return useMemo(() => {
    const many = towers.length > 1
    const per = <T extends { tower: { name: string }; rules: EvidenceSet['rules'] }>(list: T[]) => list.flatMap((l) => l.rules.map((r) => (many ? { ...r, label: `${l.tower.name}: ${r.label}` } : r)))
    const sets: EvidenceSet[] = [
      { id: 'built.vtc-rules', name: 'VTC hard rules', rules: res.rules },
      ...(res.streetwall ? [{ id: 'built.pr-streetwall', name: 'Streetwall and tower form', rules: res.streetwall.rules }] : []),
      ...(res.frontage ? [{ id: 'built.pr-frontage', name: 'Active frontage', rules: res.frontage.rules }] : []),
      ...(res.groundPlane ? [{ id: 'built.pr-ground', name: 'Open space and links', rules: res.groundPlane.rules }] : []),
      { id: 'built.core-lifts', name: 'Core and lifts', rules: per(res.lifts) },
      { id: 'built.egress', name: 'Egress and stairs', rules: per(res.egress) },
      { id: 'built.sky-room', name: 'Public sky room', rules: per(res.skyRooms) },
    ].filter((s) => s.rules.length > 0)
    return Object.fromEntries(sets.map((s) => [s.id, s]))
  }, [res, towers])
}

/** Load every image placed on the boards; re-renders when they arrive. */
export function useLoadedImages(boards: Board[], images: Record<string, BoardImage>) {
  const [loaded, setLoaded] = useState<Map<string, HTMLImageElement>>(() => new Map())
  useEffect(() => {
    let live = true
    void loadBoardImages(boards, images).then((m) => { if (live) setLoaded(m) })
    return () => { live = false }
  }, [boards, images])
  return loaded
}

let measureCanvas: HTMLCanvasElement | null = null
/** Frames whose text does not fit, per board (measured at 2 px/mm, without images). */
export function useOverflow(boards: Board[], images: Record<string, BoardImage>, evidence: Record<string, EvidenceSet>) {
  return useMemo(() => {
    const out: Record<string, string[]> = {}
    if (typeof document === 'undefined') return out
    measureCanvas ??= document.createElement('canvas')
    const k = 2
    measureCanvas.width = BOARD_W * k; measureCanvas.height = 1
    const ctx = measureCanvas.getContext('2d')
    if (!ctx) return out
    boards.forEach((b, i) => { const r = drawBoard(ctx, b, { pxPerMm: k, images, loaded: new Map(), evidence, editing: false, index: i, total: boards.length }); if (r.overflow.length) out[b.id] = r.overflow })
    return out
  }, [boards, images, evidence])
}
