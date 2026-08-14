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
  | { type: 'Unary'; op: '-'; operand: Expr }
  | { type: 'Binary'; op: BinaryOp; left: Expr; right: Expr }
  | { type: 'Postfix'; op: '²' | '⁻¹' | '!' | '►Frac' | '►Dec'; operand: Expr }
  | { type: 'Call'; name: string; args: Expr[] } // name is the canonical keyword, e.g. "sin("
  | { type: 'ListLiteral'; elements: Expr[] } // {1,2,3}
  | { type: 'Matrix'; name: string } // whole matrix, e.g. [A]
  | { type: 'MatrixElement'; name: string; row: Expr; col: Expr } // [A](1,2)
  | { type: 'MatrixLiteral'; rows: Expr[][] } // [[1,2][3,4]]
  | { type: 'YCall'; name: string; arg: Expr } // Y1(x): evaluate the stored definition at x
  | { type: 'Imaginary' } // i, the imaginary unit

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
  | { type: 'Matrix'; name: string }
  | { type: 'MatrixElement'; name: string; row: Expr; col: Expr }
  /** {rows[,cols]}->dim(L1) or {rows,cols}->dim([A]): resizes/(re)creates the target. */
  | { type: 'Dim'; target: { type: 'List'; name: string } | { type: 'Matrix'; name: string } }
  | { type: 'YVar'; name: string } // "expr"→Y1: defines the function

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
  | { kind: 'Fill'; value: Expr; target: { type: 'List'; name: string } | { type: 'Matrix'; name: string } }
  | { kind: 'OneVarStats'; xList: string; freqList: string | null }
  | { kind: 'TwoVarStats'; xList: string; yList: string; freqList: string | null }
  | { kind: 'LinReg'; xList: string; yList: string; freqList: string | null }
  | { kind: 'DispGraph' }
  | { kind: 'ClrDraw' }
  | { kind: 'Line'; x1: Expr; y1: Expr; x2: Expr; y2: Expr; erase: Expr | null }
  | { kind: 'Circle'; x: Expr; y: Expr; radius: Expr }
  | { kind: 'PxlOn'; row: Expr; col: Expr }
  | { kind: 'PxlOff'; row: Expr; col: Expr }
  | { kind: 'PxlChange'; row: Expr; col: Expr }
  | { kind: 'SetComplexMode'; mode: 'real' | 'rect' | 'polar' } // Real / a+bi / re^θi
  | { kind: 'SortList'; mode: 'asc' | 'desc'; lists: string[] } // SortA(/SortD(
  | { kind: 'ClrList'; lists: string[] }
  | { kind: 'ClrAllLists' }
  | { kind: 'ListToMatr'; lists: string[]; matrix: string } // List►matr(
  | { kind: 'MatrToList'; matrix: string; lists: string[] } // Matr►list(
  /** QuadReg/CubicReg/QuartReg: y = a + bx + cx² [+ dx³ [+ ex⁴]]. */
  | { kind: 'PolyReg'; degree: 2 | 3 | 4; xList: string; yList: string; freqList: string | null }
  | { kind: 'LnReg'; xList: string; yList: string; freqList: string | null } // y = a + b*ln(x)
  | { kind: 'ExpReg'; xList: string; yList: string; freqList: string | null } // y = a*b^x
  | { kind: 'PwrReg'; xList: string; yList: string; freqList: string | null } // y = a*x^b
  | { kind: 'LinRegAbx'; xList: string; yList: string; freqList: string | null } // y = a + bx
  | { kind: 'DefinePlot'; plot: 1 | 2 | 3; plotType: 'scatter' | 'xyline' | 'histogram' | 'boxplot'; xList: string; yList: string | null; freqList: string | null }
  | { kind: 'SetPlotsEnabled'; plots: (1 | 2 | 3)[]; enabled: boolean } // PlotsOn/PlotsOff [1,2,3]
  | { kind: 'Shade'; lower: Expr; upper: Expr; xLeft: Expr | null; xRight: Expr | null }
  | { kind: 'PtOn'; x: Expr; y: Expr }
  | { kind: 'PtOff'; x: Expr; y: Expr }
  | { kind: 'PtChange'; x: Expr; y: Expr }
  | { kind: 'Horizontal'; y: Expr }
  | { kind: 'Vertical'; x: Expr }

/** One instruction slot in the compiled, flat program. */
export interface Instruction {
  stmt: Stmt
  line: number
}

export interface Program {
  instructions: Instruction[]
}
