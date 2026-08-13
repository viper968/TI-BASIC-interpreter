import { TIError } from './errors'
import { formatMatrix, type MatrixData } from './matrix'

/** Runtime value types the interpreter operates on. */
export type Value =
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'list'; value: number[] }
  | { kind: 'matrix'; value: MatrixData }

export const num = (value: number): Value => ({ kind: 'number', value })
export const str = (value: string): Value => ({ kind: 'string', value })
export const list = (value: number[]): Value => ({ kind: 'list', value })
export const matrix = (value: MatrixData): Value => ({ kind: 'matrix', value })

/** TI-BASIC truthiness: any nonzero number is true; a 1-element list uses that element. */
export function isTruthy(v: Value): boolean {
  if (v.kind === 'number') return v.value !== 0
  if (v.kind === 'list' && v.value.length === 1) return v.value[0] !== 0
  throw new TIError('ERR:DATA TYPE', `A ${v.kind} cannot be used as a condition`)
}

/** Display-mode settings, mirroring the TI-84's MODE screen (Fix/Float row, Normal/Sci/Eng row). */
export interface NumberFormatOptions {
  /** null/undefined = Float (automatic precision). 0-9 = Fix n (always that many decimal places). */
  fixedDecimals?: number | null
  notation?: 'normal' | 'sci' | 'eng'
}

function trimTrailingZeros(mantissa: string): string {
  return mantissa.includes('.') ? mantissa.replace(/0+$/, '').replace(/\.$/, '') : mantissa
}

function toScientific(n: number, digits: number | null): string {
  const d = digits ?? 9
  const exp = n.toExponential(d)
  const [mantissaRaw, expPart] = exp.split('e')
  const mantissa = digits === null ? trimTrailingZeros(mantissaRaw) : mantissaRaw
  return `${mantissa}E${parseInt(expPart, 10)}`
}

function toEngineering(n: number, digits: number | null): string {
  if (n === 0) return `${(0).toFixed(digits ?? 0)}E0`
  const sign = n < 0 ? -1 : 1
  const abs = Math.abs(n)
  let exp = Math.floor(Math.log10(abs))
  exp -= ((exp % 3) + 3) % 3 // round down to the nearest multiple of 3
  const d = digits ?? 9
  let mantissaStr = ((sign * abs) / Math.pow(10, exp)).toFixed(d)
  if (Math.abs(Number(mantissaStr)) >= 1000) {
    // Rounding pushed the mantissa up a digit (e.g. 999.996 -> 1000.00): renormalize.
    exp += 3
    mantissaStr = ((sign * abs) / Math.pow(10, exp)).toFixed(d)
  }
  return `${digits === null ? trimTrailingZeros(mantissaStr) : mantissaStr}E${exp}`
}

/**
 * Approximates the TI-84's number display formatting, honoring the
 * Fix/Float and Normal/Sci/Eng MODE settings. With no options, this is the
 * default "Float"/"Normal" behavior: up to 10 significant digits,
 * switching to scientific notation for very large or very small magnitudes.
 */
export function formatNumber(n: number, opts: NumberFormatOptions = {}): string {
  const fixedDecimals = opts.fixedDecimals ?? null
  const notation = opts.notation ?? 'normal'

  if (Number.isNaN(n)) return 'NaN'
  if (!Number.isFinite(n)) return n > 0 ? '1E99' : '-1E99'

  if (notation === 'sci') return stripLeadingZero(toScientific(n, fixedDecimals))
  if (notation === 'eng') return stripLeadingZero(toEngineering(n, fixedDecimals))

  // notation === 'normal'
  if (fixedDecimals !== null) {
    const abs = Math.abs(n)
    if (n !== 0 && (abs >= 1e10 || abs < 1e-3)) return stripLeadingZero(toScientific(n, fixedDecimals))
    return stripLeadingZero(n.toFixed(fixedDecimals))
  }
  if (n === 0) return '0'
  const abs = Math.abs(n)
  if (abs >= 1e10 || abs < 1e-3) return stripLeadingZero(toScientific(n, null))
  return stripLeadingZero(String(Number(n.toPrecision(10))))
}

/** TI-84 displays magnitudes under 1 without the leading 0, e.g. ".5" and "-.25". */
function stripLeadingZero(s: string): string {
  return s.replace(/^(-?)0(\.\d)/, '$1$2')
}

export function formatList(values: number[], opts: NumberFormatOptions = {}): string {
  return `{${values.map((v) => formatNumber(v, opts)).join(' ')}}`
}

export function formatValue(v: Value, opts: NumberFormatOptions = {}): string {
  if (v.kind === 'number') return formatNumber(v.value, opts)
  if (v.kind === 'string') return v.value
  if (v.kind === 'matrix') return formatMatrix(v.value, (n) => formatNumber(n, opts))
  return formatList(v.value, opts)
}

/**
 * Approximates a decimal as a fraction p/q via a continued-fraction
 * expansion, the way ►Frac does on-calculator. Bounded so it gives up and
 * returns the decimal's best rational approximation rather than searching
 * forever for numbers that aren't "nice" fractions.
 */
export function toFraction(x: number, maxDenominator = 10000, tolerance = 1e-10): [number, number] {
  const sign = x < 0 ? -1 : 1
  const abs = Math.abs(x)
  let h1 = 1
  let h2 = 0
  let k1 = 0
  let k2 = 1
  let b = abs
  for (let i = 0; i < 64; i++) {
    const a = Math.floor(b)
    const nextH1 = a * h1 + h2
    const nextK1 = a * k1 + k2
    // Stop *before* accepting a convergent whose denominator blows the
    // bound, so the result is the best approximation within the bound
    // rather than the first one that happens to exceed it.
    if (nextK1 > maxDenominator) break
    h2 = h1
    h1 = nextH1
    k2 = k1
    k1 = nextK1
    if (Math.abs(b - a) < tolerance) break
    b = 1 / (b - a)
  }
  return [sign * h1, k1]
}

/**
 * ►Frac: shows a fraction only when one actually reproduces the value (to
 * display precision) within a small denominator — the same spirit as the
 * calculator giving up and leaving an irrational-looking value as a
 * decimal instead of printing a misleading "exact" fraction for it.
 */
export function formatAsFraction(x: number): string {
  if (x === 0) return '0'
  const [numerator, denominator] = toFraction(x)
  if (denominator <= 1) return formatNumber(x)
  const reconstructed = numerator / denominator
  if (Math.abs(reconstructed - x) > Math.max(1e-9, Math.abs(x) * 1e-9)) return formatNumber(x)
  return `${numerator}/${denominator}`
}

/**
 * Applies a binary numeric function to two values, broadcasting a scalar
 * across a list, or zipping two equal-length lists element-wise — the way
 * TI-BASIC's arithmetic operators treat lists.
 */
export function broadcastNumeric(a: Value, b: Value, fn: (x: number, y: number) => number): Value {
  if (a.kind === 'number' && b.kind === 'number') return num(fn(a.value, b.value))
  if (a.kind === 'list' && b.kind === 'number') return list(a.value.map((x) => fn(x, b.value)))
  if (a.kind === 'number' && b.kind === 'list') return list(b.value.map((y) => fn(a.value, y)))
  if (a.kind === 'list' && b.kind === 'list') {
    if (a.value.length !== b.value.length) {
      throw new TIError('ERR:DIM MISMATCH', 'Lists must be the same length')
    }
    return list(a.value.map((x, i) => fn(x, b.value[i])))
  }
  throw new TIError('ERR:DATA TYPE', 'Expected a number or list')
}

/** Applies a unary numeric function to a number or every element of a list. */
export function mapNumeric(a: Value, fn: (x: number) => number): Value {
  if (a.kind === 'number') return num(fn(a.value))
  if (a.kind === 'list') return list(a.value.map(fn))
  throw new TIError('ERR:DATA TYPE', 'Expected a number or list')
}

export function requireNumber(v: Value, what = 'a number'): number {
  if (v.kind !== 'number') throw new TIError('ERR:DATA TYPE', `Expected ${what}`)
  return v.value
}

export function requireString(v: Value, what = 'a string'): string {
  if (v.kind !== 'string') throw new TIError('ERR:DATA TYPE', `Expected ${what}`)
  return v.value
}

export function requireList(v: Value, what = 'a list'): number[] {
  if (v.kind !== 'list') throw new TIError('ERR:DATA TYPE', `Expected ${what}`)
  return v.value
}

export function requireMatrix(v: Value, what = 'a matrix'): MatrixData {
  if (v.kind !== 'matrix') throw new TIError('ERR:DATA TYPE', `Expected ${what}`)
  return v.value
}

/** Throws ERR:DOMAIN if a math operation produced a non-finite result. */
export function checkFinite(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) throw new TIError('ERR:DOMAIN', 'Result is undefined for that input')
  return n
}
