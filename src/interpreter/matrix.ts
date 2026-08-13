import { TIError } from './errors'

/**
 * Matrix math, kept independent of the `Value`/VM machinery: every function
 * here takes and returns a plain `number[][]` (rows of equal length) and
 * either succeeds or throws a `TIError`. `vm.ts` and `builtins.ts` are the
 * only callers — this module doesn't know about TI-BASIC syntax at all.
 */
export type MatrixData = number[][]

const SINGULAR_TOLERANCE = 1e-12

export function dims(m: MatrixData): [rows: number, cols: number] {
  return [m.length, m.length ? m[0].length : 0]
}

function sameDims(a: MatrixData, b: MatrixData): boolean {
  const [ar, ac] = dims(a)
  const [br, bc] = dims(b)
  return ar === br && ac === bc
}

function clone(m: MatrixData): MatrixData {
  return m.map((row) => [...row])
}

export function add(a: MatrixData, b: MatrixData): MatrixData {
  if (!sameDims(a, b)) throw new TIError('ERR:DIM MISMATCH', 'Matrix addition requires matrices of the same size')
  return a.map((row, i) => row.map((x, j) => x + b[i][j]))
}

export function subtract(a: MatrixData, b: MatrixData): MatrixData {
  if (!sameDims(a, b)) throw new TIError('ERR:DIM MISMATCH', 'Matrix subtraction requires matrices of the same size')
  return a.map((row, i) => row.map((x, j) => x - b[i][j]))
}

export function scale(a: MatrixData, k: number): MatrixData {
  return a.map((row) => row.map((x) => x * k))
}

export function multiply(a: MatrixData, b: MatrixData): MatrixData {
  const [ar, ac] = dims(a)
  const [br, bc] = dims(b)
  if (ac !== br) throw new TIError('ERR:DIM MISMATCH', 'Matrix multiplication requires cols(left) = rows(right)')
  const out: MatrixData = Array.from({ length: ar }, () => Array(bc).fill(0))
  for (let i = 0; i < ar; i++) {
    for (let j = 0; j < bc; j++) {
      let sum = 0
      for (let k = 0; k < ac; k++) sum += a[i][k] * b[k][j]
      out[i][j] = sum
    }
  }
  return out
}

export function transpose(a: MatrixData): MatrixData {
  const [r, c] = dims(a)
  const out: MatrixData = Array.from({ length: c }, () => Array(r).fill(0))
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) out[j][i] = a[i][j]
  return out
}

export function identity(n: number): MatrixData {
  if (!Number.isInteger(n) || n < 1) throw new TIError('ERR:DOMAIN', 'identity( requires a positive integer size')
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)))
}

export function random(rows: number, cols: number): MatrixData {
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    throw new TIError('ERR:DOMAIN', 'randM( requires positive integer dimensions')
  }
  // Real randM( draws random single-digit integers.
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => Math.floor(Math.random() * 19) - 9))
}

export function determinant(a: MatrixData): number {
  const [r, c] = dims(a)
  if (r !== c) throw new TIError('ERR:DIM MISMATCH', 'det( requires a square matrix')
  const m = clone(a)
  let det = 1
  for (let col = 0; col < r; col++) {
    let pivot = col
    for (let row = col + 1; row < r; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row
    }
    if (Math.abs(m[pivot][col]) < SINGULAR_TOLERANCE) return 0
    if (pivot !== col) {
      ;[m[pivot], m[col]] = [m[col], m[pivot]]
      det *= -1
    }
    det *= m[col][col]
    for (let row = col + 1; row < r; row++) {
      const factor = m[row][col] / m[col][col]
      for (let k = col; k < r; k++) m[row][k] -= factor * m[col][k]
    }
  }
  return det
}

/** Gauss-Jordan inversion via an augmented [A | I] matrix. */
export function inverse(a: MatrixData): MatrixData {
  const [r, c] = dims(a)
  if (r !== c) throw new TIError('ERR:DIM MISMATCH', '⁻¹ requires a square matrix')
  const n = r
  const idMat = identity(n)
  const m = a.map((row, i) => [...row, ...idMat[i]])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row
    }
    if (Math.abs(m[pivot][col]) < SINGULAR_TOLERANCE) {
      throw new TIError('ERR:SINGULAR MAT', 'Matrix is singular (has no inverse)')
    }
    if (pivot !== col) [m[pivot], m[col]] = [m[col], m[pivot]]
    const pivotVal = m[col][col]
    for (let k = 0; k < 2 * n; k++) m[col][k] /= pivotVal
    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const factor = m[row][col]
      for (let k = 0; k < 2 * n; k++) m[row][k] -= factor * m[col][k]
    }
  }
  return m.map((row) => row.slice(n))
}

export function augment(a: MatrixData, b: MatrixData): MatrixData {
  const [ar] = dims(a)
  const [br] = dims(b)
  if (ar !== br) throw new TIError('ERR:DIM MISMATCH', 'augment( requires matrices with the same number of rows')
  return a.map((row, i) => [...row, ...b[i]])
}

/** Row echelon form (not fully reduced): Gaussian elimination with partial pivoting. */
export function ref(a: MatrixData): MatrixData {
  const [r, c] = dims(a)
  const m = clone(a)
  let pivotRow = 0
  for (let col = 0; col < c && pivotRow < r; col++) {
    let sel = pivotRow
    for (let row = pivotRow + 1; row < r; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[sel][col])) sel = row
    }
    if (Math.abs(m[sel][col]) < SINGULAR_TOLERANCE) continue
    if (sel !== pivotRow) [m[sel], m[pivotRow]] = [m[pivotRow], m[sel]]
    const pivotVal = m[pivotRow][col]
    for (let k = col; k < c; k++) m[pivotRow][k] /= pivotVal
    for (let row = pivotRow + 1; row < r; row++) {
      const factor = m[row][col]
      for (let k = col; k < c; k++) m[row][k] -= factor * m[pivotRow][k]
    }
    pivotRow++
  }
  return m
}

/** Reduced row echelon form: Gauss-Jordan elimination. */
export function rref(a: MatrixData): MatrixData {
  const [r, c] = dims(a)
  const m = clone(a)
  let pivotRow = 0
  for (let col = 0; col < c && pivotRow < r; col++) {
    let sel = pivotRow
    for (let row = pivotRow + 1; row < r; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[sel][col])) sel = row
    }
    if (Math.abs(m[sel][col]) < SINGULAR_TOLERANCE) continue
    if (sel !== pivotRow) [m[sel], m[pivotRow]] = [m[pivotRow], m[sel]]
    const pivotVal = m[pivotRow][col]
    for (let k = col; k < c; k++) m[pivotRow][k] /= pivotVal
    for (let row = 0; row < r; row++) {
      if (row === pivotRow) continue
      const factor = m[row][col]
      for (let k = col; k < c; k++) m[row][k] -= factor * m[pivotRow][k]
    }
    pivotRow++
  }
  return m
}

function rowIndex(m: MatrixData, row1: number, what: string): number {
  const idx = Math.round(row1) - 1
  if (idx < 0 || idx >= m.length) throw new TIError('ERR:DOMAIN', `${what} ${row1} is out of range`)
  return idx
}

export function rowSwap(a: MatrixData, row1: number, row2: number): MatrixData {
  const m = clone(a)
  const i = rowIndex(m, row1, 'row')
  const j = rowIndex(m, row2, 'row')
  ;[m[i], m[j]] = [m[j], m[i]]
  return m
}

/** row+([A],rowA,rowB): adds rowA into rowB. */
export function rowAdd(a: MatrixData, rowA: number, rowB: number): MatrixData {
  const m = clone(a)
  const i = rowIndex(m, rowA, 'row')
  const j = rowIndex(m, rowB, 'row')
  m[j] = m[j].map((x, k) => x + m[i][k])
  return m
}

/** *row(k,[A],row): scales row by k. */
export function scaleRow(a: MatrixData, k: number, row1: number): MatrixData {
  const m = clone(a)
  const i = rowIndex(m, row1, 'row')
  m[i] = m[i].map((x) => x * k)
  return m
}

/** *row+(k,[A],rowA,rowB): adds k * rowA into rowB. */
export function scaleAddRow(a: MatrixData, k: number, rowA: number, rowB: number): MatrixData {
  const m = clone(a)
  const i = rowIndex(m, rowA, 'row')
  const j = rowIndex(m, rowB, 'row')
  m[j] = m[j].map((x, idx) => x + k * m[i][idx])
  return m
}

export function formatMatrix(m: MatrixData, formatNumber: (n: number) => string): string {
  if (m.length === 0 || m[0].length === 0) return '[]'
  const rowStrs = m.map((row) => `[${row.map(formatNumber).join(' ')}]`)
  return rowStrs.map((r, i) => (i === 0 ? '[' : ' ') + r + (i === rowStrs.length - 1 ? ']' : '')).join('\n')
}
