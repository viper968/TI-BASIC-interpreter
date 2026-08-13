/**
 * The command / keyword registry for the interpreter.
 *
 * This is the single source of truth for what this interpreter supports.
 * It is consumed by:
 *  - the lexer (to greedily match multi-character keyword tokens instead
 *    of splitting them into single-letter implicit-multiplication variables)
 *  - the parser (to know arity/shape of each statement)
 *  - the GUI "Commands" reference panel (to render searchable docs)
 *
 * Scope: TI-84 Plus / TI-84 Plus Silver Edition TI-BASIC (MathPrint off,
 * classic OS, monochrome). Notably NOT included (see README "Roadmap"):
 * matrices, complex numbers, stat lists/plots, graphing commands, apps,
 * user-created list names, and CATALOG-only rarely used commands.
 */

export type CommandCategory =
  | 'control'
  | 'io'
  | 'variable'
  | 'list'
  | 'string'
  | 'math'
  | 'logic'
  | 'misc'

export type CommandKind = 'statement' | 'function' | 'operator' | 'constant'

export interface CommandSpec {
  /** Canonical token text, exactly as the calculator would insert it. */
  name: string
  /** Extra ASCII-typeable spellings the lexer also accepts (keyboard-friendly). */
  aliases?: string[]
  category: CommandCategory
  kind: CommandKind
  /** Human-readable syntax, e.g. "For(var,start,end[,step])". */
  syntax: string
  description: string
  example?: string
}

export const COMMANDS: CommandSpec[] = [
  // ---- Control flow -----------------------------------------------------
  { name: 'If', category: 'control', kind: 'statement', syntax: 'If condition', description: 'Conditionally executes the next statement, or (with Then) a whole block.', example: 'If X>0\n  Disp "POSITIVE"' },
  { name: 'Then', category: 'control', kind: 'statement', syntax: 'If condition:Then … End', description: 'Turns a preceding If into a block-If; the block runs until Else/End.' },
  { name: 'Else', category: 'control', kind: 'statement', syntax: 'If condition:Then … Else … End', description: 'Alternate branch of a block-If.' },
  { name: 'End', category: 'control', kind: 'statement', syntax: 'For(…)/While/Repeat/If…Then … End', description: 'Closes a For(, While, Repeat, or block-If.' },
  { name: 'For(', category: 'control', kind: 'statement', syntax: 'For(var,start,end[,step])', description: 'Counts var from start to end (step defaults to 1) running the loop body each time.', example: 'For(I,1,10)\n  Disp I\nEnd' },
  { name: 'While', category: 'control', kind: 'statement', syntax: 'While condition', description: 'Repeats the loop body while condition is true (checked before each pass).' },
  { name: 'Repeat', category: 'control', kind: 'statement', syntax: 'Repeat condition', description: 'Repeats the loop body until condition becomes true (checked after each pass).' },
  { name: 'Lbl', category: 'control', kind: 'statement', syntax: 'Lbl name', description: 'Marks a jump target for Goto (name: 1-2 letters/digits).' },
  { name: 'Goto', category: 'control', kind: 'statement', syntax: 'Goto name', description: 'Jumps program execution to the matching Lbl.' },
  { name: 'IS>(', category: 'control', kind: 'statement', syntax: 'IS>(var,value)', description: 'Increments var; skips the next statement if var > value.' },
  { name: 'DS<(', category: 'control', kind: 'statement', syntax: 'DS<(var,value)', description: 'Decrements var; skips the next statement if var < value.' },
  { name: 'Menu(', category: 'control', kind: 'statement', syntax: 'Menu("TITLE","TEXT1",LBL1,"TEXT2",LBL2,…)', description: 'Shows a selectable on-screen menu (up to 7 options) and Gotos the chosen label.' },
  { name: 'Return', category: 'control', kind: 'statement', syntax: 'Return', description: 'Returns from a sub-program invoked with prgmNAME.' },
  { name: 'Stop', category: 'control', kind: 'statement', syntax: 'Stop', description: 'Ends program execution immediately.' },
  { name: 'Pause', category: 'control', kind: 'statement', syntax: 'Pause [value]', description: 'Optionally displays value, then halts until [ENTER] is pressed.' },

  // ---- I/O ---------------------------------------------------------------
  { name: 'Disp', category: 'io', kind: 'statement', syntax: 'Disp [value1,value2,…]', description: 'Displays each value on its own line (bare Disp shows a blank line).' },
  { name: 'Output(', category: 'io', kind: 'statement', syntax: 'Output(row,col,value)', description: 'Displays value at a fixed row (1-8) / column (1-16) on the home screen.' },
  { name: 'Input', category: 'io', kind: 'statement', syntax: 'Input ["prompt",]var', description: 'Pauses for the user to type a value (with optional prompt text) into var.' },
  { name: 'Prompt', category: 'io', kind: 'statement', syntax: 'Prompt var[,var2,…]', description: 'Pauses to request each variable as "VAR=?".' },
  { name: 'ClrHome', category: 'io', kind: 'statement', syntax: 'ClrHome', description: 'Clears the home/output screen and returns the cursor to the top.' },
  { name: 'getKey', category: 'io', kind: 'function', syntax: 'getKey', description: 'Returns the keycode of the last key pressed since it was last read, else 0.' },

  // ---- Variables / store ---------------------------------------------------
  { name: '→', aliases: ['->'], category: 'variable', kind: 'operator', syntax: 'value→var', description: 'Stores value into a variable, list, list element, or string variable.', example: '5→A' },
  { name: 'DelVar', category: 'variable', kind: 'statement', syntax: 'DelVar var', description: 'Resets a variable to its empty/zero state.' },
  { name: 'Ans', category: 'variable', kind: 'constant', syntax: 'Ans', description: 'The value of the last evaluated expression.' },

  // ---- Lists ---------------------------------------------------------------
  { name: 'dim(', category: 'list', kind: 'function', syntax: 'dim(list)', description: 'Returns the number of elements in a list.' },
  { name: 'seq(', category: 'list', kind: 'function', syntax: 'seq(expr,var,start,end[,step])', description: 'Builds a list by evaluating expr for var stepping from start to end.' },
  { name: 'sum(', category: 'list', kind: 'function', syntax: 'sum(list)', description: 'Returns the sum of all elements in a list.' },
  { name: 'augment(', category: 'list', kind: 'function', syntax: 'augment(list1,list2)', description: 'Returns a new list with list2 appended after list1.' },

  // ---- Strings ---------------------------------------------------------------
  { name: 'length(', category: 'string', kind: 'function', syntax: 'length(string)', description: 'Returns the number of characters in a string.' },
  { name: 'sub(', category: 'string', kind: 'function', syntax: 'sub(string,start,length)', description: 'Returns a substring starting at start (1-based) of the given length.' },

  // ---- Math functions ---------------------------------------------------------------
  { name: 'sin(', category: 'math', kind: 'function', syntax: 'sin(value)', description: 'Sine, in the current angle mode (degrees).' },
  { name: 'cos(', category: 'math', kind: 'function', syntax: 'cos(value)', description: 'Cosine, in the current angle mode (degrees).' },
  { name: 'tan(', category: 'math', kind: 'function', syntax: 'tan(value)', description: 'Tangent, in the current angle mode (degrees).' },
  { name: 'sin⁻¹(', aliases: ['asin('], category: 'math', kind: 'function', syntax: 'sin⁻¹(value)', description: 'Inverse sine, returned in degrees.' },
  { name: 'cos⁻¹(', aliases: ['acos('], category: 'math', kind: 'function', syntax: 'cos⁻¹(value)', description: 'Inverse cosine, returned in degrees.' },
  { name: 'tan⁻¹(', aliases: ['atan('], category: 'math', kind: 'function', syntax: 'tan⁻¹(value)', description: 'Inverse tangent, returned in degrees.' },
  { name: 'ln(', category: 'math', kind: 'function', syntax: 'ln(value)', description: 'Natural logarithm.' },
  { name: 'log(', category: 'math', kind: 'function', syntax: 'log(value)', description: 'Base-10 logarithm.' },
  { name: 'e^(', category: 'math', kind: 'function', syntax: 'e^(value)', description: 'e raised to value.' },
  { name: '10^(', category: 'math', kind: 'function', syntax: '10^(value)', description: '10 raised to value.' },
  { name: '√(', aliases: ['sqrt('], category: 'math', kind: 'function', syntax: '√(value)', description: 'Square root.' },
  { name: 'abs(', category: 'math', kind: 'function', syntax: 'abs(value)', description: 'Absolute value.' },
  { name: 'round(', category: 'math', kind: 'function', syntax: 'round(value[,digits])', description: 'Rounds value to digits decimal places (default 10... here: 9).' },
  { name: 'int(', category: 'math', kind: 'function', syntax: 'int(value)', description: 'Greatest integer ≤ value (floor).' },
  { name: 'iPart(', category: 'math', kind: 'function', syntax: 'iPart(value)', description: 'Integer part of value (truncates toward 0).' },
  { name: 'fPart(', category: 'math', kind: 'function', syntax: 'fPart(value)', description: 'Fractional part of value.' },
  { name: 'randInt(', category: 'math', kind: 'function', syntax: 'randInt(low,high[,n])', description: 'Random integer(s) between low and high, inclusive.' },
  { name: 'min(', category: 'math', kind: 'function', syntax: 'min(a,b) or min(list)', description: 'Smaller of two values, or the minimum of a list.' },
  { name: 'max(', category: 'math', kind: 'function', syntax: 'max(a,b) or max(list)', description: 'Larger of two values, or the maximum of a list.' },
  { name: 'gcd(', category: 'math', kind: 'function', syntax: 'gcd(a,b)', description: 'Greatest common divisor.' },
  { name: 'lcm(', category: 'math', kind: 'function', syntax: 'lcm(a,b)', description: 'Least common multiple.' },

  // ---- Logic ---------------------------------------------------------------
  { name: 'and', category: 'logic', kind: 'operator', syntax: 'condition1 and condition2', description: 'Logical AND (non-zero is true).' },
  { name: 'or', category: 'logic', kind: 'operator', syntax: 'condition1 or condition2', description: 'Logical OR.' },
  { name: 'xor', category: 'logic', kind: 'operator', syntax: 'condition1 xor condition2', description: 'Logical exclusive OR.' },
  { name: 'not(', category: 'logic', kind: 'function', syntax: 'not(condition)', description: 'Logical NOT.' },
  { name: 'nCr', category: 'math', kind: 'operator', syntax: 'n nCr r', description: 'Number of combinations of n items taken r at a time.' },
  { name: 'nPr', category: 'math', kind: 'operator', syntax: 'n nPr r', description: 'Number of permutations of n items taken r at a time.' },

  // ---- Misc / constants ---------------------------------------------------------------
  { name: 'π', aliases: ['pi'], category: 'misc', kind: 'constant', syntax: 'π', description: 'The constant pi.' },
  { name: 'prgm', category: 'misc', kind: 'statement', syntax: 'prgmNAME', description: 'Calls another stored program by name.' },
  { name: 'Degree', category: 'misc', kind: 'statement', syntax: 'Degree', description: 'Sets the angle mode to degrees (this interpreter’s default).' },
  { name: 'Radian', category: 'misc', kind: 'statement', syntax: 'Radian', description: 'Sets the angle mode to radians.' },
]

/** Words matched bare (no trailing "(") that also act as infix operators. */
export const INFIX_WORD_OPERATORS = new Set(['and', 'or', 'xor', 'nCr', 'nPr'])

export function findCommand(name: string): CommandSpec | undefined {
  return COMMANDS.find((c) => c.name === name)
}
