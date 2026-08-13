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
})
