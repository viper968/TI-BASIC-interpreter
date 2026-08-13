import type { Diagnostic, TIErrorCode } from './errors'
import { TIError } from './errors'
import type { BinaryOp, Expr, Instruction, Stmt, StoreTarget } from './ast'
import { link as linkProgram, type LinkInfo, type LinkedProgram } from './linker'
import { parse } from './parser'
import {
  type NumberFormatOptions,
  type Value,
  broadcastNumeric,
  checkFinite,
  checkFiniteComplex,
  complex,
  formatAsFraction,
  formatValue,
  isTruthy,
  list,
  mapNumeric,
  matrix,
  num,
  requireList,
  requireMatrix,
  requireNumber,
  requireString,
  str,
  toComplex,
} from './values'
import * as mat from './matrix'
import * as stats from './stats'
import * as cplx from './complex'
import type { Complex } from './complex'
import { BUILTINS, type AngleMode, type BuiltinCtx, factorial } from './builtins'
import { SCREEN_COLS, SCREEN_ROWS, type Screen, clearScreen, createScreen, dispLine, writeAt } from './screen'
import { RESERVED_VAR_NAMES } from './commands'
import {
  GRAPH_COLS,
  GRAPH_ROWS,
  type GraphScreen,
  type Window,
  clearGraphScreen,
  colToX,
  createGraphScreen,
  drawCircle,
  drawLine,
  getPixel,
  setPixel,
  xToCol,
  yToRow,
} from './graph'

// ---------------------------------------------------------------------------
// Compilation
// ---------------------------------------------------------------------------

export interface CompiledProgram {
  source: string
  linked: LinkedProgram
  diagnostics: Diagnostic[]
}

export function compileProgram(source: string): CompiledProgram {
  const { program, diagnostics: parseDiagnostics } = parse(source)
  const linked = linkProgram(program)
  return { source, linked, diagnostics: [...parseDiagnostics, ...linked.diagnostics] }
}

// ---------------------------------------------------------------------------
// Interpreter state (the calculator's global variable memory + screen)
// ---------------------------------------------------------------------------

const REAL_VAR_NAMES = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'θ']
const STR_VAR_NAMES = Array.from({ length: 10 }, (_, i) => `Str${i}`)
const LIST_NAMES = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6']
const MATRIX_NAMES = [...'ABCDEFGHIJ']
const YVAR_NAMES = Array.from({ length: 10 }, (_, i) => `Y${i}`)

/** A Plot1(/Plot2(/Plot3( configuration, drawn onto the graph screen by DispGraph alongside the Y= functions. */
export interface PlotConfig {
  enabled: boolean
  plotType: 'scatter' | 'xyline' | 'histogram' | 'boxplot'
  xList: string
  yList: string | null
  freqList: string | null
}

function defaultPlotConfig(): PlotConfig {
  return { enabled: false, plotType: 'scatter', xList: 'L1', yList: 'L2', freqList: null }
}

export interface InterpreterState {
  vars: Record<string, number>
  strVars: Record<string, string>
  lists: Record<string, number[]>
  matrices: Record<string, number[][]>
  /** Y0-Y9 function definitions, as raw (unparsed) expression text; '' = undefined. */
  yVars: Record<string, string>
  /** The 95x63 graph pixel buffer drawn by DispGraph/ClrDraw/Line(/Circle(/Pxl-*. */
  graphScreen: GraphScreen
  /** Plot1(/Plot2(/Plot3( configuration, indices 0-2. */
  plots: [PlotConfig, PlotConfig, PlotConfig]
  ans: Value
  angleMode: AngleMode
  /** MODE screen: Normal/Sci/Eng notation. */
  notation: 'normal' | 'sci' | 'eng'
  /** MODE screen: null = Float (automatic), 0-9 = Fix n. */
  fixedDecimals: number | null
  /** MODE screen: Real/a+bi/re^θi. Real (this interpreter's default) blocks operations that would produce a non-real result from real inputs, e.g. √(-1). */
  complexMode: 'real' | 'rect' | 'polar'
  /**
   * A-Z/θ hold a plain number in `vars`; a variable currently holding a
   * *complex* value additionally gets an entry here (with `vars[name]` kept
   * in sync to its real part, for any code path that reads `vars` directly).
   * Sparse by design: most variables never hold a complex value.
   */
  complexVars: Record<string, Complex>
  screen: Screen
  lastKey: number
}

export function createInterpreterState(): InterpreterState {
  const vars: Record<string, number> = {}
  for (const n of REAL_VAR_NAMES) vars[n] = 0
  for (const n of RESERVED_VAR_NAMES) vars[n] = 0
  // Graph window variable defaults, matching a freshly-reset TI-84.
  vars['Xmin'] = -10
  vars['Xmax'] = 10
  vars['Xscl'] = 1
  vars['Ymin'] = -10
  vars['Ymax'] = 10
  vars['Yscl'] = 1
  vars['Xres'] = 1
  // Euler's number defaults here (it's just an ordinary variable), so e.g.
  // QuartReg's 5th coefficient can genuinely overwrite it, matching a
  // well-known real-hardware quirk.
  vars['e'] = Math.E
  const strVars: Record<string, string> = {}
  for (const n of STR_VAR_NAMES) strVars[n] = ''
  const lists: Record<string, number[]> = {}
  for (const n of LIST_NAMES) lists[n] = []
  const matrices: Record<string, number[][]> = {}
  for (const n of MATRIX_NAMES) matrices[n] = []
  const yVars: Record<string, string> = {}
  for (const n of YVAR_NAMES) yVars[n] = ''
  return {
    vars,
    strVars,
    lists,
    matrices,
    yVars,
    graphScreen: createGraphScreen(),
    plots: [defaultPlotConfig(), defaultPlotConfig(), defaultPlotConfig()],
    ans: num(0),
    angleMode: 'degree',
    notation: 'normal',
    fixedDecimals: null,
    complexMode: 'real',
    complexVars: {},
    screen: createScreen(),
    lastKey: 0,
  }
}

// ---------------------------------------------------------------------------
// Run-loop event protocol
// ---------------------------------------------------------------------------

export type RunEvent =
  | { type: 'tick' }
  | { type: 'input'; prompt: string | null; invalid?: boolean }
  | { type: 'menu'; title: string; options: { text: string; label: string }[] }
  | { type: 'pause' }
  | { type: 'done' }
  | { type: 'error'; error: TIError }

export type ResumeValue = string | number | undefined

type StmtResult =
  | { kind: 'next' }
  | { kind: 'jump'; index: number }
  | { kind: 'call'; name: string }
  | { kind: 'return' }
  | { kind: 'stop' }

interface Frame {
  compiled: CompiledProgram
  ip: number
  loopState: Map<number, { varName: string; end: number; step: number }>
}

const MAX_STEPS = 4_000_000
const MAX_CALL_DEPTH = 60

/** Resolves the source of another stored program, for `prgmNAME` calls. */
export type ProgramResolver = (name: string) => string | undefined

/**
 * Internal signal for "what was typed isn't even a valid expression" during
 * Input/Prompt — distinct from a TIError so the caller can choose to
 * re-prompt instead of ending the program, the way real hardware does.
 * Once the text DOES parse, any error while evaluating it (divide by zero,
 * wrong type for the target, ...) is a real TIError and ends the program
 * like any other runtime error.
 */
class InvalidEntrySignal extends Error {}

class Runner {
  private cache = new Map<string, CompiledProgram>()
  private steps = 0
  private state: InterpreterState
  private resolveProgram: ProgramResolver

  constructor(state: InterpreterState, resolveProgram: ProgramResolver) {
    this.state = state
    this.resolveProgram = resolveProgram
  }

  private builtinCtx(): BuiltinCtx {
    return {
      angleMode: this.state.angleMode,
      takeLastKey: () => {
        const k = this.state.lastKey
        this.state.lastKey = 0
        return k
      },
      maybeComplex: (re, im) => this.maybeComplexResult({ re, im }),
    }
  }

  private numberFormatOpts(): NumberFormatOptions {
    return {
      fixedDecimals: this.state.fixedDecimals,
      notation: this.state.notation,
      complexMode: this.state.complexMode,
      angleMode: this.state.angleMode,
    }
  }

  /** Sets a real variable directly (loop counters, X during graphing, ...), clearing any stale complex value. */
  private setRealVar(name: string, value: number): void {
    this.state.vars[name] = value
    delete this.state.complexVars[name]
  }

  /**
   * Wraps a Complex as a Value, collapsing to a plain number when the
   * imaginary part is exactly 0. Used whenever an operand was already
   * complex (arithmetic between complex numbers, functions of a complex
   * argument, ...), so there's no real-to-complex domain crossing to gate.
   */
  private complexResult(c: Complex): Value {
    checkFiniteComplex(c)
    if (c.im === 0) return num(c.re)
    return complex(c.re, c.im)
  }

  /**
   * Like `complexResult`, but for a result computed from purely real inputs
   * that turned out non-real (e.g. √(-4), or a negative base to a
   * fractional power). Gated by the calculator's complex mode, matching
   * real hardware: Real mode (the default) raises ERR:NONREAL ANS instead
   * of silently returning a complex number.
   */
  private maybeComplexResult(c: Complex): Value {
    checkFiniteComplex(c)
    if (c.im === 0) return num(c.re)
    if (this.state.complexMode === 'real') {
      throw new TIError('ERR:NONREAL ANS', 'Result is a complex number; switch out of Real mode (a+bi or re^θi) to allow this')
    }
    return complex(c.re, c.im)
  }

  private dispValue(v: Value) {
    // A matrix formats to multiple lines (one row per line); split and
    // Disp each so it wraps/scrolls the same as separate Disp calls would.
    for (const line of formatValue(v, this.numberFormatOpts()).split('\n')) {
      dispLine(this.state.screen, line)
    }
  }

  private resolveCompiled(name: string): CompiledProgram {
    const cached = this.cache.get(name)
    if (cached) return cached
    const source = this.resolveProgram(name)
    if (source === undefined) throw new TIError('ERR:UNDEFINED', `prgm${name} was not found`)
    const compiled = compileProgram(source)
    this.cache.set(name, compiled)
    return compiled
  }

  // --- Expressions -----------------------------------------------------

  evalExpr(expr: Expr): Value {
    switch (expr.type) {
      case 'Number':
        return num(expr.value)
      case 'String':
        return str(expr.value)
      case 'Var': {
        const c = this.state.complexVars[expr.name]
        if (c) return complex(c.re, c.im)
        return num(this.state.vars[expr.name] ?? 0)
      }
      case 'List':
        return list([...(this.state.lists[expr.name] ?? [])])
      case 'ListElement': {
        const arr = this.state.lists[expr.name] ?? []
        const idx = Math.round(requireNumber(this.evalExpr(expr.index), 'a list index'))
        if (idx < 1 || idx > arr.length) {
          throw new TIError('ERR:INVALID DIM', `${expr.name}(${idx}) is out of range`)
        }
        return num(arr[idx - 1])
      }
      case 'StrVar':
        return str(this.state.strVars[expr.name] ?? '')
      case 'Ans':
        return this.state.ans
      case 'Pi':
        return num(Math.PI)
      case 'Unary': {
        const v = this.evalExpr(expr.operand)
        if (v.kind === 'complex') return complex(-v.re, -v.im)
        return mapNumeric(v, (x) => -x)
      }
      case 'Binary': {
        const l = this.evalExpr(expr.left)
        const r = this.evalExpr(expr.right)
        return this.evalBinary(expr.op, l, r)
      }
      case 'Postfix':
        return this.evalPostfix(expr.op, expr.operand)
      case 'Call':
        return this.evalCall(expr.name, expr.args)
      case 'ListLiteral':
        return list(expr.elements.map((e) => requireNumber(this.evalExpr(e), 'a number in a list literal')))
      case 'Matrix':
        return matrix((this.state.matrices[expr.name] ?? []).map((row) => [...row]))
      case 'MatrixElement': {
        const m = this.state.matrices[expr.name] ?? []
        const row = Math.round(requireNumber(this.evalExpr(expr.row), 'a row index'))
        const col = Math.round(requireNumber(this.evalExpr(expr.col), 'a column index'))
        const [rows, cols] = mat.dims(m)
        if (row < 1 || row > rows || col < 1 || col > cols) {
          throw new TIError('ERR:INVALID DIM', `[${expr.name}](${row},${col}) is out of range`)
        }
        return num(m[row - 1][col - 1])
      }
      case 'MatrixLiteral':
        return matrix(expr.rows.map((row) => row.map((e) => requireNumber(this.evalExpr(e), 'a number in a matrix literal'))))
      case 'YCall': {
        const def = this.state.yVars[expr.name]
        if (!def) throw new TIError('ERR:UNDEFINED', `${expr.name} is not defined`)
        const x = requireNumber(this.evalExpr(expr.arg), 'a number')
        // Real hardware permanently sets X when a Y-variable is evaluated; we match that quirk.
        this.setRealVar('X', x)
        return this.evalExpr(this.parseYVarDef(expr.name, def))
      }
      case 'Imaginary':
        return complex(0, 1)
    }
  }

  /** Parses a Y-variable's stored definition text as a single expression. */
  private parseYVarDef(name: string, text: string): Expr {
    const { program, diagnostics } = parse(text)
    const first = program.instructions[0]?.stmt
    if (diagnostics.length > 0 || program.instructions.length !== 1 || !first || first.kind !== 'Expr') {
      throw new TIError('ERR:SYNTAX', `${name} is not a valid expression`)
    }
    return first.expr
  }

  /**
   * Evaluates a Y-variable's definition at x, outside of any running
   * program. Not private: this is the one method GUI features (the Graph
   * tab's trace cursor) call directly, for a one-off evaluation against a
   * snapshot of interpreter state — see `evalYVarAt` below.
   */
  evalYVariable(name: string, x: number): number {
    const def = this.state.yVars[name]
    if (!def) throw new TIError('ERR:UNDEFINED', `${name} is not defined`)
    this.setRealVar('X', x)
    return requireNumber(this.evalExpr(this.parseYVarDef(name, def)), 'a number')
  }

  /** The current graph window, read from the Xmin/Xmax/Ymin/Ymax variables. */
  private window(): Window {
    return {
      xMin: this.state.vars['Xmin'],
      xMax: this.state.vars['Xmax'],
      yMin: this.state.vars['Ymin'],
      yMax: this.state.vars['Ymax'],
    }
  }

  /**
   * Draws every enabled Plot1(/Plot2(/Plot3( onto the graph screen, called
   * by DispGraph after the Y= functions. No Mark-style selection (see
   * README): Scatter/xyLine points always draw as a small 3x3 box.
   */
  private renderPlots(w: Window): void {
    const g = this.state.graphScreen
    for (const plot of this.state.plots) {
      if (!plot.enabled) continue
      const xs = this.state.lists[plot.xList] ?? []
      if (xs.length === 0) continue
      if (plot.plotType === 'scatter' || plot.plotType === 'xyline') {
        const ys = plot.yList ? (this.state.lists[plot.yList] ?? []) : []
        const n = Math.min(xs.length, ys.length)
        let prevRow: number | null = null
        let prevCol: number | null = null
        for (let i = 0; i < n; i++) {
          const row = yToRow(ys[i], w)
          const col = xToCol(xs[i], w)
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) setPixel(g, row + dr, col + dc, true)
          if (plot.plotType === 'xyline' && prevRow !== null && prevCol !== null) drawLine(g, prevRow, prevCol, row, col)
          prevRow = row
          prevCol = col
        }
      } else if (plot.plotType === 'histogram') {
        const freq = plot.freqList ? this.state.lists[plot.freqList] : undefined
        const binWidth = this.state.vars['Xscl'] || 1
        const bins = new Map<number, number>()
        xs.forEach((x, i) => {
          const bin = Math.floor((x - w.xMin) / binWidth)
          bins.set(bin, (bins.get(bin) ?? 0) + (freq ? freq[i] : 1))
        })
        const zeroRow = Math.min(GRAPH_ROWS - 1, Math.max(0, yToRow(0, w)))
        for (const [bin, count] of bins) {
          const colStart = Math.max(0, xToCol(w.xMin + bin * binWidth, w))
          const colEnd = Math.min(GRAPH_COLS - 1, xToCol(w.xMin + (bin + 1) * binWidth, w))
          const topRow = Math.min(GRAPH_ROWS - 1, Math.max(0, yToRow(count, w)))
          for (let col = colStart; col <= colEnd; col++) {
            for (let row = Math.min(topRow, zeroRow); row <= Math.max(topRow, zeroRow); row++) setPixel(g, row, col, true)
          }
        }
      } else {
        // boxplot: a horizontal box-and-whisker diagram of the five-number summary.
        const freq = plot.freqList ? this.state.lists[plot.freqList] : undefined
        const q = stats.quartiles(stats.sortedExpand(xs, freq))
        const midRow = Math.floor(GRAPH_ROWS / 2)
        const colMin = xToCol(q.min, w)
        const colQ1 = xToCol(q.q1, w)
        const colMed = xToCol(q.med, w)
        const colQ3 = xToCol(q.q3, w)
        const colMax = xToCol(q.max, w)
        drawLine(g, midRow, colMin, midRow, colQ1)
        drawLine(g, midRow, colQ3, midRow, colMax)
        drawLine(g, midRow - 3, colQ1, midRow - 3, colQ3)
        drawLine(g, midRow + 3, colQ1, midRow + 3, colQ3)
        for (let row = midRow - 3; row <= midRow + 3; row++) {
          setPixel(g, row, colQ1, true)
          setPixel(g, row, colQ3, true)
          setPixel(g, row, colMed, true)
        }
      }
    }
  }

  private evalBinary(op: BinaryOp, l: Value, r: Value): Value {
    if (l.kind === 'matrix' || r.kind === 'matrix') return this.evalMatrixBinary(op, l, r)
    if (op === '^') return this.evalPower(l, r)
    if (l.kind === 'complex' || r.kind === 'complex') return this.evalComplexBinary(op, l, r)
    switch (op) {
      case '+':
        if (l.kind === 'string' || r.kind === 'string') {
          return str(requireString(l, 'a string') + requireString(r, 'a string'))
        }
        return broadcastNumeric(l, r, (a, b) => checkFinite(a + b))
      case '-':
        return broadcastNumeric(l, r, (a, b) => checkFinite(a - b))
      case '*':
        return broadcastNumeric(l, r, (a, b) => checkFinite(a * b))
      case '/':
        return broadcastNumeric(l, r, (a, b) => {
          if (b === 0) throw new TIError('ERR:DIVIDE BY 0', 'Cannot divide by 0')
          return checkFinite(a / b)
        })
      case '=':
      case '≠': {
        if (l.kind === 'string' && r.kind === 'string') {
          const eq = l.value === r.value
          return num((op === '=' ? eq : !eq) ? 1 : 0)
        }
        return broadcastNumeric(l, r, (a, b) => (op === '=' ? (a === b ? 1 : 0) : a !== b ? 1 : 0))
      }
      case '<':
        return broadcastNumeric(l, r, (a, b) => (a < b ? 1 : 0))
      case '>':
        return broadcastNumeric(l, r, (a, b) => (a > b ? 1 : 0))
      case '≤':
        return broadcastNumeric(l, r, (a, b) => (a <= b ? 1 : 0))
      case '≥':
        return broadcastNumeric(l, r, (a, b) => (a >= b ? 1 : 0))
      case 'and':
        return num(isTruthy(l) && isTruthy(r) ? 1 : 0)
      case 'or':
        return num(isTruthy(l) || isTruthy(r) ? 1 : 0)
      case 'xor':
        return num(isTruthy(l) !== isTruthy(r) ? 1 : 0)
      case 'nCr':
      case 'nPr': {
        const n = Math.round(requireNumber(l, 'a number'))
        const r2 = Math.round(requireNumber(r, 'a number'))
        if (n < 0 || r2 < 0 || r2 > n) throw new TIError('ERR:DOMAIN', `${op} requires 0 ≤ r ≤ n`)
        return num(op === 'nCr' ? factorial(n) / (factorial(r2) * factorial(n - r2)) : factorial(n) / factorial(n - r2))
      }
      default:
        throw new TIError('ERR:SYNTAX', `Unsupported operator ${op}`)
    }
  }

  /**
   * ^ for two non-matrix operands. A single formula (a^b = e^(b·ln(a)),
   * via complex.ts) covers every case that can go non-real — a negative
   * real base with a fractional exponent, a complex base, a complex
   * exponent — so there's only one code path to gate on complex mode,
   * rather than one per case.
   */
  private evalPower(l: Value, r: Value): Value {
    if (l.kind === 'list' || r.kind === 'list') {
      return broadcastNumeric(l, r, (a, b) => checkFinite(Math.pow(a, b)))
    }
    if (l.kind === 'complex' || r.kind === 'complex') {
      const lc = toComplex(l, 'a number or complex number')
      const rc = toComplex(r, 'a number or complex number')
      return this.complexResult(cplx.pow(lc, rc))
    }
    const b = requireNumber(l, 'a number')
    const e = requireNumber(r, 'a number')
    if (b >= 0 || Number.isInteger(e)) return num(checkFinite(Math.pow(b, e)))
    // A negative base with a non-integer exponent has no real result.
    return this.maybeComplexResult(cplx.pow({ re: b, im: 0 }, { re: e, im: 0 }))
  }

  /** +, -, *, /, =, ≠ when at least one operand is complex (arithmetic on an already-complex value is always allowed, regardless of complex mode). */
  private evalComplexBinary(op: BinaryOp, l: Value, r: Value): Value {
    const lc = toComplex(l, 'a number or complex number')
    const rc = toComplex(r, 'a number or complex number')
    switch (op) {
      case '+':
        return this.complexResult(cplx.add(lc, rc))
      case '-':
        return this.complexResult(cplx.sub(lc, rc))
      case '*':
        return this.complexResult(cplx.mul(lc, rc))
      case '/':
        return this.complexResult(cplx.div(lc, rc))
      case '=':
      case '≠': {
        const eq = lc.re === rc.re && lc.im === rc.im
        return num((op === '=' ? eq : !eq) ? 1 : 0)
      }
      default:
        throw new TIError('ERR:DATA TYPE', `"${op}" is not supported for complex numbers`)
    }
  }

  /** +, -, *, /, ^ when at least one operand is a matrix. */
  private evalMatrixBinary(op: BinaryOp, l: Value, r: Value): Value {
    switch (op) {
      case '+':
        return matrix(mat.add(requireMatrix(l, 'a matrix'), requireMatrix(r, 'a matrix')))
      case '-':
        return matrix(mat.subtract(requireMatrix(l, 'a matrix'), requireMatrix(r, 'a matrix')))
      case '*':
        if (l.kind === 'matrix' && r.kind === 'matrix') return matrix(mat.multiply(l.value, r.value))
        if (l.kind === 'matrix' && r.kind === 'number') return matrix(mat.scale(l.value, r.value))
        if (l.kind === 'number' && r.kind === 'matrix') return matrix(mat.scale(r.value, l.value))
        throw new TIError('ERR:DATA TYPE', 'A matrix can only be multiplied by a matrix or a number')
      case '/':
        if (l.kind === 'matrix' && r.kind === 'number') {
          if (r.value === 0) throw new TIError('ERR:DIVIDE BY 0', 'Cannot divide by 0')
          return matrix(mat.scale(l.value, 1 / r.value))
        }
        throw new TIError('ERR:DATA TYPE', 'A matrix can only be divided by a number')
      case '^': {
        const m = requireMatrix(l, 'a matrix')
        const exp = Math.round(requireNumber(r, 'an integer exponent'))
        if (exp === -1) return matrix(mat.inverse(m))
        const [rows, cols] = mat.dims(m)
        if (rows !== cols) throw new TIError('ERR:DIM MISMATCH', 'Matrix exponentiation requires a square matrix')
        if (exp < 0) {
          throw new TIError('ERR:DOMAIN', 'A matrix exponent must be a non-negative integer, or -1 for the inverse')
        }
        let result = mat.identity(rows)
        for (let i = 0; i < exp; i++) result = mat.multiply(result, m)
        return matrix(result)
      }
      default:
        throw new TIError('ERR:DATA TYPE', `"${op}" is not supported for matrices`)
    }
  }

  private evalPostfix(op: '²' | '⁻¹' | '!' | '►Frac' | '►Dec', operand: Expr): Value {
    const v = this.evalExpr(operand)
    if (v.kind === 'matrix') {
      if (op === '²') return matrix(mat.multiply(v.value, v.value))
      if (op === '⁻¹') return matrix(mat.inverse(v.value))
      throw new TIError('ERR:DATA TYPE', `"${op}" is not supported for matrices`)
    }
    if (v.kind === 'complex') {
      if (op === '²') return this.complexResult(cplx.mul(v, v))
      if (op === '⁻¹') return this.complexResult(cplx.div({ re: 1, im: 0 }, v))
      throw new TIError('ERR:DATA TYPE', `"${op}" is not supported for complex numbers`)
    }
    if (op === '²') return mapNumeric(v, (x) => checkFinite(x * x))
    if (op === '⁻¹') {
      return mapNumeric(v, (x) => {
        if (x === 0) throw new TIError('ERR:DIVIDE BY 0', 'Cannot divide by 0')
        return checkFinite(1 / x)
      })
    }
    if (op === '!') return mapNumeric(v, factorial)
    if (op === '►Frac') return str(formatAsFraction(requireNumber(v, 'a number')))
    // ►Dec: pass a number through unchanged, or parse a "n/d" ►Frac result back to decimal.
    if (v.kind === 'number') return v
    if (v.kind === 'string') {
      const m = /^(-?\d+)\/(\d+)$/.exec(v.value.trim())
      if (m) return num(Number(m[1]) / Number(m[2]))
    }
    throw new TIError('ERR:DATA TYPE', '►Dec requires a number or a "n/d" fraction')
  }

  private evalCall(name: string, argExprs: Expr[]): Value {
    if (name === 'seq(') return this.evalSeq(argExprs)
    if (name === 'pxl-Test(') return this.evalPxlTest(argExprs)
    if (name === 'nDeriv(') return this.evalNDeriv(argExprs)
    if (name === 'fnInt(') return this.evalFnInt(argExprs)
    if (name === 'fMin(') return this.evalExtremum(argExprs, 'min')
    if (name === 'fMax(') return this.evalExtremum(argExprs, 'max')
    if (name === 'solve(') return this.evalSolve(argExprs)
    const fn = BUILTINS[name]
    if (!fn) throw new TIError('ERR:SYNTAX', `Unknown function ${name}`)
    return fn(argExprs.map((a) => this.evalExpr(a)), this.builtinCtx())
  }

  /** Reads a Call argument that must be a bare variable, e.g. nDeriv(expr,X,3)'s "X". */
  private requireVarArg(e: Expr, fnName: string): string {
    if (e.type !== 'Var') throw new TIError('ERR:DATA TYPE', `${fnName} requires a variable as its 2nd argument`)
    return e.name
  }

  /** Evaluates expr with varName temporarily bound to x — the shared building block for the calculus tools below. */
  private evalScalarAt(expr: Expr, varName: string, x: number): number {
    this.setRealVar(varName, x)
    return requireNumber(this.evalExpr(expr), 'a number')
  }

  /** Numerical derivative via the symmetric difference quotient, default step H=0.001. */
  private evalNDeriv(argExprs: Expr[]): Value {
    if (argExprs.length < 3) throw new TIError('ERR:ARGUMENT', 'nDeriv( requires expr,var,value[,H]')
    const [exprArg, varArg, valueArg, hArg] = argExprs
    const varName = this.requireVarArg(varArg, 'nDeriv(')
    const x = requireNumber(this.evalExpr(valueArg), 'a value')
    const h = hArg ? requireNumber(this.evalExpr(hArg), 'a step size') : 1e-3
    if (h <= 0) throw new TIError('ERR:DOMAIN', 'nDeriv( step size H must be positive')
    const fPlus = this.evalScalarAt(exprArg, varName, x + h)
    const fMinus = this.evalScalarAt(exprArg, varName, x - h)
    return num(checkFinite((fPlus - fMinus) / (2 * h)))
  }

  /** Numerical integral via Simpson's rule over 200 subintervals. */
  private evalFnInt(argExprs: Expr[]): Value {
    if (argExprs.length < 4) throw new TIError('ERR:ARGUMENT', 'fnInt( requires expr,var,lower,upper[,tolerance]')
    const [exprArg, varArg, lowerArg, upperArg] = argExprs
    const varName = this.requireVarArg(varArg, 'fnInt(')
    const lower = requireNumber(this.evalExpr(lowerArg), 'a lower bound')
    const upper = requireNumber(this.evalExpr(upperArg), 'an upper bound')
    if (lower === upper) return num(0)
    const a = Math.min(lower, upper)
    const b = Math.max(lower, upper)
    const n = 200 // even, for Simpson's rule
    const h = (b - a) / n
    let sum = this.evalScalarAt(exprArg, varName, a) + this.evalScalarAt(exprArg, varName, b)
    for (let i = 1; i < n; i++) {
      sum += (i % 2 === 0 ? 2 : 4) * this.evalScalarAt(exprArg, varName, a + i * h)
    }
    const result = (h / 3) * sum
    return num(checkFinite(lower > upper ? -result : result))
  }

  /** fMin(/fMax(: the var-value of a local extremum over [lower,upper], via golden-section search. */
  private evalExtremum(argExprs: Expr[], mode: 'min' | 'max'): Value {
    const fnName = mode === 'min' ? 'fMin(' : 'fMax('
    if (argExprs.length < 4) throw new TIError('ERR:ARGUMENT', `${fnName} requires expr,var,lower,upper[,tolerance]`)
    const [exprArg, varArg, lowerArg, upperArg, tolArg] = argExprs
    const varName = this.requireVarArg(varArg, fnName)
    let lo = requireNumber(this.evalExpr(lowerArg), 'a lower bound')
    let hi = requireNumber(this.evalExpr(upperArg), 'an upper bound')
    if (lo >= hi) throw new TIError('ERR:DOMAIN', `${fnName} requires lower < upper`)
    const tol = tolArg ? requireNumber(this.evalExpr(tolArg), 'a tolerance') : 1e-5
    const evalF = (x: number) => this.evalScalarAt(exprArg, varName, x)
    const gr = (Math.sqrt(5) - 1) / 2
    let c = hi - gr * (hi - lo)
    let d = lo + gr * (hi - lo)
    let fc = evalF(c)
    let fd = evalF(d)
    for (let i = 0; i < 200 && hi - lo > tol; i++) {
      const cIsBetter = mode === 'min' ? fc < fd : fc > fd
      if (cIsBetter) {
        hi = d
        d = c
        fd = fc
        c = hi - gr * (hi - lo)
        fc = evalF(c)
      } else {
        lo = c
        c = d
        fc = fd
        d = lo + gr * (hi - lo)
        fd = evalF(d)
      }
    }
    return num(checkFinite((lo + hi) / 2))
  }

  /** A numeric root of expr=0, via bisection within {lower,upper} if given, else Newton's method from guess. */
  private evalSolve(argExprs: Expr[]): Value {
    if (argExprs.length < 3) throw new TIError('ERR:ARGUMENT', 'solve( requires expr,var,guess[,{lower,upper}]')
    const [exprArg, varArg, guessArg, boundsArg] = argExprs
    const varName = this.requireVarArg(varArg, 'solve(')
    const guess = requireNumber(this.evalExpr(guessArg), 'a guess')
    const evalF = (x: number) => this.evalScalarAt(exprArg, varName, x)
    if (boundsArg) {
      const bounds = requireList(this.evalExpr(boundsArg), 'a {lower,upper} bounds list')
      if (bounds.length !== 2) throw new TIError('ERR:ARGUMENT', 'solve( bounds must be a 2-element list {lower,upper}')
      let [lo, hi] = bounds[0] <= bounds[1] ? bounds : [bounds[1], bounds[0]]
      let flo = evalF(lo)
      const fhi = evalF(hi)
      if (flo === 0) return num(lo)
      if (fhi === 0) return num(hi)
      if (flo > 0 === fhi > 0) throw new TIError('ERR:DOMAIN', 'solve( requires expr to change sign across {lower,upper}')
      for (let i = 0; i < 200 && hi - lo >= 1e-12; i++) {
        const mid = (lo + hi) / 2
        const fmid = evalF(mid)
        if (Math.abs(fmid) < 1e-12) return num(mid)
        if (fmid > 0 === flo > 0) {
          lo = mid
          flo = fmid
        } else {
          hi = mid
        }
      }
      return num((lo + hi) / 2)
    }
    // Newton's method from guess, using a numeric derivative.
    let x = guess
    for (let i = 0; i < 100; i++) {
      const fx = evalF(x)
      if (Math.abs(fx) < 1e-12) return num(x)
      const h = 1e-6 * Math.max(1, Math.abs(x))
      const dfx = (evalF(x + h) - evalF(x - h)) / (2 * h)
      if (dfx === 0) throw new TIError('ERR:DOMAIN', 'solve( could not find a root (derivative is 0 near the guess)')
      const next = x - fx / dfx
      if (!Number.isFinite(next)) throw new TIError('ERR:DOMAIN', 'solve( did not converge')
      if (Math.abs(next - x) < 1e-12) return num(next)
      x = next
    }
    throw new TIError('ERR:DOMAIN', 'solve( did not converge within 100 iterations')
  }

  private evalPxlTest(argExprs: Expr[]): Value {
    if (argExprs.length !== 2) throw new TIError('ERR:ARGUMENT', 'pxl-Test( requires row,col')
    const row = Math.round(requireNumber(this.evalExpr(argExprs[0]), 'a row'))
    const col = Math.round(requireNumber(this.evalExpr(argExprs[1]), 'a column'))
    return num(getPixel(this.state.graphScreen, row, col) ? 1 : 0)
  }

  private evalSeq(argExprs: Expr[]): Value {
    if (argExprs.length < 4) throw new TIError('ERR:ARGUMENT', 'seq( requires expr,var,start,end[,step]')
    const [exprArg, varArg, startArg, endArg, stepArg] = argExprs
    if (varArg.type !== 'Var') throw new TIError('ERR:DATA TYPE', 'seq( second argument must be a variable')
    const start = Math.round(requireNumber(this.evalExpr(startArg), 'a start value'))
    const end = Math.round(requireNumber(this.evalExpr(endArg), 'an end value'))
    const step = stepArg ? Math.round(requireNumber(this.evalExpr(stepArg), 'a step value')) : 1
    if (step === 0) throw new TIError('ERR:DOMAIN', 'seq( step cannot be 0')
    const results: number[] = []
    for (let i = start; step > 0 ? i <= end : i >= end; i += step) {
      this.setRealVar(varArg.name, i)
      results.push(requireNumber(this.evalExpr(exprArg), 'a numeric sequence value'))
    }
    return list(results)
  }

  private assignTo(target: StoreTarget, value: Value): void {
    switch (target.type) {
      case 'Var':
        if (value.kind === 'complex') {
          this.state.complexVars[target.name] = { re: value.re, im: value.im }
          this.state.vars[target.name] = value.re // kept in sync for any code path reading vars directly
        } else {
          delete this.state.complexVars[target.name]
          this.state.vars[target.name] = requireNumber(value, 'a number')
        }
        return
      case 'StrVar':
        this.state.strVars[target.name] = requireString(value, 'a string')
        return
      case 'List':
        this.state.lists[target.name] = [...requireList(value, 'a list')]
        return
      case 'ListElement': {
        const arr = this.state.lists[target.name] ?? (this.state.lists[target.name] = [])
        const idx = Math.round(requireNumber(this.evalExpr(target.index), 'a list index'))
        const n = requireNumber(value, 'a number')
        if (idx < 1 || idx > arr.length + 1) {
          throw new TIError('ERR:INVALID DIM', `${target.name}(${idx}) is out of range`)
        }
        arr[idx - 1] = n
        return
      }
      case 'Matrix':
        this.state.matrices[target.name] = requireMatrix(value, 'a matrix').map((row) => [...row])
        return
      case 'MatrixElement': {
        const m = this.state.matrices[target.name] ?? (this.state.matrices[target.name] = [])
        const row = Math.round(requireNumber(this.evalExpr(target.row), 'a row index'))
        const col = Math.round(requireNumber(this.evalExpr(target.col), 'a column index'))
        const [rows, cols] = mat.dims(m)
        const n = requireNumber(value, 'a number')
        if (row < 1 || row > rows || col < 1 || col > cols) {
          throw new TIError('ERR:INVALID DIM', `[${target.name}](${row},${col}) is out of range`)
        }
        m[row - 1][col - 1] = n
        return
      }
      case 'Dim': {
        const wanted = requireList(value, 'a list of dimensions')
        if (target.target.type === 'List') {
          const newLen = Math.round(wanted[0] ?? 0)
          if (!Number.isInteger(newLen) || newLen < 0) {
            throw new TIError('ERR:DOMAIN', 'dim( size must be a non-negative integer')
          }
          const old = this.state.lists[target.target.name] ?? []
          this.state.lists[target.target.name] = Array.from({ length: newLen }, (_, i) => old[i] ?? 0)
        } else {
          const newRows = Math.round(wanted[0] ?? 0)
          const newCols = Math.round(wanted[1] ?? 0)
          if (!Number.isInteger(newRows) || !Number.isInteger(newCols) || newRows < 0 || newCols < 0) {
            throw new TIError('ERR:DOMAIN', 'dim( size must be non-negative integers')
          }
          const old = this.state.matrices[target.target.name] ?? []
          this.state.matrices[target.target.name] = Array.from({ length: newRows }, (_, i) =>
            Array.from({ length: newCols }, (_, j) => old[i]?.[j] ?? 0),
          )
        }
        return
      }
      case 'YVar':
        this.state.yVars[target.name] = requireString(value, 'a string')
        return
    }
  }

  /** A human-readable label for a store target, used by Prompt's "NAME=?" line. */
  private targetLabel(t: StoreTarget): string {
    switch (t.type) {
      case 'Var':
      case 'StrVar':
      case 'List':
      case 'YVar':
        return t.name
      case 'Matrix':
        return `[${t.name}]`
      case 'ListElement':
        return `${t.name}(...)`
      case 'MatrixElement':
        return `[${t.name}](...)`
      case 'Dim':
        return `dim(${this.targetLabel(t.target)})`
    }
  }

  /** Parses typed Input/Prompt text as a single expression, or throws InvalidEntrySignal. */
  private parseInputExpr(text: string): Expr {
    const { program, diagnostics } = parse(text)
    const first = program.instructions[0]?.stmt
    if (diagnostics.length > 0 || program.instructions.length !== 1 || !first || first.kind !== 'Expr') {
      throw new InvalidEntrySignal('Invalid entry')
    }
    return first.expr
  }

  /**
   * Yields `input` events until the user provides text that actually
   * parses as an expression, then evaluates and returns it. A parse
   * failure re-prompts (with `invalid: true`) instead of ending the
   * program; a failure while *evaluating* the (valid) expression — e.g.
   * dividing by zero — is a real error and propagates normally.
   */
  private *readValue(prompt: string | null): Generator<RunEvent, Value, ResumeValue> {
    let invalid = false
    for (;;) {
      const text = yield { type: 'input', prompt, invalid }
      try {
        const expr = this.parseInputExpr(String(text ?? ''))
        return this.evalExpr(expr)
      } catch (err) {
        if (err instanceof InvalidEntrySignal) {
          invalid = true
          continue
        }
        throw err
      }
    }
  }

  // --- Statistics helpers --------------------------------------------------

  private resolveFreqList(name: string | null, expectedLength: number): number[] | undefined {
    if (!name) return undefined
    const w = this.state.lists[name] ?? []
    if (w.length !== expectedLength) {
      throw new TIError('ERR:DIM MISMATCH', 'Frequency list must be the same length as the data list')
    }
    return w
  }

  /** Computes and stores the 1-Var Stats result set (n, MeanX, Σx, Σx², Sx, σx, MinX, Q1, Med, Q3, MaxX). */
  private storeOneVarResults(xs: number[], w?: number[]) {
    this.setRealVar('n', w ? w.reduce((a, b) => a + b, 0) : xs.length)
    this.setRealVar('MeanX', stats.mean(xs, w))
    this.setRealVar('Σx', stats.sumWeighted(xs, w))
    this.setRealVar('Σx²', stats.sumWeighted(xs.map((x) => x * x), w))
    this.setRealVar('Sx', stats.stdDev(xs, w))
    this.setRealVar('σx', stats.populationStdDev(xs, w))
    const q = stats.quartiles(stats.sortedExpand(xs, w))
    this.setRealVar('MinX', q.min)
    this.setRealVar('Q1', q.q1)
    this.setRealVar('Med', q.med)
    this.setRealVar('Q3', q.q3)
    this.setRealVar('MaxX', q.max)
  }

  /** Reads and validates the Xlist/Ylist data (plus optional weights) shared by every STAT CALC regression. */
  private resolveXY(xList: string, yList: string, freqList: string | null): { xs: number[]; ys: number[]; w?: number[] } {
    const xs = this.state.lists[xList] ?? []
    const ys = this.state.lists[yList] ?? []
    if (xs.length === 0 || ys.length === 0) throw new TIError('ERR:DOMAIN', 'Both lists must have data')
    if (xs.length !== ys.length) throw new TIError('ERR:DIM MISMATCH', 'Xlist and Ylist must be the same length')
    const w = this.resolveFreqList(freqList, xs.length)
    return { xs, ys, w }
  }

  // --- Statements --------------------------------------------------------

  private *execStatement(
    instr: Instruction,
    index: number,
    linkInfo: LinkInfo | undefined,
    frame: Frame,
  ): Generator<RunEvent, StmtResult, ResumeValue> {
    const stmt = instr.stmt
    switch (stmt.kind) {
      case 'Expr': {
        this.state.ans = this.evalExpr(stmt.expr)
        return { kind: 'next' }
      }
      case 'Store': {
        const v = this.evalExpr(stmt.expr)
        this.assignTo(stmt.target, v)
        this.state.ans = v
        return { kind: 'next' }
      }
      case 'If': {
        const truthy = isTruthy(this.evalExpr(stmt.cond))
        if (stmt.blockMode) {
          if (truthy) return { kind: 'next' }
          const l = linkInfo?.kind === 'if-block' ? linkInfo : undefined
          const target = l ? (l.elseIndex !== null ? l.elseIndex + 1 : l.endIndex + 1) : index + 1
          return { kind: 'jump', index: target }
        }
        if (truthy) return { kind: 'next' }
        const l = linkInfo?.kind === 'if-single' ? linkInfo : undefined
        return { kind: 'jump', index: l ? l.skipIndex : index + 1 }
      }
      case 'Else': {
        const l = linkInfo?.kind === 'else' ? linkInfo : undefined
        return { kind: 'jump', index: l ? l.endIndex + 1 : index + 1 }
      }
      case 'End': {
        const l = linkInfo?.kind === 'end' ? linkInfo : undefined
        if (!l) return { kind: 'next' }
        if (l.partnerKind === 'if-block') return { kind: 'next' }
        if (l.partnerKind === 'for') {
          const loop = frame.loopState.get(l.partnerIndex)
          if (!loop) return { kind: 'next' }
          this.setRealVar(loop.varName, this.state.vars[loop.varName] + loop.step)
          const cur = this.state.vars[loop.varName]
          const cont = loop.step >= 0 ? cur <= loop.end : cur >= loop.end
          if (cont) return { kind: 'jump', index: l.partnerIndex + 1 }
          frame.loopState.delete(l.partnerIndex)
          return { kind: 'next' }
        }
        if (l.partnerKind === 'while') return { kind: 'jump', index: l.partnerIndex }
        // repeat: condition is checked here, at the End.
        const repeatStmt = frame.compiled.linked.program.instructions[l.partnerIndex].stmt as Extract<Stmt, { kind: 'Repeat' }>
        if (isTruthy(this.evalExpr(repeatStmt.cond))) return { kind: 'next' }
        return { kind: 'jump', index: l.partnerIndex + 1 }
      }
      case 'For': {
        const startV = requireNumber(this.evalExpr(stmt.start), 'a start value')
        const endV = requireNumber(this.evalExpr(stmt.end), 'an end value')
        const stepV = stmt.step ? requireNumber(this.evalExpr(stmt.step), 'a step value') : 1
        this.setRealVar(stmt.varName, startV)
        const cont = stepV >= 0 ? startV <= endV : startV >= endV
        const l = linkInfo?.kind === 'for' ? linkInfo : undefined
        if (!cont) return { kind: 'jump', index: l ? l.endIndex + 1 : index + 1 }
        frame.loopState.set(index, { varName: stmt.varName, end: endV, step: stepV })
        return { kind: 'next' }
      }
      case 'While': {
        if (isTruthy(this.evalExpr(stmt.cond))) return { kind: 'next' }
        const l = linkInfo?.kind === 'while' ? linkInfo : undefined
        return { kind: 'jump', index: l ? l.endIndex + 1 : index + 1 }
      }
      case 'Repeat':
        return { kind: 'next' }
      case 'Lbl':
        return { kind: 'next' }
      case 'Goto': {
        const target = frame.compiled.linked.labels.get(stmt.name)
        if (target === undefined) throw new TIError('ERR:LABEL', `Lbl ${stmt.name} not found`)
        return { kind: 'jump', index: target }
      }
      case 'IsGt': {
        this.setRealVar(stmt.varName, (this.state.vars[stmt.varName] ?? 0) + 1)
        const cmp = requireNumber(this.evalExpr(stmt.value), 'a comparison value')
        if (this.state.vars[stmt.varName] > cmp) return { kind: 'jump', index: index + 2 }
        return { kind: 'next' }
      }
      case 'DsLt': {
        this.setRealVar(stmt.varName, (this.state.vars[stmt.varName] ?? 0) - 1)
        const cmp = requireNumber(this.evalExpr(stmt.value), 'a comparison value')
        if (this.state.vars[stmt.varName] < cmp) return { kind: 'jump', index: index + 2 }
        return { kind: 'next' }
      }
      case 'Menu': {
        const title = requireString(this.evalExpr(stmt.title), 'a title string')
        const options = stmt.options.map((o) => ({
          text: requireString(this.evalExpr(o.text), 'an option string'),
          label: o.label,
        }))
        const choice = yield { type: 'menu', title, options }
        const idx = typeof choice === 'number' ? choice : 1
        const clamped = Math.min(Math.max(Math.round(idx), 1), options.length)
        const target = frame.compiled.linked.labels.get(options[clamped - 1].label)
        if (target === undefined) throw new TIError('ERR:LABEL', `Lbl ${options[clamped - 1].label} not found`)
        return { kind: 'jump', index: target }
      }
      case 'Return':
        return { kind: 'return' }
      case 'Stop':
        return { kind: 'stop' }
      case 'Pause': {
        if (stmt.value) this.dispValue(this.evalExpr(stmt.value))
        yield { type: 'pause' }
        return { kind: 'next' }
      }
      case 'Disp': {
        if (stmt.values.length === 0) {
          dispLine(this.state.screen, '')
        } else {
          for (const e of stmt.values) this.dispValue(this.evalExpr(e))
        }
        yield { type: 'tick' }
        return { kind: 'next' }
      }
      case 'Output': {
        const row = Math.round(requireNumber(this.evalExpr(stmt.row), 'a row'))
        const col = Math.round(requireNumber(this.evalExpr(stmt.col), 'a column'))
        if (row < 1 || row > SCREEN_ROWS || col < 1 || col > SCREEN_COLS) {
          throw new TIError('ERR:DOMAIN', `Output( row/col must be within 1-${SCREEN_ROWS} / 1-${SCREEN_COLS}`)
        }
        const text = formatValue(this.evalExpr(stmt.value), this.numberFormatOpts())
        if (text.includes('\n')) throw new TIError('ERR:DATA TYPE', "Output( can't display a matrix")
        writeAt(this.state.screen, row, col, text)
        yield { type: 'tick' }
        return { kind: 'next' }
      }
      case 'Input': {
        const v = yield* this.readValue(stmt.target ? stmt.prompt : null)
        if (stmt.target) this.assignTo(stmt.target, v)
        this.state.ans = v
        return { kind: 'next' }
      }
      case 'Prompt': {
        for (const target of stmt.targets) {
          const v = yield* this.readValue(`${this.targetLabel(target)}=?`)
          this.assignTo(target, v)
        }
        return { kind: 'next' }
      }
      case 'ClrHome': {
        clearScreen(this.state.screen)
        yield { type: 'tick' }
        return { kind: 'next' }
      }
      case 'DelVar': {
        const t = stmt.target
        if (t.type === 'Var') this.setRealVar(t.name, 0)
        else if (t.type === 'StrVar') this.state.strVars[t.name] = ''
        else if (t.type === 'List') this.state.lists[t.name] = []
        else if (t.type === 'Matrix') this.state.matrices[t.name] = []
        else if (t.type === 'YVar') this.state.yVars[t.name] = ''
        else throw new TIError('ERR:DATA TYPE', 'DelVar requires a variable, list, matrix, Y-variable, or Str')
        return { kind: 'next' }
      }
      case 'Fill': {
        const n = requireNumber(this.evalExpr(stmt.value), 'a number')
        if (stmt.target.type === 'List') {
          const arr = this.state.lists[stmt.target.name]
          if (!arr || arr.length === 0) {
            throw new TIError('ERR:INVALID DIM', `${stmt.target.name} has no size yet; set one with dim( first`)
          }
          this.state.lists[stmt.target.name] = arr.map(() => n)
        } else {
          const m = this.state.matrices[stmt.target.name]
          if (!m || m.length === 0) {
            throw new TIError('ERR:INVALID DIM', `[${stmt.target.name}] has no size yet; set one with dim( first`)
          }
          this.state.matrices[stmt.target.name] = m.map((row) => row.map(() => n))
        }
        return { kind: 'next' }
      }
      case 'OneVarStats': {
        const xs = this.state.lists[stmt.xList] ?? []
        if (xs.length === 0) throw new TIError('ERR:DOMAIN', `${stmt.xList} has no data`)
        const w = this.resolveFreqList(stmt.freqList, xs.length)
        this.storeOneVarResults(xs, w)
        return { kind: 'next' }
      }
      case 'TwoVarStats': {
        const { xs, ys, w } = this.resolveXY(stmt.xList, stmt.yList, stmt.freqList)
        this.storeOneVarResults(xs, w)
        this.setRealVar('MeanY', stats.mean(ys, w))
        this.setRealVar('Σy', stats.sumWeighted(ys, w))
        this.setRealVar(
          'Σy²',
          stats.sumWeighted(
            ys.map((y) => y * y),
            w,
          ),
        )
        this.setRealVar('Σxy', xs.reduce((acc, x, i) => acc + x * ys[i] * (w ? w[i] : 1), 0))
        this.setRealVar('Sy', stats.stdDev(ys, w))
        this.setRealVar('σy', stats.populationStdDev(ys, w))
        const [minY, maxY] = stats.minMax(ys, w)
        this.setRealVar('MinY', minY)
        this.setRealVar('MaxY', maxY)
        return { kind: 'next' }
      }
      case 'LinReg': {
        const { xs, ys, w } = this.resolveXY(stmt.xList, stmt.yList, stmt.freqList)
        const { a, b, r } = stats.linreg(xs, ys, w)
        this.setRealVar('a', a)
        this.setRealVar('b', b)
        this.setRealVar('r', r)
        return { kind: 'next' }
      }
      case 'LinRegAbx': {
        const { xs, ys, w } = this.resolveXY(stmt.xList, stmt.yList, stmt.freqList)
        // Same fit as LinReg(ax+b) (y=ax+b); LinReg(a+bx) just names a=intercept, b=slope.
        const { a: slope, b: intercept, r } = stats.linreg(xs, ys, w)
        this.setRealVar('a', intercept)
        this.setRealVar('b', slope)
        this.setRealVar('r', r)
        return { kind: 'next' }
      }
      case 'PolyReg': {
        const { xs, ys, w } = this.resolveXY(stmt.xList, stmt.yList, stmt.freqList)
        const { coeffs, r2 } = stats.polyReg(xs, ys, stmt.degree, w)
        const names = stmt.degree === 2 ? ['c', 'b', 'a'] : stmt.degree === 3 ? ['d', 'c', 'b', 'a'] : ['e', 'd', 'c', 'b', 'a']
        names.forEach((name, i) => this.setRealVar(name, coeffs[i]))
        this.setRealVar('R²', r2)
        return { kind: 'next' }
      }
      case 'LnReg': {
        const { xs, ys, w } = this.resolveXY(stmt.xList, stmt.yList, stmt.freqList)
        const { a, b, r } = stats.lnReg(xs, ys, w)
        this.setRealVar('a', a)
        this.setRealVar('b', b)
        this.setRealVar('r', r)
        return { kind: 'next' }
      }
      case 'ExpReg': {
        const { xs, ys, w } = this.resolveXY(stmt.xList, stmt.yList, stmt.freqList)
        const { a, b, r } = stats.expReg(xs, ys, w)
        this.setRealVar('a', a)
        this.setRealVar('b', b)
        this.setRealVar('r', r)
        return { kind: 'next' }
      }
      case 'PwrReg': {
        const { xs, ys, w } = this.resolveXY(stmt.xList, stmt.yList, stmt.freqList)
        const { a, b, r } = stats.pwrReg(xs, ys, w)
        this.setRealVar('a', a)
        this.setRealVar('b', b)
        this.setRealVar('r', r)
        return { kind: 'next' }
      }
      case 'PrgmCall':
        return { kind: 'call', name: stmt.name }
      case 'SetAngleMode':
        this.state.angleMode = stmt.mode
        return { kind: 'next' }
      case 'SetDecimalMode':
        this.state.fixedDecimals = stmt.digits
        return { kind: 'next' }
      case 'SetNotation':
        this.state.notation = stmt.mode
        return { kind: 'next' }
      case 'SetComplexMode':
        this.state.complexMode = stmt.mode
        return { kind: 'next' }
      case 'DispGraph': {
        const g = this.state.graphScreen
        clearGraphScreen(g)
        const w = this.window()
        if (w.xMax === w.xMin || w.yMax === w.yMin) {
          throw new TIError('ERR:DOMAIN', 'Xmin/Xmax and Ymin/Ymax must not be equal')
        }
        // Axes: the X-axis (row where y=0) and Y-axis (col where x=0), each only if in view.
        if (w.yMin < 0 && w.yMax > 0) {
          const row = yToRow(0, w)
          for (let col = 0; col < GRAPH_COLS; col++) setPixel(g, row, col, true)
        }
        if (w.xMin < 0 && w.xMax > 0) {
          const col = xToCol(0, w)
          for (let row = 0; row < GRAPH_ROWS; row++) setPixel(g, row, col, true)
        }
        // Plot every Y-variable with a non-empty definition, column by column.
        for (const name of YVAR_NAMES) {
          const def = this.state.yVars[name]
          if (!def) continue
          const parsedExpr = this.parseYVarDef(name, def)
          let prevRow: number | null = null
          let prevCol: number | null = null
          for (let col = 0; col < GRAPH_COLS; col++) {
            const x = colToX(col, w)
            this.setRealVar('X', x)
            let y: number
            try {
              y = requireNumber(this.evalExpr(parsedExpr), 'a number')
            } catch {
              prevRow = null
              prevCol = null
              continue
            }
            if (!Number.isFinite(y)) {
              prevRow = null
              prevCol = null
              continue
            }
            const row = yToRow(y, w)
            if (prevRow !== null && prevCol !== null) {
              drawLine(g, prevRow, prevCol, row, col)
            } else {
              setPixel(g, row, col, true)
            }
            prevRow = row
            prevCol = col
          }
          yield { type: 'tick' }
        }
        this.renderPlots(w)
        yield { type: 'tick' }
        return { kind: 'next' }
      }
      case 'ClrDraw': {
        clearGraphScreen(this.state.graphScreen)
        yield { type: 'tick' }
        return { kind: 'next' }
      }
      case 'Line': {
        const w = this.window()
        const x1 = requireNumber(this.evalExpr(stmt.x1), 'a number')
        const y1 = requireNumber(this.evalExpr(stmt.y1), 'a number')
        const x2 = requireNumber(this.evalExpr(stmt.x2), 'a number')
        const y2 = requireNumber(this.evalExpr(stmt.y2), 'a number')
        const on = stmt.erase ? requireNumber(this.evalExpr(stmt.erase), 'a number') !== 0 : true
        drawLine(this.state.graphScreen, yToRow(y1, w), xToCol(x1, w), yToRow(y2, w), xToCol(x2, w), on)
        yield { type: 'tick' }
        return { kind: 'next' }
      }
      case 'Circle': {
        const w = this.window()
        const cx = requireNumber(this.evalExpr(stmt.x), 'a number')
        const cy = requireNumber(this.evalExpr(stmt.y), 'a number')
        const radius = requireNumber(this.evalExpr(stmt.radius), 'a number')
        const radiusPx = Math.round((radius * (GRAPH_COLS - 1)) / (w.xMax - w.xMin))
        drawCircle(this.state.graphScreen, yToRow(cy, w), xToCol(cx, w), radiusPx)
        yield { type: 'tick' }
        return { kind: 'next' }
      }
      case 'PxlOn':
      case 'PxlOff':
      case 'PxlChange': {
        const row = Math.round(requireNumber(this.evalExpr(stmt.row), 'a pixel row (0-62)'))
        const col = Math.round(requireNumber(this.evalExpr(stmt.col), 'a pixel column (0-94)'))
        if (row < 0 || row >= GRAPH_ROWS || col < 0 || col >= GRAPH_COLS) {
          throw new TIError('ERR:DOMAIN', `Pixel row/col must be within 0-${GRAPH_ROWS - 1} / 0-${GRAPH_COLS - 1}`)
        }
        if (stmt.kind === 'PxlOn') setPixel(this.state.graphScreen, row, col, true)
        else if (stmt.kind === 'PxlOff') setPixel(this.state.graphScreen, row, col, false)
        else setPixel(this.state.graphScreen, row, col, !getPixel(this.state.graphScreen, row, col))
        yield { type: 'tick' }
        return { kind: 'next' }
      }
      case 'SortList': {
        const primary = [...(this.state.lists[stmt.lists[0]] ?? [])]
        const n = primary.length
        const order = Array.from({ length: n }, (_, i) => i).sort((i, j) =>
          stmt.mode === 'asc' ? primary[i] - primary[j] : primary[j] - primary[i],
        )
        for (const name of stmt.lists) {
          const arr = this.state.lists[name] ?? []
          if (arr.length !== n) throw new TIError('ERR:DIM MISMATCH', 'SortA(/SortD( requires all lists to be the same length')
          this.state.lists[name] = order.map((i) => arr[i])
        }
        return { kind: 'next' }
      }
      case 'ClrList': {
        for (const name of stmt.lists) this.state.lists[name] = []
        return { kind: 'next' }
      }
      case 'DefinePlot': {
        this.state.plots[stmt.plot - 1] = {
          enabled: true,
          plotType: stmt.plotType,
          xList: stmt.xList,
          yList: stmt.yList,
          freqList: stmt.freqList,
        }
        return { kind: 'next' }
      }
      case 'SetPlotsEnabled': {
        for (const p of stmt.plots) this.state.plots[p - 1].enabled = stmt.enabled
        return { kind: 'next' }
      }
      case 'Shade': {
        const w = this.window()
        const leftX = stmt.xLeft ? requireNumber(this.evalExpr(stmt.xLeft), 'a number') : w.xMin
        const rightX = stmt.xRight ? requireNumber(this.evalExpr(stmt.xRight), 'a number') : w.xMax
        const colLeft = Math.max(0, xToCol(leftX, w))
        const colRight = Math.min(GRAPH_COLS - 1, xToCol(rightX, w))
        for (let col = colLeft; col <= colRight; col++) {
          const x = colToX(col, w)
          this.setRealVar('X', x)
          let lowerY: number
          let upperY: number
          try {
            lowerY = requireNumber(this.evalExpr(stmt.lower), 'a number')
            upperY = requireNumber(this.evalExpr(stmt.upper), 'a number')
          } catch {
            continue
          }
          if (!Number.isFinite(lowerY) || !Number.isFinite(upperY) || lowerY >= upperY) continue
          const rowTop = Math.min(GRAPH_ROWS - 1, Math.max(0, yToRow(upperY, w)))
          const rowBottom = Math.min(GRAPH_ROWS - 1, Math.max(0, yToRow(lowerY, w)))
          for (let row = rowTop; row <= rowBottom; row++) setPixel(this.state.graphScreen, row, col, true)
        }
        yield { type: 'tick' }
        return { kind: 'next' }
      }
      case 'PtOn':
      case 'PtOff':
      case 'PtChange': {
        const w = this.window()
        const x = requireNumber(this.evalExpr(stmt.x), 'a number')
        const y = requireNumber(this.evalExpr(stmt.y), 'a number')
        const row = yToRow(y, w)
        const col = xToCol(x, w)
        if (stmt.kind === 'PtOn') setPixel(this.state.graphScreen, row, col, true)
        else if (stmt.kind === 'PtOff') setPixel(this.state.graphScreen, row, col, false)
        else setPixel(this.state.graphScreen, row, col, !getPixel(this.state.graphScreen, row, col))
        yield { type: 'tick' }
        return { kind: 'next' }
      }
      case 'Horizontal': {
        const w = this.window()
        const row = yToRow(requireNumber(this.evalExpr(stmt.y), 'a number'), w)
        for (let col = 0; col < GRAPH_COLS; col++) setPixel(this.state.graphScreen, row, col, true)
        yield { type: 'tick' }
        return { kind: 'next' }
      }
      case 'Vertical': {
        const w = this.window()
        const col = xToCol(requireNumber(this.evalExpr(stmt.x), 'a number'), w)
        for (let row = 0; row < GRAPH_ROWS; row++) setPixel(this.state.graphScreen, row, col, true)
        yield { type: 'tick' }
        return { kind: 'next' }
      }
    }
  }

  // --- Main loop -----------------------------------------------------

  *run(entry: CompiledProgram): Generator<RunEvent, void, ResumeValue> {
    const frames: Frame[] = [{ compiled: entry, ip: 0, loopState: new Map() }]
    let lastBareExprAtTop: Value | null = null

    while (frames.length > 0) {
      const frame = frames[frames.length - 1]
      const instrs = frame.compiled.linked.program.instructions
      if (frame.ip >= instrs.length) {
        frames.pop()
        continue
      }

      this.steps++
      if (this.steps > MAX_STEPS) {
        yield {
          type: 'error',
          error: new TIError('ERR:MEMORY', 'Program exceeded the execution safety limit (possible infinite loop)'),
        }
        return
      }

      const instr = instrs[frame.ip]
      const linkInfo = frame.compiled.linked.links.get(frame.ip)
      const isTop = frames.length === 1
      if (isTop && instr.stmt.kind !== 'Expr') lastBareExprAtTop = null

      let result: StmtResult
      try {
        result = yield* this.execStatement(instr, frame.ip, linkInfo, frame)
      } catch (err) {
        if (err instanceof TIError) {
          const withLine = err.line !== undefined ? err : new TIError(err.code as TIErrorCode, err.message, instr.line)
          yield { type: 'error', error: withLine }
          return
        }
        throw err
      }

      if (isTop && instr.stmt.kind === 'Expr') lastBareExprAtTop = this.state.ans

      switch (result.kind) {
        case 'next':
          frame.ip += 1
          break
        case 'jump':
          frame.ip = result.index
          break
        case 'call': {
          frame.ip += 1
          let compiledSub: CompiledProgram
          try {
            compiledSub = this.resolveCompiled(result.name)
          } catch (err) {
            if (err instanceof TIError) {
              yield { type: 'error', error: new TIError(err.code, err.message, instr.line) }
              return
            }
            throw err
          }
          if (compiledSub.diagnostics.length > 0) {
            yield {
              type: 'error',
              error: new TIError('ERR:SYNTAX', `prgm${result.name} has a syntax error and cannot run`, instr.line),
            }
            return
          }
          if (frames.length >= MAX_CALL_DEPTH) {
            yield { type: 'error', error: new TIError('ERR:MEMORY', 'Too many nested program calls', instr.line) }
            return
          }
          frames.push({ compiled: compiledSub, ip: 0, loopState: new Map() })
          break
        }
        case 'return':
          frames.pop()
          break
        case 'stop':
          frames.length = 0
          break
      }

      if (this.steps % 20000 === 0) yield { type: 'tick' }
    }

    if (lastBareExprAtTop !== null) {
      this.dispValue(lastBareExprAtTop)
      yield { type: 'tick' }
    }
    yield { type: 'done' }
  }
}

/**
 * Runs a compiled program to completion, pausing (via `yield`) whenever it
 * needs input, a menu choice, or an [ENTER] to continue. Drive it with a
 * loop that calls `.next(resumeValue)`; see `RunEvent` for what each event
 * expects back.
 */
export function runProgram(
  entry: CompiledProgram,
  state: InterpreterState,
  resolveProgram: ProgramResolver,
): Generator<RunEvent, void, ResumeValue> {
  return new Runner(state, resolveProgram).run(entry)
}

/**
 * Evaluates a Y-variable at x against a snapshot of interpreter state,
 * outside of any running program — for GUI features (the Graph tab's trace
 * cursor) that need a one-off value rather than a full program run. Mutates
 * state.vars['X'] as a side effect, matching Y1(x)'s real-hardware quirk.
 * Returns null instead of throwing (undefined Y-variable, a value outside
 * its domain, ...) since a GUI readout has no error screen to show.
 */
export function evalYVarAt(state: InterpreterState, name: string, x: number): number | null {
  try {
    return new Runner(state, () => undefined).evalYVariable(name, x)
  } catch {
    return null
  }
}
