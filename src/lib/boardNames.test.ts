// Board names, order and the PDF (Ruijie, 17 Nov: boards can be renamed, rearranged by their names, and exported as
// JPEG, PNG or PDF): the name and file stem, a move, the sort by name, the store keeping the selection, and the PDF's
// A2 pages around each board's JPEG with no author or software data.
import { describe, expect, it } from 'vitest'
import { boardFileStem, boardName, moveBoard, newBoard, sortBoardsByName, type Board } from '../engine/boards'
import { A2_PT, boardsPdf } from './boardPdf'
import { useBoardStore } from './boardStore'

const named = (i: number, name?: string): Board => ({ ...newBoard(i), name })

describe('board names and order', () => {
  it('names a board by its place until it has its own name, and makes a neutral file stem', () => {
    expect(boardName(named(0), 0)).toBe('Sheet 1')
    expect(boardName(named(0, '  '), 2)).toBe('Sheet 3')
    expect(boardName(named(0, 'Site strategy'), 0)).toBe('Site strategy')
    expect(boardFileStem(named(0, 'Site strategy'), 0)).toBe('01-site-strategy')
    expect(boardFileStem(named(0, 'Façade & sky room!'), 3)).toBe('04-facade-sky-room')
    expect(boardFileStem(named(0, '***'), 1)).toBe('02-board')
    expect(boardFileStem(named(0), 1)).toBe('02-sheet-2')
    expect(boardFileStem(named(0, '1 Site strategy'), 0)).toBe('01-site-strategy')
    expect(boardFileStem(named(0, '2024'), 0)).toBe('01-board')
  })

  it('moves a board to another place, the others keeping their order', () => {
    expect(moveBoard(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c'])
    expect(moveBoard(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    const same = ['a', 'b']
    expect(moveBoard(same, 0, 5)).toBe(same)
  })

  it('sorts by name with numbers read as numbers; unnamed boards stay after, in their order', () => {
    const list = [named(0, '10 Views'), named(1), named(2, '2 Plans'), named(3, 'a site')]
    expect(sortBoardsByName(list).map((b) => b.name ?? b.id)).toEqual(['2 Plans', '10 Views', 'a site', 'board-2'])
  })

  it('renames, moves and sorts in the store; the open board follows its move, and exports are asked for again', () => {
    const s = useBoardStore.getState()
    s.reset()
    s.renameBoard(0, 'C story'); s.renameBoard(1, 'A site'); s.renameBoard(2, 'B plans')
    s.select(0)
    s.setExport(useBoardStore.getState().boards[3].id, { at: '', name: 'x.jpg', bytes: 1, quality: 1, dpi: 150, manifest: {} as never, rules: [] })
    useBoardStore.getState().sortByName()
    let st = useBoardStore.getState()
    expect(st.boards.map((b) => boardName(b, 0))).toEqual(['A site', 'B plans', 'C story', 'Sheet 1'])
    expect(st.selected.board).toBe(2) // "C story" was open
    expect(st.exports).toEqual({})
    st.moveBoard(2, 0)
    st = useBoardStore.getState()
    expect(st.boards[0].name).toBe('C story')
    expect(st.selected.board).toBe(0)
    st.renameBoard(0, '')
    expect(useBoardStore.getState().boards[0].name).toBeUndefined()
    st.reset()
  })
})

/** The smallest JPEG header jpegSize reads: SOI, then an SOF0 with the size. */
function fakeJpeg(w: number, h: number): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9])
}

describe('the boards as one PDF', () => {
  it('writes one A2 landscape page per board, each the board image edge to edge, with no Info dictionary', async () => {
    const blob = boardsPdf([fakeJpeg(3508, 2480), fakeJpeg(3508, 2480)])
    const text = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()))
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text).toContain('/Type /Pages /Count 2')
    expect(text.match(/\/MediaBox \[0 0 1683\.78 1190\.55\]/g)).toHaveLength(2)
    expect(A2_PT.w / A2_PT.h).toBeCloseTo(594 / 420, 3)
    expect(text.match(/\/Width 3508 \/Height 2480/g)).toHaveLength(2)
    expect(text).not.toMatch(/\/Info|\/Author|\/Creator|\/Producer/)
    // the cross-reference offsets point at the objects
    const xref = Number(text.match(/startxref\n(\d+)/)![1])
    expect(text.slice(xref, xref + 4)).toBe('xref')
    const first = Number(text.match(/xref\n0 \d+\n0000000000 65535 f \n(\d{10})/)![1])
    expect(text.slice(first, first + 7)).toBe('1 0 obj')
  })

  it('refuses an empty set', () => {
    expect(() => boardsPdf([])).toThrow(/No board/)
  })
})
