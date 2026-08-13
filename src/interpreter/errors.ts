/**
 * Error model for the TI-BASIC interpreter.
 *
 * The TI-84 / TI-84 Plus Silver Edition reports problems as short
 * "ERR:XXXXX" screens with a 1:Quit 2:Goto menu. We mirror the same
 * vocabulary so messages feel authentic and so the GUI can render the
 * classic error dialog.
 *
 * `TIError` is used for BOTH compile-time (syntax/link) problems and
 * runtime problems. Compile-time errors carry a `line` (1-based, into the
 * source text) so the editor can point at the offending line, matching
 * how the calculator's "Goto" option jumps you to the error location.
 */

/** The subset of TI-OS error codes this interpreter can raise. */
export type TIErrorCode =
  | 'ERR:SYNTAX'
  | 'ERR:DATA TYPE'
  | 'ERR:UNDEFINED'
  | 'ERR:DIM MISMATCH'
  | 'ERR:INVALID DIM'
  | 'ERR:DOMAIN'
  | 'ERR:DIVIDE BY 0'
  | 'ERR:ARGUMENT'
  | 'ERR:LABEL'
  | 'ERR:STO'
  | 'ERR:MEMORY'
  | 'ERR:NONREAL ANS'

export class TIError extends Error {
  readonly code: TIErrorCode
  /** 1-based source line, when known (compile-time or a running statement). */
  readonly line?: number

  constructor(code: TIErrorCode, message: string, line?: number) {
    super(message)
    this.name = 'TIError'
    this.code = code
    this.line = line
  }
}

/** A single compile-time (lex/parse/link) diagnostic. */
export interface Diagnostic {
  code: TIErrorCode
  message: string
  /** 1-based line number in the source. */
  line: number
  /** 1-based column, when known. */
  column?: number
}

export class DiagnosticError extends Error {
  readonly diagnostic: Diagnostic
  constructor(diagnostic: Diagnostic) {
    super(diagnostic.message)
    this.name = 'DiagnosticError'
    this.diagnostic = diagnostic
  }
}
