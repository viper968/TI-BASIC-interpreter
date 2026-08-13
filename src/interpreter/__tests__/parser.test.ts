import { describe, expect, it } from 'vitest'
import { parse } from '../parser'

describe('parser: expressions', () => {
  it('respects standard arithmetic precedence', () => {
    const { program, diagnostics } = parse('2+3*4')
    expect(diagnostics).toHaveLength(0)
    const stmt = program.instructions[0].stmt
    if (stmt.kind !== 'Expr') throw new Error('expected Expr')
    expect(stmt.expr).toEqual({
      type: 'Binary',
      op: '+',
      left: { type: 'Number', value: 2 },
      right: { type: 'Binary', op: '*', left: { type: 'Number', value: 3 }, right: { type: 'Number', value: 4 } },
    })
  })

  it('parses implicit multiplication between a number and a variable', () => {
    const { program } = parse('2X')
    const stmt = program.instructions[0].stmt
    if (stmt.kind !== 'Expr') throw new Error('expected Expr')
    expect(stmt.expr).toEqual({
      type: 'Binary',
      op: '*',
      left: { type: 'Number', value: 2 },
      right: { type: 'Var', name: 'X' },
    })
  })

  it('parses implicit multiplication of adjacent single-letter variables (AB = A*B)', () => {
    const { program } = parse('AB')
    const stmt = program.instructions[0].stmt
    if (stmt.kind !== 'Expr') throw new Error('expected Expr')
    expect(stmt.expr).toEqual({
      type: 'Binary',
      op: '*',
      left: { type: 'Var', name: 'A' },
      right: { type: 'Var', name: 'B' },
    })
  })

  it('right-associates exponentiation: 2^3^2 = 2^(3^2)', () => {
    const { program } = parse('2^3^2')
    const stmt = program.instructions[0].stmt
    if (stmt.kind !== 'Expr') throw new Error('expected Expr')
    expect(stmt.expr).toEqual({
      type: 'Binary',
      op: '^',
      left: { type: 'Number', value: 2 },
      right: {
        type: 'Binary',
        op: '^',
        left: { type: 'Number', value: 3 },
        right: { type: 'Number', value: 2 },
      },
    })
  })

  it('gives negation lower precedence than exponentiation: -2^2 = -(2^2)', () => {
    const { program } = parse('-2^2')
    const stmt = program.instructions[0].stmt
    if (stmt.kind !== 'Expr') throw new Error('expected Expr')
    expect(stmt.expr).toEqual({
      type: 'Unary',
      op: '-',
      operand: { type: 'Binary', op: '^', left: { type: 'Number', value: 2 }, right: { type: 'Number', value: 2 } },
    })
  })

  it('parses function calls with multiple arguments', () => {
    const { program, diagnostics } = parse('round(3.14159,2)')
    expect(diagnostics).toHaveLength(0)
    const stmt = program.instructions[0].stmt
    if (stmt.kind !== 'Expr') throw new Error('expected Expr')
    expect(stmt.expr).toEqual({
      type: 'Call',
      name: 'round(',
      args: [
        { type: 'Number', value: 3.14159 },
        { type: 'Number', value: 2 },
      ],
    })
  })

  it('parses list element access', () => {
    const { program } = parse('L1(3)')
    const stmt = program.instructions[0].stmt
    if (stmt.kind !== 'Expr') throw new Error('expected Expr')
    expect(stmt.expr).toEqual({ type: 'ListElement', name: 'L1', index: { type: 'Number', value: 3 } })
  })

  it('parses a {…} list literal', () => {
    const { program, diagnostics } = parse('{1,2,X+1}')
    expect(diagnostics).toHaveLength(0)
    const stmt = program.instructions[0].stmt
    if (stmt.kind !== 'Expr') throw new Error('expected Expr')
    expect(stmt.expr).toEqual({
      type: 'ListLiteral',
      elements: [
        { type: 'Number', value: 1 },
        { type: 'Number', value: 2 },
        { type: 'Binary', op: '+', left: { type: 'Var', name: 'X' }, right: { type: 'Number', value: 1 } },
      ],
    })
  })

  it('parses ►Frac/►Dec as postfix operators', () => {
    const { program, diagnostics } = parse('.5►Frac►Dec')
    expect(diagnostics).toHaveLength(0)
    const stmt = program.instructions[0].stmt
    if (stmt.kind !== 'Expr') throw new Error('expected Expr')
    expect(stmt.expr).toEqual({
      type: 'Postfix',
      op: '►Dec',
      operand: { type: 'Postfix', op: '►Frac', operand: { type: 'Number', value: 0.5 } },
    })
  })

  it('parses a whole-matrix reference', () => {
    const { program, diagnostics } = parse('[A]')
    expect(diagnostics).toHaveLength(0)
    const stmt = program.instructions[0].stmt
    if (stmt.kind !== 'Expr') throw new Error('expected Expr')
    expect(stmt.expr).toEqual({ type: 'Matrix', name: 'A' })
  })

  it('parses matrix element access', () => {
    const { program, diagnostics } = parse('[A](1,2)')
    expect(diagnostics).toHaveLength(0)
    const stmt = program.instructions[0].stmt
    if (stmt.kind !== 'Expr') throw new Error('expected Expr')
    expect(stmt.expr).toEqual({
      type: 'MatrixElement',
      name: 'A',
      row: { type: 'Number', value: 1 },
      col: { type: 'Number', value: 2 },
    })
  })

  it('parses a matrix literal', () => {
    const { program, diagnostics } = parse('[[1,2][3,4]]')
    expect(diagnostics).toHaveLength(0)
    const stmt = program.instructions[0].stmt
    if (stmt.kind !== 'Expr') throw new Error('expected Expr')
    expect(stmt.expr).toEqual({
      type: 'MatrixLiteral',
      rows: [
        [
          { type: 'Number', value: 1 },
          { type: 'Number', value: 2 },
        ],
        [
          { type: 'Number', value: 3 },
          { type: 'Number', value: 4 },
        ],
      ],
    })
  })

  it('rejects a ragged matrix literal', () => {
    const { diagnostics } = parse('[[1,2][3]]')
    expect(diagnostics.length).toBeGreaterThan(0)
  })

  it('implicitly multiplies a number by a matrix', () => {
    const { program, diagnostics } = parse('2[A]')
    expect(diagnostics).toHaveLength(0)
    const stmt = program.instructions[0].stmt
    if (stmt.kind !== 'Expr') throw new Error('expected Expr')
    expect(stmt.expr).toEqual({
      type: 'Binary',
      op: '*',
      left: { type: 'Number', value: 2 },
      right: { type: 'Matrix', name: 'A' },
    })
  })
})

describe('parser: statements', () => {
  it('parses a store statement', () => {
    const { program, diagnostics } = parse('5->A')
    expect(diagnostics).toHaveLength(0)
    expect(program.instructions[0].stmt).toEqual({
      kind: 'Store',
      expr: { type: 'Number', value: 5 },
      target: { type: 'Var', name: 'A' },
    })
  })

  it('parses storing into a whole matrix and a matrix element', () => {
    const whole = parse('[[1,2][3,4]]->[A]')
    expect(whole.diagnostics).toHaveLength(0)
    expect(whole.program.instructions[0].stmt).toMatchObject({ kind: 'Store', target: { type: 'Matrix', name: 'A' } })

    const elem = parse('5->[A](1,2)')
    expect(elem.diagnostics).toHaveLength(0)
    expect(elem.program.instructions[0].stmt).toMatchObject({
      kind: 'Store',
      target: { type: 'MatrixElement', name: 'A', row: { type: 'Number', value: 1 }, col: { type: 'Number', value: 2 } },
    })
  })

  it('parses dim( resize store targets for both lists and matrices', () => {
    const listResize = parse('{5}->dim(L1)')
    expect(listResize.diagnostics).toHaveLength(0)
    expect(listResize.program.instructions[0].stmt).toEqual({
      kind: 'Store',
      expr: { type: 'ListLiteral', elements: [{ type: 'Number', value: 5 }] },
      target: { type: 'Dim', target: { type: 'List', name: 'L1' } },
    })

    const matrixResize = parse('{2,3}->dim([A])')
    expect(matrixResize.diagnostics).toHaveLength(0)
    expect(matrixResize.program.instructions[0].stmt).toMatchObject({
      kind: 'Store',
      target: { type: 'Dim', target: { type: 'Matrix', name: 'A' } },
    })
  })

  it('parses Fill( for a list and a matrix', () => {
    const listFill = parse('Fill(0,L1)')
    expect(listFill.diagnostics).toHaveLength(0)
    expect(listFill.program.instructions[0].stmt).toEqual({
      kind: 'Fill',
      value: { type: 'Number', value: 0 },
      target: { type: 'List', name: 'L1' },
    })

    const matrixFill = parse('Fill(0,[A])')
    expect(matrixFill.diagnostics).toHaveLength(0)
    expect(matrixFill.program.instructions[0].stmt).toEqual({
      kind: 'Fill',
      value: { type: 'Number', value: 0 },
      target: { type: 'Matrix', name: 'A' },
    })
  })

  it('rejects Fill( used inside an expression', () => {
    const { diagnostics } = parse('Disp Fill(0,L1)')
    expect(diagnostics.length).toBeGreaterThan(0)
  })

  it('parses For( with and without a step', () => {
    const withStep = parse('For(I,1,10,2)')
    expect(withStep.diagnostics).toHaveLength(0)
    expect(withStep.program.instructions[0].stmt).toMatchObject({ kind: 'For', varName: 'I' })

    const noStep = parse('For(I,1,10)')
    expect(noStep.diagnostics).toHaveLength(0)
    const stmt = noStep.program.instructions[0].stmt
    if (stmt.kind !== 'For') throw new Error('expected For')
    expect(stmt.step).toBeNull()
  })

  it('detects block-mode If via a following Then', () => {
    const { program, diagnostics } = parse('If A=1\nThen\nDisp "HI"\nEnd')
    expect(diagnostics).toHaveLength(0)
    const ifStmt = program.instructions[0].stmt
    expect(ifStmt).toMatchObject({ kind: 'If', blockMode: true })
  })

  it('treats a plain If (no Then) as single-line mode', () => {
    const { program, diagnostics } = parse('If A=1\nDisp "HI"')
    expect(diagnostics).toHaveLength(0)
    const ifStmt = program.instructions[0].stmt
    expect(ifStmt).toMatchObject({ kind: 'If', blockMode: false })
  })

  it('parses Lbl/Goto label names up to two characters', () => {
    const { program, diagnostics } = parse('Lbl AB\nGoto AB')
    expect(diagnostics).toHaveLength(0)
    expect(program.instructions[0].stmt).toEqual({ kind: 'Lbl', name: 'AB' })
    expect(program.instructions[1].stmt).toEqual({ kind: 'Goto', name: 'AB' })
  })

  it('parses Fix n and the other display-mode statements', () => {
    const fix = parse('Fix 4')
    expect(fix.diagnostics).toHaveLength(0)
    expect(fix.program.instructions[0].stmt).toEqual({ kind: 'SetDecimalMode', digits: 4 })

    const float = parse('Float')
    expect(float.program.instructions[0].stmt).toEqual({ kind: 'SetDecimalMode', digits: null })

    const sci = parse('Sci')
    expect(sci.program.instructions[0].stmt).toEqual({ kind: 'SetNotation', mode: 'sci' })
  })

  it('rejects Fix without a 0-9 digit', () => {
    const { diagnostics } = parse('Fix A')
    expect(diagnostics.length).toBeGreaterThan(0)
  })

  it('parses prgm calls', () => {
    const { program, diagnostics } = parse('prgmHELLO')
    expect(diagnostics).toHaveLength(0)
    expect(program.instructions[0].stmt).toEqual({ kind: 'PrgmCall', name: 'HELLO' })
  })

  it('reports a syntax error for an unterminated Menu(', () => {
    const { diagnostics } = parse('Menu("TITLE","OPT1",A')
    expect(diagnostics.length).toBeGreaterThan(0)
    expect(diagnostics[0].code).toBe('ERR:SYNTAX')
  })

  it('recovers after a syntax error and keeps parsing subsequent statements', () => {
    const { program, diagnostics } = parse('1 +\nDisp "OK"')
    expect(diagnostics.length).toBeGreaterThan(0)
    const last = program.instructions[program.instructions.length - 1].stmt
    expect(last).toMatchObject({ kind: 'Disp' })
  })

  it('parses 1-Var Stats with defaults and with explicit lists', () => {
    const bare = parse('1-Var Stats')
    expect(bare.diagnostics).toHaveLength(0)
    expect(bare.program.instructions[0].stmt).toEqual({ kind: 'OneVarStats', xList: 'L1', freqList: null })

    const explicit = parse('1-Var Stats L2,L3')
    expect(explicit.diagnostics).toHaveLength(0)
    expect(explicit.program.instructions[0].stmt).toEqual({ kind: 'OneVarStats', xList: 'L2', freqList: 'L3' })
  })

  it('parses 2-Var Stats with defaults and with explicit lists', () => {
    const bare = parse('2-Var Stats')
    expect(bare.diagnostics).toHaveLength(0)
    expect(bare.program.instructions[0].stmt).toEqual({
      kind: 'TwoVarStats',
      xList: 'L1',
      yList: 'L2',
      freqList: null,
    })

    const explicit = parse('2-Var Stats L1,L2,L3')
    expect(explicit.diagnostics).toHaveLength(0)
    expect(explicit.program.instructions[0].stmt).toEqual({
      kind: 'TwoVarStats',
      xList: 'L1',
      yList: 'L2',
      freqList: 'L3',
    })
  })

  it('parses LinReg(ax+b) with defaults and with explicit lists', () => {
    const bare = parse('LinReg(ax+b)')
    expect(bare.diagnostics).toHaveLength(0)
    expect(bare.program.instructions[0].stmt).toEqual({ kind: 'LinReg', xList: 'L1', yList: 'L2', freqList: null })

    const explicit = parse('LinReg(ax+b) L3,L4')
    expect(explicit.diagnostics).toHaveLength(0)
    expect(explicit.program.instructions[0].stmt).toEqual({ kind: 'LinReg', xList: 'L3', yList: 'L4', freqList: null })
  })

  it('rejects 1-Var Stats used inside an expression', () => {
    const { diagnostics } = parse('Disp 1-Var Stats')
    expect(diagnostics.length).toBeGreaterThan(0)
  })

  it('parses storing a string into a Y-variable', () => {
    const { program, diagnostics } = parse('"X²"->Y1')
    expect(diagnostics).toHaveLength(0)
    expect(program.instructions[0].stmt).toEqual({
      kind: 'Store',
      expr: { type: 'String', value: 'X²' },
      target: { type: 'YVar', name: 'Y1' },
    })
  })

  it('parses a Y-variable call', () => {
    const { program, diagnostics } = parse('Y1(3)')
    expect(diagnostics).toHaveLength(0)
    const stmt = program.instructions[0].stmt
    if (stmt.kind !== 'Expr') throw new Error('expected Expr')
    expect(stmt.expr).toEqual({ type: 'YCall', name: 'Y1', arg: { type: 'Number', value: 3 } })
  })

  it('rejects a bare Y-variable with no call parens', () => {
    const { diagnostics } = parse('Disp Y1')
    expect(diagnostics.length).toBeGreaterThan(0)
  })

  it('parses DispGraph and ClrDraw', () => {
    expect(parse('DispGraph').program.instructions[0].stmt).toEqual({ kind: 'DispGraph' })
    expect(parse('ClrDraw').program.instructions[0].stmt).toEqual({ kind: 'ClrDraw' })
  })

  it('parses Line( with and without the erase argument', () => {
    const drawn = parse('Line(0,0,5,5)')
    expect(drawn.diagnostics).toHaveLength(0)
    expect(drawn.program.instructions[0].stmt).toEqual({
      kind: 'Line',
      x1: { type: 'Number', value: 0 },
      y1: { type: 'Number', value: 0 },
      x2: { type: 'Number', value: 5 },
      y2: { type: 'Number', value: 5 },
      erase: null,
    })

    const erased = parse('Line(0,0,5,5,0)')
    expect(erased.diagnostics).toHaveLength(0)
    const stmt = erased.program.instructions[0].stmt
    if (stmt.kind !== 'Line') throw new Error('expected Line')
    expect(stmt.erase).toEqual({ type: 'Number', value: 0 })
  })

  it('parses Circle(', () => {
    const { program, diagnostics } = parse('Circle(0,0,5)')
    expect(diagnostics).toHaveLength(0)
    expect(program.instructions[0].stmt).toEqual({
      kind: 'Circle',
      x: { type: 'Number', value: 0 },
      y: { type: 'Number', value: 0 },
      radius: { type: 'Number', value: 5 },
    })
  })

  it('parses Pxl-On(/Pxl-Off(/Pxl-Change(', () => {
    expect(parse('Pxl-On(1,2)').program.instructions[0].stmt).toEqual({
      kind: 'PxlOn',
      row: { type: 'Number', value: 1 },
      col: { type: 'Number', value: 2 },
    })
    expect(parse('Pxl-Off(1,2)').program.instructions[0].stmt).toMatchObject({ kind: 'PxlOff' })
    expect(parse('Pxl-Change(1,2)').program.instructions[0].stmt).toMatchObject({ kind: 'PxlChange' })
  })

  it('parses window variables as ordinary variables', () => {
    const { program, diagnostics } = parse('-5->Xmin')
    expect(diagnostics).toHaveLength(0)
    expect(program.instructions[0].stmt).toMatchObject({ kind: 'Store', target: { type: 'Var', name: 'Xmin' } })
  })
})
