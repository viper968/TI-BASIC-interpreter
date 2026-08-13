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
} from './values'
import * as mat from './matrix'
import * as stats from './stats'
import { BUILTINS, type AngleMode, type BuiltinCtx, factorial } from './builtins'
import { SCREEN_COLS, SCREEN_ROWS, type Screen, clearScreen, createScreen, dispLine, writeAt } from './screen'
import { STAT_VAR_NAMES } from './commands'

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

export interface InterpreterState {
  vars: Record<string, number>
  strVars: Record<string, string>
  lists: Record<string, number[]>
  matrices: Record<string, number[][]>
  ans: Value
  angleMode: AngleMode
  /** MODE screen: Normal/Sci/Eng notation. */
  notation: 'normal' | 'sci' | 'eng'
  /** MODE screen: null = Float (automatic), 0-9 = Fix n. */
  fixedDecimals: number | null
  screen: Screen
  lastKey: number
}

export function createInterpreterState(): InterpreterState {
  const vars: Record<string, number> = {}
  for (const n of REAL_VAR_NAMES) vars[n] = 0
  for (const n of STAT_VAR_NAMES) vars[n] = 0
  const strVars: Record<string, string> = {}
  for (const n of STR_VAR_NAMES) strVars[n] = ''
  const lists: Record<string, number[]> = {}
  for (const n of LIST_NAMES) lists[n] = []
  const matrices: Record<string, number[][]> = {}
  for (const n of MATRIX_NAMES) matrices[n] = []
  return {
    vars,
    strVars,
    lists,
    matrices,
    ans: num(0),
    angleMode: 'degree',
    notation: 'normal',
    fixedDecimals: null,
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
    }
  }

  private numberFormatOpts(): NumberFormatOptions {
    return { fixedDecimals: this.state.fixedDecimals, notation: this.state.notation }
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
      case 'Var':
        return num(this.state.vars[expr.name] ?? 0)
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
      case 'Euler':
        return num(Math.E)
      case 'Unary':
        return mapNumeric(this.evalExpr(expr.operand), (x) => -x)
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
    }
  }

  private evalBinary(op: BinaryOp, l: Value, r: Value): Value {
    if (l.kind === 'matrix' || r.kind === 'matrix') return this.evalMatrixBinary(op, l, r)
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
      case '^':
        return broadcastNumeric(l, r, (a, b) => checkFinite(Math.pow(a, b)))
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
    const fn = BUILTINS[name]
    if (!fn) throw new TIError('ERR:SYNTAX', `Unknown function ${name}`)
    return fn(argExprs.map((a) => this.evalExpr(a)), this.builtinCtx())
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
      this.state.vars[varArg.name] = i
      results.push(requireNumber(this.evalExpr(exprArg), 'a numeric sequence value'))
    }
    return list(results)
  }

  private assignTo(target: StoreTarget, value: Value): void {
    switch (target.type) {
      case 'Var':
        this.state.vars[target.name] = requireNumber(value, 'a number')
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
    }
  }

  /** A human-readable label for a store target, used by Prompt's "NAME=?" line. */
  private targetLabel(t: StoreTarget): string {
    switch (t.type) {
      case 'Var':
      case 'StrVar':
      case 'List':
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
    this.state.vars['n'] = w ? w.reduce((a, b) => a + b, 0) : xs.length
    this.state.vars['MeanX'] = stats.mean(xs, w)
    this.state.vars['Σx'] = stats.sumWeighted(xs, w)
    this.state.vars['Σx²'] = stats.sumWeighted(xs.map((x) => x * x), w)
    this.state.vars['Sx'] = stats.stdDev(xs, w)
    this.state.vars['σx'] = stats.populationStdDev(xs, w)
    const q = stats.quartiles(stats.sortedExpand(xs, w))
    this.state.vars['MinX'] = q.min
    this.state.vars['Q1'] = q.q1
    this.state.vars['Med'] = q.med
    this.state.vars['Q3'] = q.q3
    this.state.vars['MaxX'] = q.max
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
          this.state.vars[loop.varName] = this.state.vars[loop.varName] + loop.step
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
        this.state.vars[stmt.varName] = startV
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
        this.state.vars[stmt.varName] = (this.state.vars[stmt.varName] ?? 0) + 1
        const cmp = requireNumber(this.evalExpr(stmt.value), 'a comparison value')
        if (this.state.vars[stmt.varName] > cmp) return { kind: 'jump', index: index + 2 }
        return { kind: 'next' }
      }
      case 'DsLt': {
        this.state.vars[stmt.varName] = (this.state.vars[stmt.varName] ?? 0) - 1
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
        if (t.type === 'Var') this.state.vars[t.name] = 0
        else if (t.type === 'StrVar') this.state.strVars[t.name] = ''
        else if (t.type === 'List') this.state.lists[t.name] = []
        else if (t.type === 'Matrix') this.state.matrices[t.name] = []
        else throw new TIError('ERR:DATA TYPE', 'DelVar requires a variable, list, matrix, or Str')
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
        const xs = this.state.lists[stmt.xList] ?? []
        const ys = this.state.lists[stmt.yList] ?? []
        if (xs.length === 0 || ys.length === 0) throw new TIError('ERR:DOMAIN', 'Both lists must have data')
        if (xs.length !== ys.length) throw new TIError('ERR:DIM MISMATCH', 'Xlist and Ylist must be the same length')
        const w = this.resolveFreqList(stmt.freqList, xs.length)
        this.storeOneVarResults(xs, w)
        this.state.vars['MeanY'] = stats.mean(ys, w)
        this.state.vars['Σy'] = stats.sumWeighted(ys, w)
        this.state.vars['Σy²'] = stats.sumWeighted(
          ys.map((y) => y * y),
          w,
        )
        this.state.vars['Σxy'] = xs.reduce((acc, x, i) => acc + x * ys[i] * (w ? w[i] : 1), 0)
        this.state.vars['Sy'] = stats.stdDev(ys, w)
        this.state.vars['σy'] = stats.populationStdDev(ys, w)
        const [minY, maxY] = stats.minMax(ys, w)
        this.state.vars['MinY'] = minY
        this.state.vars['MaxY'] = maxY
        return { kind: 'next' }
      }
      case 'LinReg': {
        const xs = this.state.lists[stmt.xList] ?? []
        const ys = this.state.lists[stmt.yList] ?? []
        if (xs.length === 0 || ys.length === 0) throw new TIError('ERR:DOMAIN', 'Both lists must have data')
        if (xs.length !== ys.length) throw new TIError('ERR:DIM MISMATCH', 'Xlist and Ylist must be the same length')
        const w = this.resolveFreqList(stmt.freqList, xs.length)
        const { a, b, r } = stats.linreg(xs, ys, w)
        this.state.vars['a'] = a
        this.state.vars['b'] = b
        this.state.vars['r'] = r
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
