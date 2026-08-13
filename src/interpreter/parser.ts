import type { Diagnostic } from './errors'
import type { Token, TokenType } from './tokens'
import type { BinaryOp, Expr, Instruction, MenuOption, Program, Stmt, StoreTarget } from './ast'
import { tokenize } from './lexer'

/** Internal control-flow signal used to unwind out of a broken statement. */
class ParseSignal extends Error {}

const COMPARE_OPS: Partial<Record<TokenType, BinaryOp>> = {
  EQ: '=',
  NE: '≠',
  LT: '<',
  GT: '>',
  LE: '≤',
  GE: '≥',
}

/** Function-style keywords that are statement-only and illegal inside an expression. */
const STATEMENT_ONLY_KEYWORDS = new Set(['For(', 'Output(', 'Menu(', 'IS>(', 'DS<(', 'Fill('])

/** Tokens that legitimately end a statement. */
function isStmtEnd(tok: Token): boolean {
  return tok.type === 'NEWLINE' || tok.type === 'COLON' || tok.type === 'EOF'
}

class Parser {
  private tokens: Token[]
  private pos = 0
  diagnostics: Diagnostic[] = []
  instructions: Instruction[] = []

  constructor(tokens: Token[], lexDiagnostics: Diagnostic[]) {
    this.tokens = tokens
    this.diagnostics = [...lexDiagnostics]
  }

  private current(): Token {
    return this.tokens[this.pos]
  }

  private advance(): Token {
    const tok = this.tokens[this.pos]
    if (tok.type !== 'EOF') this.pos++
    return tok
  }

  private error(message: string, tok: Token = this.current()): never {
    this.diagnostics.push({ code: 'ERR:SYNTAX', message, line: tok.line, column: tok.column })
    throw new ParseSignal(message)
  }

  private expect(type: TokenType, what: string): Token {
    const tok = this.current()
    if (tok.type !== type) {
      this.error(`Expected ${what}`, tok)
    }
    return this.advance()
  }

  private isKeyword(text: string, tok: Token = this.current()): boolean {
    return tok.type === 'KEYWORD' && tok.text === text
  }

  // --- Top level -----------------------------------------------------

  parseProgram(): Program {
    while (this.current().type !== 'EOF') {
      if (this.current().type === 'NEWLINE' || this.current().type === 'COLON') {
        this.advance()
        continue
      }
      const startTok = this.current()
      try {
        const stmt = this.parseStatement()
        if (stmt) {
          this.instructions.push({ stmt, line: startTok.line })
        }
        if (!isStmtEnd(this.current())) {
          this.error('Unexpected token; expected end of statement (":" or newline)')
        }
      } catch (e) {
        if (!(e instanceof ParseSignal)) throw e
        // Recover: skip to the next statement boundary.
        while (!isStmtEnd(this.current())) this.advance()
      }
    }
    return { instructions: this.instructions }
  }

  // --- Statements -----------------------------------------------------

  private parseStatement(): Stmt | null {
    const tok = this.current()

    if (tok.type === 'PRGM') return this.parsePrgmCall()

    if (tok.type === 'KEYWORD') {
      switch (tok.text) {
        case 'If':
          return this.parseIf()
        case 'Then':
          this.error('"Then" without a matching "If"')
          return null
        case 'Else':
          this.advance()
          return { kind: 'Else' }
        case 'End':
          this.advance()
          return { kind: 'End' }
        case 'For(':
          return this.parseFor()
        case 'While':
          this.advance()
          return { kind: 'While', cond: this.parseExpr() }
        case 'Repeat':
          this.advance()
          return { kind: 'Repeat', cond: this.parseExpr() }
        case 'Lbl':
          return this.parseLbl()
        case 'Goto':
          return this.parseGoto()
        case 'IS>(':
          return this.parseIsDs('IsGt')
        case 'DS<(':
          return this.parseIsDs('DsLt')
        case 'Menu(':
          return this.parseMenu()
        case 'Return':
          this.advance()
          return { kind: 'Return' }
        case 'Stop':
          this.advance()
          return { kind: 'Stop' }
        case 'Pause':
          return this.parsePause()
        case 'Disp':
          return this.parseDisp()
        case 'Output(':
          return this.parseOutput()
        case 'Input':
          return this.parseInput()
        case 'Prompt':
          return this.parsePrompt()
        case 'ClrHome':
          this.advance()
          return { kind: 'ClrHome' }
        case 'DelVar':
          this.advance()
          return { kind: 'DelVar', target: this.parseStoreTarget() }
        case 'Degree':
          this.advance()
          return { kind: 'SetAngleMode', mode: 'degree' }
        case 'Radian':
          this.advance()
          return { kind: 'SetAngleMode', mode: 'radian' }
        case 'Normal':
          this.advance()
          return { kind: 'SetNotation', mode: 'normal' }
        case 'Sci':
          this.advance()
          return { kind: 'SetNotation', mode: 'sci' }
        case 'Eng':
          this.advance()
          return { kind: 'SetNotation', mode: 'eng' }
        case 'Float':
          this.advance()
          return { kind: 'SetDecimalMode', digits: null }
        case 'Fix':
          return this.parseFix()
        case 'Fill(':
          return this.parseFill()
        default:
          break
      }
    }

    // Fall through: a bare expression, optionally followed by -> target.
    const expr = this.parseExpr()
    if (this.current().type === 'STO') {
      this.advance()
      const target = this.parseStoreTarget()
      return { kind: 'Store', expr, target }
    }
    return { kind: 'Expr', expr }
  }

  private parseIf(): Stmt {
    this.advance() // If
    const cond = this.parseExpr()
    let blockMode = false
    // Look ahead past statement separators for a bare "Then".
    let lookahead = this.pos
    while (this.tokens[lookahead].type === 'NEWLINE' || this.tokens[lookahead].type === 'COLON') lookahead++
    const maybeThen = this.tokens[lookahead]
    if (maybeThen.type === 'KEYWORD' && maybeThen.text === 'Then') {
      this.pos = lookahead + 1
      blockMode = true
    }
    return { kind: 'If', cond, blockMode }
  }

  private parseFor(): Stmt {
    this.advance() // For(
    const varTok = this.expect('VAR', 'a loop variable (A-Z or θ)')
    this.expect('COMMA', '","')
    const start = this.parseExpr()
    this.expect('COMMA', '","')
    const end = this.parseExpr()
    let step: Expr | null = null
    if (this.current().type === 'COMMA') {
      this.advance()
      step = this.parseExpr()
    }
    this.expect('RPAREN', '")"')
    return { kind: 'For', varName: varTok.text, start, end, step }
  }

  private parseFix(): Stmt {
    this.advance() // Fix
    const digitTok = this.current()
    if (digitTok.type !== 'NUMBER' || !/^[0-9]$/.test(digitTok.text)) {
      this.error('Fix requires a single digit 0-9')
    }
    this.advance()
    return { kind: 'SetDecimalMode', digits: Number(digitTok.text) }
  }

  /** Reads a 1-2 character label name from consecutive VAR/single-digit tokens. */
  private parseLabelName(): string {
    let name = ''
    for (let i = 0; i < 2; i++) {
      const tok = this.current()
      if (tok.type === 'VAR') {
        name += tok.text
        this.advance()
      } else if (tok.type === 'NUMBER' && /^[0-9]$/.test(tok.text)) {
        name += tok.text
        this.advance()
      } else {
        break
      }
    }
    if (name.length === 0) {
      this.error('Expected a label name (1-2 letters/digits)')
    }
    return name
  }

  private parseLbl(): Stmt {
    this.advance() // Lbl
    return { kind: 'Lbl', name: this.parseLabelName() }
  }

  private parseGoto(): Stmt {
    this.advance() // Goto
    return { kind: 'Goto', name: this.parseLabelName() }
  }

  private parseIsDs(kind: 'IsGt' | 'DsLt'): Stmt {
    this.advance() // IS>( or DS<(
    const varTok = this.expect('VAR', 'a variable (A-Z or θ)')
    this.expect('COMMA', '","')
    const value = this.parseExpr()
    this.expect('RPAREN', '")"')
    return { kind, varName: varTok.text, value }
  }

  private parseMenu(): Stmt {
    this.advance() // Menu(
    const title = this.parseExpr()
    const options: MenuOption[] = []
    while (this.current().type === 'COMMA') {
      this.advance()
      const text = this.parseExpr()
      this.expect('COMMA', '","')
      const label = this.parseLabelName()
      options.push({ text, label })
    }
    this.expect('RPAREN', '")"')
    if (options.length === 0) {
      this.error('Menu( requires at least one "text",label pair')
    }
    if (options.length > 7) {
      this.diagnostics.push({
        code: 'ERR:ARGUMENT',
        message: 'Menu( supports at most 7 options on a TI-84',
        line: this.current().line,
      })
    }
    return { kind: 'Menu', title, options }
  }

  private parsePause(): Stmt {
    this.advance() // Pause
    if (isStmtEnd(this.current())) return { kind: 'Pause', value: null }
    return { kind: 'Pause', value: this.parseExpr() }
  }

  private parseDisp(): Stmt {
    this.advance() // Disp
    const values: Expr[] = []
    if (!isStmtEnd(this.current())) {
      values.push(this.parseExpr())
      while (this.current().type === 'COMMA') {
        this.advance()
        values.push(this.parseExpr())
      }
    }
    return { kind: 'Disp', values }
  }

  private parseOutput(): Stmt {
    this.advance() // Output(
    const row = this.parseExpr()
    this.expect('COMMA', '","')
    const col = this.parseExpr()
    this.expect('COMMA', '","')
    const value = this.parseExpr()
    this.expect('RPAREN', '")"')
    return { kind: 'Output', row, col, value }
  }

  private parseFill(): Stmt {
    this.advance() // Fill(
    const value = this.parseExpr()
    this.expect('COMMA', '","')
    const target = this.parseListOrMatrixName()
    this.expect('RPAREN', '")"')
    return { kind: 'Fill', value, target }
  }

  private parseInput(): Stmt {
    this.advance() // Input
    if (isStmtEnd(this.current())) return { kind: 'Input', prompt: null, target: null }
    let prompt: string | null = null
    if (this.current().type === 'STRING') {
      prompt = this.advance().text
      this.expect('COMMA', '","')
    }
    const target = this.parseStoreTarget()
    return { kind: 'Input', prompt, target }
  }

  private parsePrompt(): Stmt {
    this.advance() // Prompt
    const targets: StoreTarget[] = [this.parseStoreTarget()]
    while (this.current().type === 'COMMA') {
      this.advance()
      targets.push(this.parseStoreTarget())
    }
    return { kind: 'Prompt', targets }
  }

  private parsePrgmCall(): Stmt {
    this.advance() // prgm
    let name = ''
    for (let i = 0; i < 8; i++) {
      const tok = this.current()
      if (tok.type === 'VAR') {
        name += tok.text
        this.advance()
      } else if (tok.type === 'NUMBER' && /^[0-9]$/.test(tok.text)) {
        name += tok.text
        this.advance()
      } else {
        break
      }
    }
    if (name.length === 0) this.error('Expected a program name after "prgm"')
    return { kind: 'PrgmCall', name }
  }

  /** Parses a bare list or matrix name, e.g. for dim(L1) / dim([A]) / Fill(0,L1). */
  private parseListOrMatrixName(): { type: 'List'; name: string } | { type: 'Matrix'; name: string } {
    const tok = this.current()
    if (tok.type === 'LIST') {
      this.advance()
      return { type: 'List', name: tok.text }
    }
    if (tok.type === 'MATRIX') {
      this.advance()
      return { type: 'Matrix', name: tok.text.slice(1, -1) }
    }
    this.error('Expected a list (L1-L6) or matrix ([A]-[J])', tok)
  }

  private parseStoreTarget(): StoreTarget {
    const tok = this.current()
    if (tok.type === 'VAR') {
      this.advance()
      return { type: 'Var', name: tok.text }
    }
    if (tok.type === 'STRVAR') {
      this.advance()
      return { type: 'StrVar', name: tok.text }
    }
    if (tok.type === 'LIST') {
      this.advance()
      if (this.current().type === 'LPAREN') {
        this.advance()
        const index = this.parseExpr()
        this.expect('RPAREN', '")"')
        return { type: 'ListElement', name: tok.text, index }
      }
      return { type: 'List', name: tok.text }
    }
    if (tok.type === 'MATRIX') {
      this.advance()
      const name = tok.text.slice(1, -1)
      if (this.current().type === 'LPAREN') {
        this.advance()
        const row = this.parseExpr()
        this.expect('COMMA', '","')
        const col = this.parseExpr()
        this.expect('RPAREN', '")"')
        return { type: 'MatrixElement', name, row, col }
      }
      return { type: 'Matrix', name }
    }
    if (tok.type === 'KEYWORD' && tok.text === 'dim(') {
      this.advance()
      const target = this.parseListOrMatrixName()
      this.expect('RPAREN', '")"')
      return { type: 'Dim', target }
    }
    this.error('Expected a variable, list, matrix, or Str to store into', tok)
  }

  // --- Expressions (lowest to highest precedence) --------------------

  private parseExpr(): Expr {
    return this.parseOr()
  }

  private parseOr(): Expr {
    let left = this.parseAnd()
    while (this.isKeyword('or') || this.isKeyword('xor')) {
      const op = this.advance().text as BinaryOp
      const right = this.parseAnd()
      left = { type: 'Binary', op, left, right }
    }
    return left
  }

  private parseAnd(): Expr {
    let left = this.parseCompare()
    while (this.isKeyword('and')) {
      this.advance()
      const right = this.parseCompare()
      left = { type: 'Binary', op: 'and', left, right }
    }
    return left
  }

  private parseCompare(): Expr {
    let left = this.parseAdd()
    let op = COMPARE_OPS[this.current().type]
    while (op) {
      this.advance()
      const right = this.parseAdd()
      left = { type: 'Binary', op, left, right }
      op = COMPARE_OPS[this.current().type]
    }
    return left
  }

  private parseAdd(): Expr {
    let left = this.parseMul()
    while (this.current().type === 'PLUS' || this.current().type === 'MINUS') {
      const op = this.advance().type === 'PLUS' ? '+' : '-'
      const right = this.parseMul()
      left = { type: 'Binary', op, left, right }
    }
    return left
  }

  private canStartImplicitFactor(tok: Token): boolean {
    if (tok.type === 'NUMBER' || tok.type === 'VAR' || tok.type === 'LIST' || tok.type === 'STRVAR') return true
    if (tok.type === 'ANS' || tok.type === 'PI' || tok.type === 'EULER' || tok.type === 'LPAREN') return true
    if (tok.type === 'MATRIX') return true
    if (tok.type === 'KEYWORD' && tok.text.endsWith('(') && !STATEMENT_ONLY_KEYWORDS.has(tok.text)) return true
    return false
  }

  private parseMul(): Expr {
    let left = this.parseUnary()
    for (;;) {
      const tok = this.current()
      if (tok.type === 'STAR' || tok.type === 'SLASH') {
        const op = this.advance().type === 'STAR' ? '*' : '/'
        const right = this.parseUnary()
        left = { type: 'Binary', op, left, right }
      } else if (this.isKeyword('nCr') || this.isKeyword('nPr')) {
        const op = this.advance().text as BinaryOp
        const right = this.parseUnary()
        left = { type: 'Binary', op, left, right }
      } else if (this.canStartImplicitFactor(tok)) {
        const right = this.parseUnary()
        left = { type: 'Binary', op: '*', left, right }
      } else {
        break
      }
    }
    return left
  }

  private parseUnary(): Expr {
    if (this.current().type === 'MINUS') {
      this.advance()
      return { type: 'Unary', op: '-', operand: this.parseUnary() }
    }
    return this.parsePow()
  }

  private parsePow(): Expr {
    const base = this.parsePostfix()
    if (this.current().type === 'CARET') {
      this.advance()
      const exponent = this.parseUnary()
      return { type: 'Binary', op: '^', left: base, right: exponent }
    }
    return base
  }

  private parsePostfix(): Expr {
    let expr = this.parsePrimary()
    for (;;) {
      const tok = this.current()
      if (tok.type === 'SQUARE') {
        this.advance()
        expr = { type: 'Postfix', op: '²', operand: expr }
      } else if (tok.type === 'INVERSE') {
        this.advance()
        expr = { type: 'Postfix', op: '⁻¹', operand: expr }
      } else if (tok.type === 'BANG') {
        this.advance()
        expr = { type: 'Postfix', op: '!', operand: expr }
      } else if (tok.type === 'KEYWORD' && (tok.text === '►Frac' || tok.text === '►Dec')) {
        this.advance()
        expr = { type: 'Postfix', op: tok.text, operand: expr }
      } else {
        break
      }
    }
    return expr
  }

  private parsePrimary(): Expr {
    const tok = this.current()
    switch (tok.type) {
      case 'NUMBER':
        this.advance()
        return { type: 'Number', value: tok.value ?? Number(tok.text) }
      case 'STRING':
        this.advance()
        return { type: 'String', value: tok.text }
      case 'ANS':
        this.advance()
        return { type: 'Ans' }
      case 'PI':
        this.advance()
        return { type: 'Pi' }
      case 'EULER':
        this.advance()
        return { type: 'Euler' }
      case 'VAR':
        this.advance()
        return { type: 'Var', name: tok.text }
      case 'STRVAR':
        this.advance()
        return { type: 'StrVar', name: tok.text }
      case 'LIST': {
        this.advance()
        if (this.current().type === 'LPAREN') {
          this.advance()
          const index = this.parseExpr()
          this.expect('RPAREN', '")"')
          return { type: 'ListElement', name: tok.text, index }
        }
        return { type: 'List', name: tok.text }
      }
      case 'LPAREN': {
        this.advance()
        const inner = this.parseExpr()
        this.expect('RPAREN', '")"')
        return inner
      }
      case 'LBRACE': {
        this.advance()
        const elements: Expr[] = []
        if (this.current().type !== 'RBRACE') {
          elements.push(this.parseExpr())
          while (this.current().type === 'COMMA') {
            this.advance()
            elements.push(this.parseExpr())
          }
        }
        this.expect('RBRACE', '"}"')
        return { type: 'ListLiteral', elements }
      }
      case 'MATRIX': {
        this.advance()
        const name = tok.text.slice(1, -1) // "[A]" -> "A"
        if (this.current().type === 'LPAREN') {
          this.advance()
          const row = this.parseExpr()
          this.expect('COMMA', '","')
          const col = this.parseExpr()
          this.expect('RPAREN', '")"')
          return { type: 'MatrixElement', name, row, col }
        }
        return { type: 'Matrix', name }
      }
      case 'LBRACKET': {
        // A matrix literal: [[1,2,3][4,5,6]] — one or more row-brackets,
        // one immediately after another (no comma between rows).
        this.advance()
        const rows: Expr[][] = []
        while (this.current().type === 'LBRACKET') {
          this.advance()
          const row: Expr[] = [this.parseExpr()]
          while (this.current().type === 'COMMA') {
            this.advance()
            row.push(this.parseExpr())
          }
          this.expect('RBRACKET', '"]"')
          rows.push(row)
        }
        this.expect('RBRACKET', '"]"')
        if (rows.length === 0) this.error('A matrix literal needs at least one row, e.g. [[1,2][3,4]]')
        const width = rows[0].length
        if (rows.some((r) => r.length !== width)) {
          this.error('Every row in a matrix literal must have the same number of columns')
        }
        return { type: 'MatrixLiteral', rows }
      }
      case 'KEYWORD': {
        if (STATEMENT_ONLY_KEYWORDS.has(tok.text)) {
          this.error(`"${tok.text}" cannot be used inside an expression`)
        }
        if (tok.text.endsWith('(')) {
          this.advance()
          const args: Expr[] = []
          if (this.current().type !== 'RPAREN') {
            args.push(this.parseExpr())
            while (this.current().type === 'COMMA') {
              this.advance()
              args.push(this.parseExpr())
            }
          }
          this.expect('RPAREN', '")"')
          return { type: 'Call', name: tok.text, args }
        }
        if (tok.text === 'getKey') {
          this.advance()
          return { type: 'Call', name: 'getKey', args: [] }
        }
        this.error(`Unexpected "${tok.text}" in expression`)
        break
      }
      default:
        break
    }
    this.error('Expected a value')
  }
}

export interface ParseResult {
  program: Program
  diagnostics: Diagnostic[]
}

export function parse(source: string): ParseResult {
  const { tokens, diagnostics } = tokenize(source)
  const parser = new Parser(tokens, diagnostics)
  const program = parser.parseProgram()
  return { program, diagnostics: parser.diagnostics }
}
