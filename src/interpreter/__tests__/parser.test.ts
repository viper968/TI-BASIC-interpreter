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
})
