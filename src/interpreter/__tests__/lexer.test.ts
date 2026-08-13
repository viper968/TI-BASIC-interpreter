import { describe, expect, it } from 'vitest'
import { tokenize } from '../lexer'

function types(source: string) {
  return tokenize(source).tokens.map((t) => t.type)
}
function texts(source: string) {
  return tokenize(source).tokens.map((t) => t.text)
}

describe('lexer', () => {
  it('tokenizes numbers including decimals and scientific notation', () => {
    const { tokens } = tokenize('3.14 2E5 0.5')
    expect(tokens.map((t) => t.value)).toEqual([3.14, 200000, 0.5, undefined])
    expect(tokens[3].type).toBe('EOF')
  })

  it('tokenizes a leading-dot decimal like ".5"', () => {
    const { tokens, diagnostics } = tokenize('.5')
    expect(diagnostics).toHaveLength(0)
    expect(tokens[0]).toMatchObject({ type: 'NUMBER', value: 0.5 })
  })

  it('tokenizes { and } for list literals', () => {
    expect(types('{1,2,3}')).toEqual(['LBRACE', 'NUMBER', 'COMMA', 'NUMBER', 'COMMA', 'NUMBER', 'RBRACE', 'EOF'])
  })

  it('tokenizes ►Frac and ►Dec', () => {
    const { tokens, diagnostics } = tokenize('.5►Frac►Dec')
    expect(diagnostics).toHaveLength(0)
    expect(tokens.map((t) => t.text)).toEqual(['.5', '►Frac', '►Dec', ''])
  })

  it('greedily matches multi-character keywords over single-letter variables', () => {
    expect(types('For(I,1,10)\nEnd')).toEqual([
      'KEYWORD',
      'VAR',
      'COMMA',
      'NUMBER',
      'COMMA',
      'NUMBER',
      'RPAREN',
      'NEWLINE',
      'KEYWORD',
      'EOF',
    ])
    expect(texts('For(I,1,10)\nEnd')).toEqual(['For(', 'I', ',', '1', ',', '10', ')', '\n', 'End', ''])
  })

  it('splits an unrecognized run of letters into single-letter variables (implicit multiplication)', () => {
    // "AB" is not a keyword, so it must lex as A then B (A times B).
    expect(types('AB')).toEqual(['VAR', 'VAR', 'EOF'])
    expect(texts('AB')).toEqual(['A', 'B', ''])
  })

  it('recognizes Str0-Str9 and L1-L6 as whole tokens', () => {
    expect(types('Str1')).toEqual(['STRVAR', 'EOF'])
    expect(types('L3')).toEqual(['LIST', 'EOF'])
    // L7 is not a valid list, so it should NOT be swallowed as one token.
    expect(types('L7')).toEqual(['VAR', 'NUMBER', 'EOF'])
  })

  it('accepts the ASCII store-arrow alias "->"', () => {
    expect(types('5->A')).toEqual(['NUMBER', 'STO', 'VAR', 'EOF'])
  })

  it('accepts sqrt( as an alias for √(', () => {
    const { tokens } = tokenize('sqrt(4)')
    expect(tokens[0].type).toBe('KEYWORD')
    expect(tokens[0].text).toBe('√(')
  })

  it('tokenizes relational operator aliases', () => {
    expect(types('A<=B')).toEqual(['VAR', 'LE', 'VAR', 'EOF'])
    expect(types('A>=B')).toEqual(['VAR', 'GE', 'VAR', 'EOF'])
    expect(types('A!=B')).toEqual(['VAR', 'NE', 'VAR', 'EOF'])
  })

  it('reads strings and reports unterminated ones', () => {
    const ok = tokenize('"HELLO"')
    expect(ok.tokens[0]).toMatchObject({ type: 'STRING', text: 'HELLO' })
    expect(ok.diagnostics).toHaveLength(0)

    const bad = tokenize('"HELLO')
    expect(bad.diagnostics).toHaveLength(1)
    expect(bad.diagnostics[0].code).toBe('ERR:SYNTAX')
  })

  it('treats colons and newlines as statement separators', () => {
    expect(types('1:2\n3')).toEqual(['NUMBER', 'COLON', 'NUMBER', 'NEWLINE', 'NUMBER', 'EOF'])
  })

  it('flags a stray unrecognized character', () => {
    const { diagnostics } = tokenize('A~B')
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].message).toContain('~')
  })

  it('tokenizes θ, π and e as their own constants', () => {
    expect(types('θ')).toEqual(['VAR', 'EOF'])
    expect(types('π')).toEqual(['PI', 'EOF'])
    expect(types('e')).toEqual(['EULER', 'EOF'])
  })

  it('tokenizes [A]-[J] as a single MATRIX token', () => {
    const { tokens } = tokenize('[A]')
    expect(tokens[0]).toMatchObject({ type: 'MATRIX', text: '[A]' })
    expect(tokens[1].type).toBe('EOF')
  })

  it('does not swallow [K] as a matrix (only A-J are valid matrix names)', () => {
    // "[" then "K" (a variable) then "]" -- three separate tokens.
    expect(types('[K]')).toEqual(['LBRACKET', 'VAR', 'RBRACKET', 'EOF'])
  })

  it('tokenizes [ and ] generically for matrix literals', () => {
    expect(types('[[1,2][3,4]]')).toEqual([
      'LBRACKET',
      'LBRACKET',
      'NUMBER',
      'COMMA',
      'NUMBER',
      'RBRACKET',
      'LBRACKET',
      'NUMBER',
      'COMMA',
      'NUMBER',
      'RBRACKET',
      'RBRACKET',
      'EOF',
    ])
  })

  it('tokenizes the *row( and *row+( row-operation keywords, not a bare STAR', () => {
    const a = tokenize('*row(2,[A],1)')
    expect(a.tokens[0]).toMatchObject({ type: 'KEYWORD', text: '*row(' })

    const b = tokenize('*row+(2,[A],1,2)')
    expect(b.tokens[0]).toMatchObject({ type: 'KEYWORD', text: '*row+(' })

    // A plain multiplication still lexes as STAR.
    expect(types('2*3')).toEqual(['NUMBER', 'STAR', 'NUMBER', 'EOF'])
  })

  it('tokenizes 1-Var Stats and 2-Var Stats as single keywords, not a leading number', () => {
    const a = tokenize('1-Var Stats L1')
    expect(a.tokens[0]).toMatchObject({ type: 'KEYWORD', text: '1-Var Stats' })
    expect(a.tokens[1]).toMatchObject({ type: 'LIST', text: 'L1' })

    const b = tokenize('2-Var Stats')
    expect(b.tokens[0]).toMatchObject({ type: 'KEYWORD', text: '2-Var Stats' })

    // A bare "1" is still just a number.
    expect(types('1-2')).toEqual(['NUMBER', 'MINUS', 'NUMBER', 'EOF'])
  })

  it('tokenizes reserved stat/regression names as VAR tokens, distinct from real vars', () => {
    expect(types('n')).toEqual(['VAR', 'EOF'])
    expect(tokenize('n').tokens[0].text).toBe('n')
    expect(types('MeanX')).toEqual(['VAR', 'EOF'])
    expect(types('Σx')).toEqual(['VAR', 'EOF'])
    expect(types('Σx²')).toEqual(['VAR', 'EOF'])
    expect(types('σx')).toEqual(['VAR', 'EOF'])
    // "a" and "abs(" don't collide: greedy longest-match picks the right one.
    expect(tokenize('abs(').tokens[0]).toMatchObject({ type: 'KEYWORD', text: 'abs(' })
    expect(tokenize('a+1').tokens[0]).toMatchObject({ type: 'VAR', text: 'a' })
  })

  it('accepts ASCII aliases for the Σ/σ stat names', () => {
    expect(tokenize('Sumx').tokens[0]).toMatchObject({ type: 'VAR', text: 'Σx' })
    expect(tokenize('sigmax').tokens[0]).toMatchObject({ type: 'VAR', text: 'σx' })
  })

  it('tokenizes Y0-Y9 as a single YVAR token', () => {
    expect(tokenize('Y1').tokens[0]).toMatchObject({ type: 'YVAR', text: 'Y1' })
    expect(tokenize('Y0').tokens[0]).toMatchObject({ type: 'YVAR', text: 'Y0' })
    // Not part of Y0-Y9: a bare "Y" is just a real variable.
    expect(types('Y')).toEqual(['VAR', 'EOF'])
  })

  it('tokenizes graph window variable names as VAR tokens', () => {
    for (const name of ['Xmin', 'Xmax', 'Xscl', 'Ymin', 'Ymax', 'Yscl', 'Xres']) {
      expect(tokenize(name).tokens[0]).toMatchObject({ type: 'VAR', text: name })
    }
  })
})
