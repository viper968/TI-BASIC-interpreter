/** Expression AST. */
export type Expr =
  | { type: 'Number'; value: number }
  | { type: 'String'; value: string }
  | { type: 'Var'; name: string } // A-Z or θ
  | { type: 'List'; name: string } // whole list, e.g. L1
  | { type: 'ListElement'; name: string; index: Expr } // L1(3)
  | { type: 'StrVar'; name: string } // Str0-Str9
  | { type: 'Ans' }
  | { type: 'Pi' }
  | { type: 'Euler' }
  | { type: 'Unary'; op: '-'; operand: Expr }
  | { type: 'Binary'; op: BinaryOp; left: Expr; right: Expr }
  | { type: 'Postfix'; op: '²' | '⁻¹' | '!' | '►Frac' | '►Dec'; operand: Expr }
  | { type: 'Call'; name: string; args: Expr[] } // name is the canonical keyword, e.g. "sin("
  | { type: 'ListLiteral'; elements: Expr[] } // {1,2,3}

export type BinaryOp =
  | '+'
  | '-'
  | '*'
  | '/'
  | '^'
  | '='
  | '≠'
  | '<'
  | '>'
  | '≤'
  | '≥'
  | 'and'
  | 'or'
  | 'xor'
  | 'nCr'
  | 'nPr'

/** Anything an expression's value can be stored into. */
export type StoreTarget =
  | { type: 'Var'; name: string }
  | { type: 'List'; name: string }
  | { type: 'ListElement'; name: string; index: Expr }
  | { type: 'StrVar'; name: string }

export interface MenuOption {
  text: Expr
  label: string
}

/** A single logical statement. Statements form a flat, linear program. */
export type Stmt =
  | { kind: 'Expr'; expr: Expr }
  | { kind: 'Store'; expr: Expr; target: StoreTarget }
  | { kind: 'If'; cond: Expr; blockMode: boolean }
  | { kind: 'Else' }
  | { kind: 'End' }
  | { kind: 'For'; varName: string; start: Expr; end: Expr; step: Expr | null }
  | { kind: 'While'; cond: Expr }
  | { kind: 'Repeat'; cond: Expr }
  | { kind: 'Lbl'; name: string }
  | { kind: 'Goto'; name: string }
  | { kind: 'IsGt'; varName: string; value: Expr }
  | { kind: 'DsLt'; varName: string; value: Expr }
  | { kind: 'Menu'; title: Expr; options: MenuOption[] }
  | { kind: 'Return' }
  | { kind: 'Stop' }
  | { kind: 'Pause'; value: Expr | null }
  | { kind: 'Disp'; values: Expr[] }
  | { kind: 'Output'; row: Expr; col: Expr; value: Expr }
  | { kind: 'Input'; prompt: string | null; target: StoreTarget | null }
  | { kind: 'Prompt'; targets: StoreTarget[] }
  | { kind: 'ClrHome' }
  | { kind: 'DelVar'; target: StoreTarget }
  | { kind: 'PrgmCall'; name: string }
  | { kind: 'SetAngleMode'; mode: 'degree' | 'radian' }
  | { kind: 'SetDecimalMode'; digits: number | null } // Fix n (0-9), or Float (null)
  | { kind: 'SetNotation'; mode: 'normal' | 'sci' | 'eng' }

/** One instruction slot in the compiled, flat program. */
export interface Instruction {
  stmt: Stmt
  line: number
}

export interface Program {
  instructions: Instruction[]
}
