import type { Diagnostic } from './errors'
import type { Token, TokenType } from './tokens'
import { COMMANDS, STAT_VAR_NAMES } from './commands'

interface KeywordEntry {
  match: string
  type: TokenType
  text: string
}

// Registry-driven commands become KEYWORD tokens, EXCEPT the handful that
// are really just built from other primitive tokens (see comments below) or
// need a distinct token type of their own.
const EXCLUDED_FROM_KEYWORD_TABLE = new Set([
  '→', // STO, has its own token type
  'π', // PI, has its own token type
  'Ans', // ANS, has its own token type
  'prgm', // PRGM, has its own token type
  '10^(', // == NUMBER(10) CARET LPAREN, no special token needed
  'e^(', // == EULER CARET LPAREN, no special token needed
  '*row(', // starts with '*', matched explicitly before the generic STAR check
  '*row+(', // ditto
  '1-Var Stats', // starts with a digit, matched explicitly before number lexing
  '2-Var Stats', // ditto
])

function buildKeywordTable(): KeywordEntry[] {
  const entries: KeywordEntry[] = [
    { match: 'pi', type: 'PI', text: 'π' },
    { match: 'π', type: 'PI', text: 'π' },
    { match: 'Ans', type: 'ANS', text: 'Ans' },
    { match: 'prgm', type: 'PRGM', text: 'prgm' },
    { match: 'e', type: 'EULER', text: 'e' },
  ]
  for (const cmd of COMMANDS) {
    // Statistics/regression results (n, a, b, r, MeanX, Σx, ...) behave like
    // ordinary variables — readable, writable, implicit-multiplication-
    // eligible — so they get the VAR token type instead of KEYWORD.
    const type: TokenType = STAT_VAR_NAMES.has(cmd.name) ? 'VAR' : 'KEYWORD'
    if (!EXCLUDED_FROM_KEYWORD_TABLE.has(cmd.name)) {
      entries.push({ match: cmd.name, type, text: cmd.name })
    }
    for (const alias of cmd.aliases ?? []) {
      entries.push({ match: alias, type, text: cmd.name })
    }
  }
  // Longest match wins, so greedy scanning finds e.g. "For(" before "F".
  entries.sort((a, b) => b.match.length - a.match.length)
  return entries
}

const KEYWORD_TABLE = buildKeywordTable()

const SUPERSCRIPT_TWO = '²' // ²
const SUPERSCRIPT_INVERSE = '⁻¹' // ⁻¹

export interface LexResult {
  tokens: Token[]
  diagnostics: Diagnostic[]
}

export function tokenize(source: string): LexResult {
  const tokens: Token[] = []
  const diagnostics: Diagnostic[] = []
  let pos = 0
  let line = 1
  let column = 1
  const len = source.length

  function advance(n: number) {
    for (let i = 0; i < n; i++) {
      if (source[pos] === '\n') {
        line++
        column = 1
      } else {
        column++
      }
      pos++
    }
  }

  function push(type: TokenType, text: string, startLine: number, startCol: number, value?: number) {
    tokens.push({ type, text, value, line: startLine, column: startCol })
  }

  while (pos < len) {
    const ch = source[pos]
    const startLine = line
    const startCol = column

    if (ch === '\n') {
      push('NEWLINE', '\n', startLine, startCol)
      advance(1)
      continue
    }
    if (ch === '\r') {
      advance(1)
      continue
    }
    if (ch === ' ' || ch === '\t') {
      advance(1)
      continue
    }
    // "1-Var Stats" / "2-Var Stats" start with a digit, so they must be
    // checked before the generic number-lexing branch claims the "1"/"2".
    if (source.startsWith('1-Var Stats', pos)) {
      push('KEYWORD', '1-Var Stats', startLine, startCol)
      advance('1-Var Stats'.length)
      continue
    }
    if (source.startsWith('2-Var Stats', pos)) {
      push('KEYWORD', '2-Var Stats', startLine, startCol)
      advance('2-Var Stats'.length)
      continue
    }
    if (ch === ':') {
      push('COLON', ':', startLine, startCol)
      advance(1)
      continue
    }
    if (ch === ',') {
      push('COMMA', ',', startLine, startCol)
      advance(1)
      continue
    }
    if (ch === '(') {
      push('LPAREN', '(', startLine, startCol)
      advance(1)
      continue
    }
    if (ch === ')') {
      push('RPAREN', ')', startLine, startCol)
      advance(1)
      continue
    }
    if (ch === '{') {
      push('LBRACE', '{', startLine, startCol)
      advance(1)
      continue
    }
    if (ch === '}') {
      push('RBRACE', '}', startLine, startCol)
      advance(1)
      continue
    }
    if (ch === '[') {
      // [A]-[J] (a matrix name) lexes as one token, mirroring L1-L6; any
      // other "[" (e.g. the start of a [[1,2][3,4]] literal) is generic.
      if (source[pos + 1] >= 'A' && source[pos + 1] <= 'J' && source[pos + 2] === ']') {
        push('MATRIX', source.slice(pos, pos + 3), startLine, startCol)
        advance(3)
        continue
      }
      push('LBRACKET', '[', startLine, startCol)
      advance(1)
      continue
    }
    if (ch === ']') {
      push('RBRACKET', ']', startLine, startCol)
      advance(1)
      continue
    }
    if (ch === '"') {
      let str = ''
      advance(1)
      let terminated = false
      while (pos < len && source[pos] !== '\n') {
        if (source[pos] === '"') {
          terminated = true
          advance(1)
          break
        }
        str += source[pos]
        advance(1)
      }
      if (!terminated) {
        diagnostics.push({
          code: 'ERR:SYNTAX',
          message: 'Unterminated string (missing closing ")',
          line: startLine,
          column: startCol,
        })
      }
      push('STRING', str, startLine, startCol)
      continue
    }
    if ((ch >= '0' && ch <= '9') || (ch === '.' && source[pos + 1] >= '0' && source[pos + 1] <= '9')) {
      let text = ''
      while (pos < len && source[pos] >= '0' && source[pos] <= '9') {
        text += source[pos]
        advance(1)
      }
      if (source[pos] === '.') {
        text += '.'
        advance(1)
        while (pos < len && source[pos] >= '0' && source[pos] <= '9') {
          text += source[pos]
          advance(1)
        }
      }
      if (source[pos] === 'E' && (source[pos + 1] === '-' || (source[pos + 1] >= '0' && source[pos + 1] <= '9'))) {
        text += 'E'
        advance(1)
        if (source[pos] === '-') {
          text += '-'
          advance(1)
        }
        while (pos < len && source[pos] >= '0' && source[pos] <= '9') {
          text += source[pos]
          advance(1)
        }
      }
      push('NUMBER', text, startLine, startCol, Number(text))
      continue
    }
    if (ch === '-' && source[pos + 1] === '>') {
      push('STO', '→', startLine, startCol)
      advance(2)
      continue
    }
    if (ch === '→') {
      push('STO', '→', startLine, startCol)
      advance(1)
      continue
    }
    if (ch === '+') {
      push('PLUS', '+', startLine, startCol)
      advance(1)
      continue
    }
    if (ch === '-') {
      push('MINUS', '-', startLine, startCol)
      advance(1)
      continue
    }
    if (ch === '*') {
      // *row( and *row+( are MATRX MATH row-operation commands whose names
      // happen to start with the multiply glyph; check for them before
      // falling back to a plain STAR operator.
      if (source.startsWith('*row+(', pos)) {
        push('KEYWORD', '*row+(', startLine, startCol)
        advance(6)
        continue
      }
      if (source.startsWith('*row(', pos)) {
        push('KEYWORD', '*row(', startLine, startCol)
        advance(5)
        continue
      }
      push('STAR', '*', startLine, startCol)
      advance(1)
      continue
    }
    if (ch === '/') {
      push('SLASH', '/', startLine, startCol)
      advance(1)
      continue
    }
    if (ch === '^') {
      push('CARET', '^', startLine, startCol)
      advance(1)
      continue
    }
    if (ch === '=') {
      push('EQ', '=', startLine, startCol)
      advance(1)
      continue
    }
    if (ch === '≠') {
      push('NE', '≠', startLine, startCol)
      advance(1)
      continue
    }
    if (ch === '!' && source[pos + 1] === '=') {
      push('NE', '≠', startLine, startCol)
      advance(2)
      continue
    }
    if (ch === '!') {
      push('BANG', '!', startLine, startCol)
      advance(1)
      continue
    }
    if (ch === '<') {
      if (source[pos + 1] === '=') {
        push('LE', '≤', startLine, startCol)
        advance(2)
      } else {
        push('LT', '<', startLine, startCol)
        advance(1)
      }
      continue
    }
    if (ch === '>') {
      if (source[pos + 1] === '=') {
        push('GE', '≥', startLine, startCol)
        advance(2)
      } else {
        push('GT', '>', startLine, startCol)
        advance(1)
      }
      continue
    }
    if (ch === '≤') {
      push('LE', '≤', startLine, startCol)
      advance(1)
      continue
    }
    if (ch === '≥') {
      push('GE', '≥', startLine, startCol)
      advance(1)
      continue
    }
    if (ch === SUPERSCRIPT_TWO) {
      push('SQUARE', '²', startLine, startCol)
      advance(1)
      continue
    }
    if (source.startsWith(SUPERSCRIPT_INVERSE, pos)) {
      push('INVERSE', '⁻¹', startLine, startCol)
      advance(2)
      continue
    }

    if (/[A-Za-z]/.test(ch) || ch === 'θ' || ch === 'π' || ch === '√' || ch === '►' || ch === 'Σ' || ch === 'σ') {
      // Greedy keyword match: try the longest known command/keyword spelling
      // at this position before falling back to variable rules. This is what
      // lets "For(" be a single token while "AB" still lexes as two
      // single-letter variables (A times B, via implicit multiplication).
      let matched: KeywordEntry | undefined
      for (const entry of KEYWORD_TABLE) {
        if (source.startsWith(entry.match, pos)) {
          matched = entry
          break
        }
      }
      if (matched) {
        push(matched.type, matched.text, startLine, startCol)
        advance(matched.match.length)
        continue
      }
      if (source.startsWith('Str', pos) && source[pos + 3] >= '0' && source[pos + 3] <= '9') {
        const text = source.slice(pos, pos + 4)
        push('STRVAR', text, startLine, startCol)
        advance(4)
        continue
      }
      if (ch === 'L' && source[pos + 1] >= '1' && source[pos + 1] <= '6') {
        const text = source.slice(pos, pos + 2)
        push('LIST', text, startLine, startCol)
        advance(2)
        continue
      }
      if (ch === 'θ') {
        push('VAR', 'θ', startLine, startCol)
        advance(1)
        continue
      }
      if (ch >= 'A' && ch <= 'Z') {
        push('VAR', ch, startLine, startCol)
        advance(1)
        continue
      }
      // A lowercase letter that isn't part of any recognized keyword.
      diagnostics.push({
        code: 'ERR:SYNTAX',
        message: `Unrecognized command or variable starting at "${ch}"`,
        line: startLine,
        column: startCol,
      })
      advance(1)
      continue
    }

    diagnostics.push({
      code: 'ERR:SYNTAX',
      message: `Unexpected character "${ch}"`,
      line: startLine,
      column: startCol,
    })
    advance(1)
  }

  push('EOF', '', line, column)
  return { tokens, diagnostics }
}
