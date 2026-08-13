import { describe, expect, it } from 'vitest'
import * as graph from '../graph'

const STANDARD: graph.Window = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 }

describe('graph: coordinate mapping', () => {
  it('maps the window corners to the pixel corners', () => {
    expect(graph.xToCol(STANDARD.xMin, STANDARD)).toBe(0)
    expect(graph.xToCol(STANDARD.xMax, STANDARD)).toBe(graph.GRAPH_COLS - 1)
    expect(graph.yToRow(STANDARD.yMax, STANDARD)).toBe(0)
    expect(graph.yToRow(STANDARD.yMin, STANDARD)).toBe(graph.GRAPH_ROWS - 1)
  })

  it('maps the origin to the center pixel for a symmetric window', () => {
    expect(graph.xToCol(0, STANDARD)).toBe(Math.round((graph.GRAPH_COLS - 1) / 2))
    expect(graph.yToRow(0, STANDARD)).toBe(Math.round((graph.GRAPH_ROWS - 1) / 2))
  })

  it('round-trips pixel <-> graph coordinates', () => {
    for (const col of [0, 20, 47, 94]) {
      expect(graph.xToCol(graph.colToX(col, STANDARD), STANDARD)).toBe(col)
    }
    for (const row of [0, 15, 31, 62]) {
      expect(graph.yToRow(graph.rowToY(row, STANDARD), STANDARD)).toBe(row)
    }
  })
})

describe('graph: pixel buffer', () => {
  it('starts fully cleared and supports set/get', () => {
    const g = graph.createGraphScreen()
    expect(graph.getPixel(g, 0, 0)).toBe(false)
    graph.setPixel(g, 5, 10, true)
    expect(graph.getPixel(g, 5, 10)).toBe(true)
    graph.clearGraphScreen(g)
    expect(graph.getPixel(g, 5, 10)).toBe(false)
  })

  it('ignores out-of-bounds set/get instead of throwing', () => {
    const g = graph.createGraphScreen()
    expect(() => graph.setPixel(g, -1, 500, true)).not.toThrow()
    expect(graph.getPixel(g, -1, 500)).toBe(false)
  })
})

describe('graph: drawing primitives', () => {
  it('draws a horizontal line covering every column', () => {
    const g = graph.createGraphScreen()
    graph.drawLine(g, 10, 0, 10, 20)
    for (let c = 0; c <= 20; c++) expect(graph.getPixel(g, 10, c)).toBe(true)
    expect(graph.getPixel(g, 11, 5)).toBe(false)
  })

  it('draws a vertical line covering every row', () => {
    const g = graph.createGraphScreen()
    graph.drawLine(g, 0, 5, 15, 5)
    for (let r = 0; r <= 15; r++) expect(graph.getPixel(g, r, 5)).toBe(true)
  })

  it('draws a diagonal line from end to end', () => {
    const g = graph.createGraphScreen()
    graph.drawLine(g, 0, 0, 10, 10)
    expect(graph.getPixel(g, 0, 0)).toBe(true)
    expect(graph.getPixel(g, 10, 10)).toBe(true)
    expect(graph.getPixel(g, 5, 5)).toBe(true)
  })

  it('draws a circle whose points are all ~radius from the center', () => {
    const g = graph.createGraphScreen()
    const cr = 31
    const cc = 47
    const radius = 10
    graph.drawCircle(g, cr, cc, radius)
    let litCount = 0
    for (let r = 0; r < graph.GRAPH_ROWS; r++) {
      for (let c = 0; c < graph.GRAPH_COLS; c++) {
        if (graph.getPixel(g, r, c)) {
          litCount++
          const dist = Math.hypot(r - cr, c - cc)
          expect(dist).toBeGreaterThan(radius - 1.5)
          expect(dist).toBeLessThan(radius + 1.5)
        }
      }
    }
    expect(litCount).toBeGreaterThan(0)
  })
})
