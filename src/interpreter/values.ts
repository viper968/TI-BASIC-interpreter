import { TIError } from './errors'

/** Runtime value types the interpreter operates on. */
export type Value =
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'list'; value: number[] }

export const num = (value: number): Value => ({ kind: 'number', value })
export const str = (value: string): Value => ({ kind: 'string', value })
export const list = (value: number[]): Value => ({ kind: 'list', value })

/** TI-BASIC truthiness: any nonzero number is true; a 1-element list uses that element. */
export function isTruthy(v: Value): boolean {
  if (v.kind === 'number') return v.value !== 0
  if (v.kind === 'list' && v.value.length === 1) return v.value[0] !== 0
  throw new TIError('ERR:DATA TYPE', `A ${v.kind} cannot be used as a condition`)
}

/**
 * Approximates the TI-84's default "Float" display formatting: up to 10
 * significant digits, switching to scientific notation for very large or
 * very small magnitudes.
 */
export function formatNumber(n: number): string {
  if (Number.isNaN(n)) return 'NaN'
  if (!Number.isFinite(n)) return n > 0 ? '1E99' : '-1E99'
  if (n === 0) return '0'
  const abs = Math.abs(n)
  const useSci = abs >= 1e10 || abs < 1e-3
  if (useSci) {
    const exp = n.toExponential(9)
    const [mantissaRaw, expPart] = exp.split('e')
    const mantissa = mantissaRaw.includes('.') ? mantissaRaw.replace(/0+$/, '').replace(/\.$/, '') : mantissaRaw
    return `${mantissa}E${parseInt(expPart, 10)}`
  }
  const rounded = Number(n.toPrecision(10))
  return String(rounded)
}

export function formatList(values: number[]): string {
  return `{${values.map(formatNumber).join(' ')}}`
}

export function formatValue(v: Value): string {
  if (v.kind === 'number') return formatNumber(v.value)
  if (v.kind === 'string') return v.value
  return formatList(v.value)
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

/** Throws ERR:DOMAIN if a math operation produced a non-finite result. */
export function checkFinite(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) throw new TIError('ERR:DOMAIN', 'Result is undefined for that input')
  return n
}
