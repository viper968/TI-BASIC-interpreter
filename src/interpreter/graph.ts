/**
 * The graph screen's pixel model and graph-coordinate math, kept
 * independent of the VM (mirrors `matrix.ts`/`stats.ts`): everything here
 * is either a plain pixel-buffer operation or a pure coordinate-mapping
 * function. `vm.ts` is the only caller.
 *
 * The TI-83/84 (non-CE) graph screen addresses pixels as row 0-62
 * (top-to-bottom) by column 0-94 (left-to-right) — 63×95 — independent of
 * the 8×16 text screen used by `screen.ts`.
 */

export const GRAPH_ROWS = 63 // rows 0-62
export const GRAPH_COLS = 95 // cols 0-94

export interface GraphScreen {
  /** true = pixel lit. Indexed [row][col]. */
  pixels: boolean[][]
}

export function createGraphScreen(): GraphScreen {
  return { pixels: Array.from({ length: GRAPH_ROWS }, () => Array(GRAPH_COLS).fill(false)) }
}

export function clearGraphScreen(g: GraphScreen): void {
  for (const row of g.pixels) row.fill(false)
}

export function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < GRAPH_ROWS && col >= 0 && col < GRAPH_COLS
}

export function setPixel(g: GraphScreen, row: number, col: number, on: boolean): void {
  if (inBounds(row, col)) g.pixels[row][col] = on
}

export function getPixel(g: GraphScreen, row: number, col: number): boolean {
  return inBounds(row, col) && g.pixels[row][col]
}

export interface Window {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

/** Graph x-coordinate -> pixel column (0-94), per the window. */
export function xToCol(x: number, w: Window): number {
  return Math.round(((x - w.xMin) * (GRAPH_COLS - 1)) / (w.xMax - w.xMin))
}

/** Graph y-coordinate -> pixel row (0-62, top-to-bottom), per the window. */
export function yToRow(y: number, w: Window): number {
  return Math.round(((w.yMax - y) * (GRAPH_ROWS - 1)) / (w.yMax - w.yMin))
}

/** Pixel column -> graph x-coordinate, per the window. */
export function colToX(col: number, w: Window): number {
  return w.xMin + (col * (w.xMax - w.xMin)) / (GRAPH_COLS - 1)
}

/** Pixel row -> graph y-coordinate, per the window. */
export function rowToY(row: number, w: Window): number {
  return w.yMax - (row * (w.yMax - w.yMin)) / (GRAPH_ROWS - 1)
}

/** Bresenham's line algorithm, plotting every pixel from (r0,c0) to (r1,c1). */
export function drawLine(g: GraphScreen, r0: number, c0: number, r1: number, c1: number, on = true): void {
  let x0 = c0
  let y0 = r0
  const x1 = c1
  const y1 = r1
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  for (;;) {
    setPixel(g, y0, x0, on)
    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x0 += sx
    }
    if (e2 <= dx) {
      err += dx
      y0 += sy
    }
  }
}

/** Midpoint circle algorithm, plotting the outline centered at (rCenter,cCenter). */
export function drawCircle(g: GraphScreen, rCenter: number, cCenter: number, radiusPx: number, on = true): void {
  let x = radiusPx
  let y = 0
  let err = 0
  while (x >= y) {
    const points: [number, number][] = [
      [rCenter + y, cCenter + x],
      [rCenter + x, cCenter + y],
      [rCenter + x, cCenter - y],
      [rCenter + y, cCenter - x],
      [rCenter - y, cCenter - x],
      [rCenter - x, cCenter - y],
      [rCenter - x, cCenter + y],
      [rCenter - y, cCenter + x],
    ]
    for (const [r, c] of points) setPixel(g, r, c, on)
    y += 1
    if (err <= 0) {
      err += 2 * y + 1
    }
    if (err > 0) {
      x -= 1
      err -= 2 * x + 1
    }
  }
}
