import { TIError } from './errors'
import {
  type Value,
  checkFinite,
  list,
  mapNumeric,
  matrix,
  num,
  requireList,
  requireMatrix,
  requireNumber,
  requireString,
  str,
} from './values'
import * as mat from './matrix'

export type AngleMode = 'degree' | 'radian'

export interface BuiltinCtx {
  angleMode: AngleMode
  /** Returns the last key pressed and clears it, mirroring getKey on-calc. */
  takeLastKey: () => number
}

export type Builtin = (args: Value[], ctx: BuiltinCtx) => Value

function toRadians(deg: number, ctx: BuiltinCtx): number {
  return ctx.angleMode === 'degree' ? (deg * Math.PI) / 180 : deg
}
function fromRadians(rad: number, ctx: BuiltinCtx): number {
  return ctx.angleMode === 'degree' ? (rad * 180) / Math.PI : rad
}

function trig(fn: (x: number) => number): Builtin {
  return (args, ctx) => mapNumeric(args[0], (x) => checkFinite(fn(toRadians(x, ctx))))
}
function invTrig(fn: (x: number) => number): Builtin {
  return (args, ctx) => mapNumeric(args[0], (x) => fromRadians(checkFinite(fn(x)), ctx))
}

function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a))
  b = Math.abs(Math.round(b))
  while (b) [a, b] = [b, a % b]
  return a
}

function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0) throw new TIError('ERR:DOMAIN', '! requires a non-negative integer')
  if (n > 69) throw new TIError('ERR:DOMAIN', '! overflowed (n too large)')
  let result = 1
  for (let i = 2; i <= n; i++) result *= i
  return result
}

export { factorial }

export const BUILTINS: Record<string, Builtin> = {
  'sin(': trig(Math.sin),
  'cos(': trig(Math.cos),
  'tan(': trig(Math.tan),
  'sin⁻¹(': invTrig(Math.asin),
  'cos⁻¹(': invTrig(Math.acos),
  'tan⁻¹(': invTrig(Math.atan),
  'ln(': (args) => mapNumeric(args[0], (x) => {
    if (x <= 0) throw new TIError('ERR:DOMAIN', 'ln( requires a positive number')
    return Math.log(x)
  }),
  'log(': (args) => mapNumeric(args[0], (x) => {
    if (x <= 0) throw new TIError('ERR:DOMAIN', 'log( requires a positive number')
    return Math.log10(x)
  }),
  '√(': (args) => mapNumeric(args[0], (x) => {
    if (x < 0) throw new TIError('ERR:DOMAIN', '√( requires a non-negative number (complex numbers are not supported)')
    return Math.sqrt(x)
  }),
  'abs(': (args) => mapNumeric(args[0], Math.abs),
  'round(': (args) => {
    const digitsRaw = args.length > 1 ? requireNumber(args[1], 'a digit count') : 9
    const digits = Math.max(0, Math.min(9, Math.round(digitsRaw)))
    return mapNumeric(args[0], (x) => Number(x.toFixed(digits)))
  },
  'int(': (args) => mapNumeric(args[0], Math.floor),
  'iPart(': (args) => mapNumeric(args[0], Math.trunc),
  'fPart(': (args) => mapNumeric(args[0], (x) => x - Math.trunc(x)),
  'not(': (args) => num(requireNumber(args[0], 'a number') === 0 ? 1 : 0),
  'randInt(': (args) => {
    const low = Math.round(requireNumber(args[0], 'a low bound'))
    const high = Math.round(requireNumber(args[1], 'a high bound'))
    if (high < low) throw new TIError('ERR:DOMAIN', 'randInt( requires low ≤ high')
    const count = args.length > 2 ? Math.round(requireNumber(args[2], 'a count')) : 1
    const gen = () => low + Math.floor(Math.random() * (high - low + 1))
    if (args.length > 2) return list(Array.from({ length: count }, gen))
    return num(gen())
  },
  'min(': (args) => reduceMinMax(args, Math.min),
  'max(': (args) => reduceMinMax(args, Math.max),
  'gcd(': (args) => num(gcd(requireNumber(args[0]), requireNumber(args[1]))),
  'lcm(': (args) => {
    const a = requireNumber(args[0])
    const b = requireNumber(args[1])
    const g = gcd(a, b)
    return num(g === 0 ? 0 : Math.abs(Math.round(a) * Math.round(b)) / g)
  },
  'dim(': (args) => {
    const a = args[0]
    if (a.kind === 'list') return num(a.value.length)
    if (a.kind === 'matrix') {
      const [rows, cols] = mat.dims(a.value)
      return list([rows, cols])
    }
    throw new TIError('ERR:DATA TYPE', 'dim( expects a list or matrix')
  },
  'sum(': (args) => num(requireList(args[0], 'a list').reduce((a, b) => a + b, 0)),
  'augment(': (args) => {
    const [a, b] = args
    if (a.kind === 'list' && b.kind === 'list') return list([...a.value, ...b.value])
    if (a.kind === 'matrix' && b.kind === 'matrix') return matrix(mat.augment(a.value, b.value))
    throw new TIError('ERR:DATA TYPE', 'augment( requires two lists or two matrices')
  },
  'det(': (args) => num(mat.determinant(requireMatrix(args[0]))),
  'Transpose(': (args) => matrix(mat.transpose(requireMatrix(args[0]))),
  'identity(': (args) => matrix(mat.identity(Math.round(requireNumber(args[0], 'a size')))),
  'randM(': (args) => {
    const rows = Math.round(requireNumber(args[0], 'a row count'))
    const cols = Math.round(requireNumber(args[1], 'a column count'))
    return matrix(mat.random(rows, cols))
  },
  'ref(': (args) => matrix(mat.ref(requireMatrix(args[0]))),
  'rref(': (args) => matrix(mat.rref(requireMatrix(args[0]))),
  'rowSwap(': (args) =>
    matrix(mat.rowSwap(requireMatrix(args[0]), requireNumber(args[1], 'a row'), requireNumber(args[2], 'a row'))),
  'row+(': (args) =>
    matrix(mat.rowAdd(requireMatrix(args[0]), requireNumber(args[1], 'a row'), requireNumber(args[2], 'a row'))),
  '*row(': (args) =>
    matrix(mat.scaleRow(requireMatrix(args[1], 'a matrix'), requireNumber(args[0], 'a scale factor'), requireNumber(args[2], 'a row'))),
  '*row+(': (args) =>
    matrix(
      mat.scaleAddRow(
        requireMatrix(args[1], 'a matrix'),
        requireNumber(args[0], 'a scale factor'),
        requireNumber(args[2], 'a row'),
        requireNumber(args[3], 'a row'),
      ),
    ),
  'length(': (args) => num(requireString(args[0], 'a string').length),
  'sub(': (args) => {
    const s = requireString(args[0], 'a string')
    const start = Math.round(requireNumber(args[1], 'a start index'))
    const length = Math.round(requireNumber(args[2], 'a length'))
    if (start < 1 || length < 0 || start + length - 1 > s.length) {
      throw new TIError('ERR:DOMAIN', 'sub( range is outside the string')
    }
    return str(s.slice(start - 1, start - 1 + length))
  },
  getKey: (_args, ctx) => num(ctx.takeLastKey()),
}

function reduceMinMax(args: Value[], fn: (...ns: number[]) => number): Value {
  if (args.length === 1) {
    const values = requireList(args[0], 'a list')
    if (values.length === 0) throw new TIError('ERR:DOMAIN', 'List is empty')
    return num(values.reduce((a, b) => fn(a, b)))
  }
  const [a, b] = args
  if (a.kind === 'list' || b.kind === 'list') {
    const av = a.kind === 'list' ? a.value : [requireNumber(a)]
    const bv = b.kind === 'list' ? b.value : [requireNumber(b)]
    const len = Math.max(av.length, bv.length)
    const out: number[] = []
    for (let i = 0; i < len; i++) out.push(fn(av[i % av.length], bv[i % bv.length]))
    return list(out)
  }
  return num(fn(requireNumber(a), requireNumber(b)))
}
