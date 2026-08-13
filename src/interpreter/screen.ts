/** The TI-84's home-screen text area is 8 rows of 16 characters. */
export const SCREEN_ROWS = 8
export const SCREEN_COLS = 16

export interface Screen {
  rows: string[]
  /** Row (0-based) the next Disp'd line will be written to. */
  cursorRow: number
}

export function createScreen(): Screen {
  return { rows: Array.from({ length: SCREEN_ROWS }, () => ''), cursorRow: 0 }
}

export function clearScreen(screen: Screen): void {
  screen.rows = Array.from({ length: SCREEN_ROWS }, () => '')
  screen.cursorRow = 0
}

function scrollUp(screen: Screen): void {
  screen.rows.shift()
  screen.rows.push('')
}

/** Writes one line, wrapping across multiple rows and scrolling as needed (like Disp). */
export function dispLine(screen: Screen, text: string): void {
  const chunks = text.length === 0 ? [''] : chunkString(text, SCREEN_COLS)
  for (const chunk of chunks) {
    if (screen.cursorRow >= SCREEN_ROWS) {
      scrollUp(screen)
      screen.cursorRow = SCREEN_ROWS - 1
    }
    screen.rows[screen.cursorRow] = chunk
    screen.cursorRow++
  }
}

function chunkString(text: string, size: number): string[] {
  const out: string[] = []
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size))
  return out
}

/** Writes text at a fixed row/col (1-based), used by Output(. Does not scroll or move the Disp cursor. */
export function writeAt(screen: Screen, row1: number, col1: number, text: string): void {
  const row = row1 - 1
  const col = col1 - 1
  const existing = screen.rows[row] ?? ''
  const padded = existing.length < SCREEN_COLS ? existing.padEnd(SCREEN_COLS, ' ') : existing
  const chars = padded.split('')
  for (let i = 0; i < text.length && col + i < SCREEN_COLS; i++) {
    chars[col + i] = text[i]
  }
  screen.rows[row] = chars.join('')
}
