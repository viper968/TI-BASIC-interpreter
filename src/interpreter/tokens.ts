/** Token kinds produced by the lexer. */
export type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'VAR' // single-letter real variable: A-Z or theta
  | 'LIST' // L1-L6
  | 'MATRIX' // [A]-[J], as one token e.g. "[A]"
  | 'STRVAR' // Str0-Str9
  | 'YVAR' // Y0-Y9
  | 'ANS'
  | 'PI'
  | 'EULER'
  | 'KEYWORD' // command / keyword text, e.g. "For(", "Disp", "and"
  | 'PRGM' // the `prgm` prefix keyword itself
  | 'STO' // -> or the TI store arrow
  | 'LPAREN'
  | 'RPAREN'
  | 'LBRACE'
  | 'RBRACE'
  | 'LBRACKET'
  | 'RBRACKET'
  | 'COMMA'
  | 'COLON'
  | 'NEWLINE'
  | 'PLUS'
  | 'MINUS'
  | 'STAR'
  | 'SLASH'
  | 'CARET'
  | 'EQ'
  | 'NE'
  | 'LT'
  | 'GT'
  | 'LE'
  | 'GE'
  | 'SQUARE' // postfix ²
  | 'INVERSE' // postfix ⁻¹
  | 'BANG' // postfix !
  | 'QUOTE_UNTERMINATED'
  | 'EOF'

export interface Token {
  type: TokenType
  /** Raw/normalized text of the token (keywords are normalized to canonical spelling). */
  text: string
  /** Parsed numeric value, only set for NUMBER tokens. */
  value?: number
  line: number
  column: number
}
