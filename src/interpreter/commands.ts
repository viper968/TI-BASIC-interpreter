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
 * complex lists/matrices, ModBoxplot/NormProbPlot, Text(, DiagnosticOn/Off
 * (r/R² are always computed), Med-Med/Logistic/SinReg, apps, and
 * CATALOG-only rarely used commands.
 */

export type CommandCategory =
  | 'control'
  | 'io'
  | 'variable'
  | 'list'
  | 'matrix'
  | 'stats'
  | 'graph'
  | 'complex'
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
  { name: 'dim(', category: 'list', kind: 'function', syntax: 'dim(list) or dim(matrix)', description: 'Returns the number of elements in a list, or {rows,cols} for a matrix. Also usable as a store target — {n}->dim(L1) resizes L1, and {r,c}->dim([A]) resizes [A] (zero-filling new slots).' },
  { name: 'seq(', category: 'list', kind: 'function', syntax: 'seq(expr,var,start,end[,step])', description: 'Builds a list by evaluating expr for var stepping from start to end.' },
  { name: 'Σ(', category: 'list', kind: 'function', syntax: 'Σ(expr,var,start,end[,step])', description: 'Summation: adds up expr for var stepping from start to end (default step 1). Distinct from sum(list), which totals an existing list.' },
  { name: 'sum(', category: 'list', kind: 'function', syntax: 'sum(list)', description: 'Returns the sum of all elements in a list.' },
  { name: 'prod(', category: 'list', kind: 'function', syntax: 'prod(list)', description: 'Returns the product of all elements in a list.' },
  { name: 'augment(', category: 'list', kind: 'function', syntax: 'augment(list1,list2) or augment(matrixA,matrixB)', description: 'Concatenates two lists, or two matrices with the same row count (side by side).' },
  { name: 'Fill(', category: 'list', kind: 'statement', syntax: 'Fill(value,list) or Fill(value,matrix)', description: 'Overwrites every element of an already-sized list or matrix with value.' },
  { name: 'SortA(', category: 'list', kind: 'statement', syntax: 'SortA(list1[,list2,…])', description: 'Sorts list1 ascending in place; any additional lists are reordered the same way, keeping paired data aligned.' },
  { name: 'SortD(', category: 'list', kind: 'statement', syntax: 'SortD(list1[,list2,…])', description: 'Sorts list1 descending in place; any additional lists are reordered the same way, keeping paired data aligned.' },
  { name: 'ClrList', category: 'list', kind: 'statement', syntax: 'ClrList list1[,list2,…]', description: 'Clears one or more lists to empty.' },
  { name: 'ClrAllLists', category: 'list', kind: 'statement', syntax: 'ClrAllLists', description: 'Clears L1-L6 to empty and deletes every custom-named (∟NAME) list.' },
  { name: 'cumSum(', category: 'list', kind: 'function', syntax: 'cumSum(list)', description: 'Returns a list of running (cumulative) sums.' },
  { name: 'ΔList(', category: 'list', kind: 'function', syntax: 'ΔList(list)', description: 'Returns a list, one shorter, of the differences between consecutive elements.' },
  { name: '∟', category: 'list', kind: 'constant', syntax: '∟NAME', description: 'Prefixes a custom list name (a letter, then up to 4 more letters/digits) so it can be stored and read just like L1-L6, e.g. {1,2,3}->∟DATA. Not needed for L1-L6 themselves.' },

  // ---- Matrices ---------------------------------------------------------------
  { name: '[A]', category: 'matrix', kind: 'constant', syntax: '[A] … [J]', description: 'The 10 matrix variables. Store a whole matrix, an element [A](row,col), or build one with a [[1,2][3,4]] literal (rows adjacent, no commas between them).' },
  { name: 'det(', category: 'matrix', kind: 'function', syntax: 'det(matrix)', description: 'Determinant of a square matrix.' },
  { name: 'Transpose(', category: 'matrix', kind: 'function', syntax: 'Transpose(matrix)', description: 'Swaps rows and columns.' },
  { name: 'identity(', category: 'matrix', kind: 'function', syntax: 'identity(n)', description: 'Returns the n×n identity matrix.' },
  { name: 'randM(', category: 'matrix', kind: 'function', syntax: 'randM(rows,cols)', description: 'Returns a matrix of random single-digit integers.' },
  { name: 'ref(', category: 'matrix', kind: 'function', syntax: 'ref(matrix)', description: 'Row echelon form (via Gaussian elimination).' },
  { name: 'rref(', category: 'matrix', kind: 'function', syntax: 'rref(matrix)', description: 'Reduced row echelon form (via Gauss-Jordan elimination) — the usual way to solve a system of equations.' },
  { name: 'rowSwap(', category: 'matrix', kind: 'function', syntax: 'rowSwap(matrix,rowA,rowB)', description: 'Returns a copy of matrix with two rows swapped.' },
  { name: 'row+(', category: 'matrix', kind: 'function', syntax: 'row+(matrix,rowA,rowB)', description: 'Returns a copy of matrix with rowA added into rowB.' },
  { name: '*row(', category: 'matrix', kind: 'function', syntax: '*row(value,matrix,row)', description: 'Returns a copy of matrix with row scaled by value.' },
  { name: '*row+(', category: 'matrix', kind: 'function', syntax: '*row+(value,matrix,rowA,rowB)', description: 'Returns a copy of matrix with value*rowA added into rowB.' },
  { name: 'List►matr(', category: 'matrix', kind: 'statement', syntax: 'List►matr(list1[,list2,…],matrix)', description: 'Stores up to 10 equal-length lists as consecutive columns of matrix, resizing it as needed.' },
  { name: 'Matr►list(', category: 'matrix', kind: 'statement', syntax: 'Matr►list(matrix,list1[,list2,…])', description: 'Stores matrix\'s columns 1,2,… into list1, list2, … (one list per column, left to right).' },

  // ---- Statistics ---------------------------------------------------------------
  { name: 'mean(', category: 'stats', kind: 'function', syntax: 'mean(list[,freqlist])', description: 'Arithmetic mean of a list, optionally weighted by a frequency list.' },
  { name: 'median(', category: 'stats', kind: 'function', syntax: 'median(list)', description: 'Median of a list.' },
  { name: 'stdDev(', category: 'stats', kind: 'function', syntax: 'stdDev(list[,freqlist])', description: 'Sample standard deviation (divides by n-1).' },
  { name: 'variance(', category: 'stats', kind: 'function', syntax: 'variance(list[,freqlist])', description: 'Sample variance (divides by n-1).' },
  { name: '1-Var Stats', category: 'stats', kind: 'statement', syntax: '1-Var Stats [Xlist[,Freqlist]]', description: 'Computes one-variable summary statistics for Xlist (default L1) and stores them into n, MeanX, Σx, Σx², Sx, σx, MinX, Q1, Med, Q3, MaxX.' },
  { name: '2-Var Stats', category: 'stats', kind: 'statement', syntax: '2-Var Stats [Xlist,Ylist[,Freqlist]]', description: 'Computes two-variable summary statistics for Xlist,Ylist (default L1,L2) and stores them into the 1-Var results plus MeanY, Σy, Σy², Σxy, Sy, σy, MinY, MaxY.' },
  { name: 'LinReg(ax+b)', category: 'stats', kind: 'statement', syntax: 'LinReg(ax+b) [Xlist,Ylist[,Freqlist]]', description: 'Fits a least-squares line y=ax+b to Xlist,Ylist (default L1,L2) and stores the result into a, b, r. (The optional RegEQ argument to also store the equation into a Y-variable is not supported yet.)' },
  { name: 'LinReg(a+bx)', category: 'stats', kind: 'statement', syntax: 'LinReg(a+bx) [Xlist,Ylist[,Freqlist]]', description: 'Fits the same least-squares line as LinReg(ax+b), with a and b swapped (y=a+bx), and stores the result into a, b, r.' },
  { name: 'QuadReg', category: 'stats', kind: 'statement', syntax: 'QuadReg [Xlist,Ylist[,Freqlist]]', description: 'Fits a least-squares quadratic y=ax²+bx+c and stores the result into a, b, c, R².' },
  { name: 'CubicReg', category: 'stats', kind: 'statement', syntax: 'CubicReg [Xlist,Ylist[,Freqlist]]', description: 'Fits a least-squares cubic y=ax³+bx²+cx+d and stores the result into a, b, c, d, R².' },
  { name: 'QuartReg', category: 'stats', kind: 'statement', syntax: 'QuartReg [Xlist,Ylist[,Freqlist]]', description: 'Fits a least-squares quartic y=ax⁴+bx³+cx²+dx+e and stores the result into a, b, c, d, e, R². This genuinely overwrites e (Euler\'s number), matching real hardware.' },
  { name: 'LnReg', category: 'stats', kind: 'statement', syntax: 'LnReg [Xlist,Ylist[,Freqlist]]', description: 'Fits y=a+b·ln(x) (a linear fit on ln(x)) and stores the result into a, b, r.' },
  { name: 'ExpReg', category: 'stats', kind: 'statement', syntax: 'ExpReg [Xlist,Ylist[,Freqlist]]', description: 'Fits y=a·b^x (a linear fit on ln(y)) and stores the result into a, b, r.' },
  { name: 'PwrReg', category: 'stats', kind: 'statement', syntax: 'PwrReg [Xlist,Ylist[,Freqlist]]', description: 'Fits y=a·x^b (a linear fit on ln(x) and ln(y)) and stores the result into a, b, r.' },
  { name: 'c', category: 'stats', kind: 'constant', syntax: 'c', description: 'The x² coefficient from the last QuadReg/CubicReg/QuartReg.' },
  { name: 'd', category: 'stats', kind: 'constant', syntax: 'd', description: 'The x³ coefficient from the last CubicReg/QuartReg.' },
  { name: 'R²', category: 'stats', kind: 'constant', syntax: 'R²', description: 'Coefficient of determination from the last QuadReg/CubicReg/QuartReg.' },
  { name: 'normalcdf(', category: 'stats', kind: 'function', syntax: 'normalcdf(lower,upper[,μ,σ])', description: 'Area under the normal curve between lower and upper (default μ=0,σ=1).' },
  { name: 'invNorm(', category: 'stats', kind: 'function', syntax: 'invNorm(area[,μ,σ])', description: 'The x-value where the normal CDF equals area (default μ=0,σ=1).' },
  { name: 'n', category: 'stats', kind: 'constant', syntax: 'n', description: 'Number of data points from the last 1-Var Stats / 2-Var Stats.' },
  { name: 'a', category: 'stats', kind: 'constant', syntax: 'a', description: 'Slope from the last LinReg(ax+b).' },
  { name: 'b', category: 'stats', kind: 'constant', syntax: 'b', description: 'Intercept from the last LinReg(ax+b).' },
  { name: 'r', category: 'stats', kind: 'constant', syntax: 'r', description: 'Correlation coefficient from the last LinReg(ax+b) (square it yourself for r²: r²).' },
  { name: 'MeanX', category: 'stats', kind: 'constant', syntax: 'MeanX', description: 'Mean of x from the last 1-Var/2-Var Stats. (Simplified name for the on-calculator x̄.)' },
  { name: 'Σx', aliases: ['Sumx'], category: 'stats', kind: 'constant', syntax: 'Σx', description: 'Sum of x from the last 1-Var/2-Var Stats.' },
  { name: 'Σx²', aliases: ['Sumx2'], category: 'stats', kind: 'constant', syntax: 'Σx²', description: 'Sum of x² from the last 1-Var/2-Var Stats.' },
  { name: 'Sx', category: 'stats', kind: 'constant', syntax: 'Sx', description: 'Sample standard deviation of x from the last 1-Var/2-Var Stats.' },
  { name: 'σx', aliases: ['sigmax'], category: 'stats', kind: 'constant', syntax: 'σx', description: 'Population standard deviation of x from the last 1-Var/2-Var Stats.' },
  { name: 'MinX', category: 'stats', kind: 'constant', syntax: 'MinX', description: 'Minimum of x from the last 1-Var/2-Var Stats.' },
  { name: 'Q1', category: 'stats', kind: 'constant', syntax: 'Q1', description: 'First quartile of x from the last 1-Var Stats.' },
  { name: 'Med', category: 'stats', kind: 'constant', syntax: 'Med', description: 'Median of x from the last 1-Var Stats.' },
  { name: 'Q3', category: 'stats', kind: 'constant', syntax: 'Q3', description: 'Third quartile of x from the last 1-Var Stats.' },
  { name: 'MaxX', category: 'stats', kind: 'constant', syntax: 'MaxX', description: 'Maximum of x from the last 1-Var/2-Var Stats.' },
  { name: 'MeanY', category: 'stats', kind: 'constant', syntax: 'MeanY', description: 'Mean of y from the last 2-Var Stats. (Simplified name for the on-calculator ȳ.)' },
  { name: 'Σy', aliases: ['Sumy'], category: 'stats', kind: 'constant', syntax: 'Σy', description: 'Sum of y from the last 2-Var Stats.' },
  { name: 'Σy²', aliases: ['Sumy2'], category: 'stats', kind: 'constant', syntax: 'Σy²', description: 'Sum of y² from the last 2-Var Stats.' },
  { name: 'Σxy', aliases: ['Sumxy'], category: 'stats', kind: 'constant', syntax: 'Σxy', description: 'Sum of x*y from the last 2-Var Stats.' },
  { name: 'Sy', category: 'stats', kind: 'constant', syntax: 'Sy', description: 'Sample standard deviation of y from the last 2-Var Stats.' },
  { name: 'σy', aliases: ['sigmay'], category: 'stats', kind: 'constant', syntax: 'σy', description: 'Population standard deviation of y from the last 2-Var Stats.' },
  { name: 'MinY', category: 'stats', kind: 'constant', syntax: 'MinY', description: 'Minimum of y from the last 2-Var Stats.' },
  { name: 'MaxY', category: 'stats', kind: 'constant', syntax: 'MaxY', description: 'Maximum of y from the last 2-Var Stats.' },

  // ---- Graphing ---------------------------------------------------------------
  { name: 'Y1', category: 'graph', kind: 'constant', syntax: 'Y0 … Y9', description: 'The 10 function variables. Define one by storing a string: "X²"→Y1. Evaluate it at a value with Y1(x). A Y-variable with an empty definition is skipped by DispGraph.' },
  { name: 'Xmin', category: 'graph', kind: 'constant', syntax: 'Xmin', description: 'Left edge of the graph window (default -10).' },
  { name: 'Xmax', category: 'graph', kind: 'constant', syntax: 'Xmax', description: 'Right edge of the graph window (default 10).' },
  { name: 'Xscl', category: 'graph', kind: 'constant', syntax: 'Xscl', description: 'Spacing between x-axis tick marks (default 1).' },
  { name: 'Ymin', category: 'graph', kind: 'constant', syntax: 'Ymin', description: 'Bottom edge of the graph window (default -10).' },
  { name: 'Ymax', category: 'graph', kind: 'constant', syntax: 'Ymax', description: 'Top edge of the graph window (default 10).' },
  { name: 'Yscl', category: 'graph', kind: 'constant', syntax: 'Yscl', description: 'Spacing between y-axis tick marks (default 1).' },
  { name: 'Xres', category: 'graph', kind: 'constant', syntax: 'Xres', description: 'Pixel-column resolution for function plotting (1-8, default 1). Kept for compatibility; every column is always evaluated.' },
  { name: 'DispGraph', category: 'graph', kind: 'statement', syntax: 'DispGraph', description: 'Clears the graph screen, draws the axes, and plots every defined Y-variable over the current window.' },
  { name: 'ClrDraw', category: 'graph', kind: 'statement', syntax: 'ClrDraw', description: 'Clears the graph screen (pixels only; the window and Y-variables are untouched).' },
  { name: 'Line(', category: 'graph', kind: 'statement', syntax: 'Line(X1,Y1,X2,Y2[,0])', description: 'Draws a line between two points in graph coordinates. A trailing 0 erases instead of draws.' },
  { name: 'Circle(', category: 'graph', kind: 'statement', syntax: 'Circle(X,Y,radius)', description: 'Draws a circle outline centered at (X,Y) with the given radius, in graph coordinates.' },
  { name: 'Pxl-On(', category: 'graph', kind: 'statement', syntax: 'Pxl-On(row,col)', description: 'Turns on one pixel (row 0-62, col 0-94) on the graph screen.' },
  { name: 'Pxl-Off(', category: 'graph', kind: 'statement', syntax: 'Pxl-Off(row,col)', description: 'Turns off one pixel (row 0-62, col 0-94) on the graph screen.' },
  { name: 'Pxl-Change(', category: 'graph', kind: 'statement', syntax: 'Pxl-Change(row,col)', description: 'Toggles one pixel (row 0-62, col 0-94) on the graph screen.' },
  { name: 'pxl-Test(', category: 'graph', kind: 'function', syntax: 'pxl-Test(row,col)', description: 'Returns 1 if the given pixel is on, else 0.' },
  { name: 'Shade(', category: 'graph', kind: 'statement', syntax: 'Shade(lowerFunc,upperFunc[,Xleft,Xright])', description: 'Shades the region between two expressions (in X) on the graph screen, optionally limited to Xleft-Xright.' },
  { name: 'Pt-On(', category: 'graph', kind: 'statement', syntax: 'Pt-On(X,Y)', description: 'Turns on the pixel nearest (X,Y) in graph coordinates.' },
  { name: 'Pt-Off(', category: 'graph', kind: 'statement', syntax: 'Pt-Off(X,Y)', description: 'Turns off the pixel nearest (X,Y) in graph coordinates.' },
  { name: 'Pt-Change(', category: 'graph', kind: 'statement', syntax: 'Pt-Change(X,Y)', description: 'Toggles the pixel nearest (X,Y) in graph coordinates.' },
  { name: 'Horizontal', category: 'graph', kind: 'statement', syntax: 'Horizontal Y', description: 'Draws a full-width horizontal line across the graph screen at Y.' },
  { name: 'Vertical', category: 'graph', kind: 'statement', syntax: 'Vertical X', description: 'Draws a full-height vertical line across the graph screen at X.' },
  { name: 'Plot1(', category: 'graph', kind: 'statement', syntax: 'Plot1(type,Xlist[,Ylist][,Freqlist])', description: 'Defines and turns on stat plot 1. type is Scatter/xyLine (need Xlist,Ylist) or Histogram/Boxplot (need Xlist[,Freqlist]). DispGraph draws every enabled plot alongside the Y= functions.' },
  { name: 'Plot2(', category: 'graph', kind: 'statement', syntax: 'Plot2(type,Xlist[,Ylist][,Freqlist])', description: 'Same as Plot1(, for stat plot 2.' },
  { name: 'Plot3(', category: 'graph', kind: 'statement', syntax: 'Plot3(type,Xlist[,Ylist][,Freqlist])', description: 'Same as Plot1(, for stat plot 3.' },
  { name: 'Scatter', category: 'graph', kind: 'constant', syntax: 'Plot1(Scatter,Xlist,Ylist)', description: 'Plot1(/2(/3( type: an unconnected scatter plot of points (Xlist(i),Ylist(i)).' },
  { name: 'xyLine', category: 'graph', kind: 'constant', syntax: 'Plot1(xyLine,Xlist,Ylist)', description: 'Plot1(/2(/3( type: like Scatter, but consecutive points are connected with line segments.' },
  { name: 'Histogram', category: 'graph', kind: 'constant', syntax: 'Plot1(Histogram,Xlist[,Freqlist])', description: 'Plot1(/2(/3( type: a histogram of Xlist, bucketed into Xscl-wide bins starting at Xmin.' },
  { name: 'Boxplot', category: 'graph', kind: 'constant', syntax: 'Plot1(Boxplot,Xlist[,Freqlist])', description: 'Plot1(/2(/3( type: a box-and-whisker plot of Xlist\'s five-number summary (min, Q1, median, Q3, max).' },
  { name: 'PlotsOn', category: 'graph', kind: 'statement', syntax: 'PlotsOn [1,2,3]', description: 'Enables the given stat plots (default: all three) without changing their configuration.' },
  { name: 'PlotsOff', category: 'graph', kind: 'statement', syntax: 'PlotsOff [1,2,3]', description: 'Disables the given stat plots (default: all three) without changing their configuration.' },

  // ---- Complex numbers ---------------------------------------------------------------
  { name: 'i', category: 'complex', kind: 'constant', syntax: 'i', description: 'The imaginary unit, i²=-1. Build a complex number with ordinary arithmetic, e.g. 3+4i.' },
  { name: 'real(', category: 'complex', kind: 'function', syntax: 'real(value)', description: 'The real part of a complex number (a real number passes through unchanged).' },
  { name: 'imag(', category: 'complex', kind: 'function', syntax: 'imag(value)', description: 'The imaginary part of a complex number (0 for a real number).' },
  { name: 'conj(', category: 'complex', kind: 'function', syntax: 'conj(value)', description: 'The complex conjugate: conj(a+bi) = a-bi.' },
  { name: 'angle(', category: 'complex', kind: 'function', syntax: 'angle(value)', description: 'The polar angle (argument) of a complex number, in the current angle mode. 0 for a positive real, 180°/π for a negative real.' },
  { name: 'Real', category: 'complex', kind: 'statement', syntax: 'Real', description: 'Sets complex mode to Real (this interpreter’s default): an operation that would produce a non-real result, e.g. √(-1), raises ERR:NONREAL ANS instead of returning a complex number. Complex numbers you build explicitly with i still work and display fine.' },
  { name: 'a+bi', category: 'complex', kind: 'statement', syntax: 'a+bi', description: 'Sets complex mode to a+bi: non-real results are returned as complex numbers instead of erroring, and displayed in rectangular a+bi form.' },
  { name: 're^θi', aliases: ['re^thetai'], category: 'complex', kind: 'statement', syntax: 're^θi', description: 'Sets complex mode to re^θi: non-real results are returned as complex numbers, displayed in polar r*e^(θi) form.' },

  // ---- Strings ---------------------------------------------------------------
  { name: 'length(', category: 'string', kind: 'function', syntax: 'length(string)', description: 'Returns the number of characters in a string.' },
  { name: 'sub(', category: 'string', kind: 'function', syntax: 'sub(string,start,length)', description: 'Returns a substring starting at start (1-based) of the given length.' },
  { name: 'inString(', category: 'string', kind: 'function', syntax: 'inString(string,substring[,start])', description: 'Returns the 1-based position of the first occurrence of substring in string at or after start (default 1), or 0 if not found.' },

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
  { name: 'rand', category: 'math', kind: 'function', syntax: 'rand', description: 'A random real number between 0 (inclusive) and 1 (exclusive). Takes no arguments and no parentheses.' },
  { name: 'randInt(', category: 'math', kind: 'function', syntax: 'randInt(low,high[,n])', description: 'Random integer(s) between low and high, inclusive.' },
  { name: 'min(', category: 'math', kind: 'function', syntax: 'min(a,b) or min(list)', description: 'Smaller of two values, or the minimum of a list.' },
  { name: 'max(', category: 'math', kind: 'function', syntax: 'max(a,b) or max(list)', description: 'Larger of two values, or the maximum of a list.' },
  { name: 'gcd(', category: 'math', kind: 'function', syntax: 'gcd(a,b)', description: 'Greatest common divisor.' },
  { name: 'lcm(', category: 'math', kind: 'function', syntax: 'lcm(a,b)', description: 'Least common multiple.' },
  { name: '►Frac', category: 'math', kind: 'operator', syntax: 'value►Frac', description: 'Displays value as a fraction (e.g. 0.5►Frac shows "1/2"). Simplified: returns fraction text, not a first-class fraction type.' },
  { name: '►Dec', category: 'math', kind: 'operator', syntax: 'value►Dec', description: 'Converts a ►Frac result (or any number) back to decimal.' },
  { name: 'nDeriv(', category: 'math', kind: 'function', syntax: 'nDeriv(expr,var,value[,H])', description: 'Numerical derivative of expr with respect to var at value, via the symmetric difference quotient (default step H=0.001).' },
  { name: 'fnInt(', category: 'math', kind: 'function', syntax: 'fnInt(expr,var,lower,upper[,tolerance])', description: 'Numerical integral of expr with respect to var from lower to upper (Simpson\'s rule).' },
  { name: 'fMin(', category: 'math', kind: 'function', syntax: 'fMin(expr,var,lower,upper[,tolerance])', description: 'The var-value where expr has a local minimum between lower and upper (golden-section search).' },
  { name: 'fMax(', category: 'math', kind: 'function', syntax: 'fMax(expr,var,lower,upper[,tolerance])', description: 'The var-value where expr has a local maximum between lower and upper (golden-section search).' },
  { name: 'solve(', category: 'math', kind: 'function', syntax: 'solve(expr,var,guess[,{lower,upper}])', description: 'A numeric root of expr=0 with respect to var, starting from guess (bisecting within {lower,upper} first, if given). Not automatically stored anywhere — assign the result yourself.' },

  // ---- Logic ---------------------------------------------------------------
  { name: 'and', category: 'logic', kind: 'operator', syntax: 'condition1 and condition2', description: 'Logical AND (non-zero is true).' },
  { name: 'or', category: 'logic', kind: 'operator', syntax: 'condition1 or condition2', description: 'Logical OR.' },
  { name: 'xor', category: 'logic', kind: 'operator', syntax: 'condition1 xor condition2', description: 'Logical exclusive OR.' },
  { name: 'not(', category: 'logic', kind: 'function', syntax: 'not(condition)', description: 'Logical NOT.' },
  { name: 'nCr', category: 'math', kind: 'operator', syntax: 'n nCr r', description: 'Number of combinations of n items taken r at a time.' },
  { name: 'nPr', category: 'math', kind: 'operator', syntax: 'n nPr r', description: 'Number of permutations of n items taken r at a time.' },

  // ---- Misc / constants ---------------------------------------------------------------
  { name: 'π', aliases: ['pi'], category: 'misc', kind: 'constant', syntax: 'π', description: 'The constant pi.' },
  { name: 'e', category: 'misc', kind: 'constant', syntax: 'e', description: 'Euler\'s number, ≈2.718281828459. Unlike π, this behaves like an ordinary variable — it defaults to that value but can be overwritten (e.g. QuartReg\'s 5th coefficient genuinely does this), matching a well-known real-hardware quirk.' },
  { name: 'prgm', category: 'misc', kind: 'statement', syntax: 'prgmNAME', description: 'Calls another stored program by name.' },
  { name: 'Degree', category: 'misc', kind: 'statement', syntax: 'Degree', description: 'Sets the angle mode to degrees (this interpreter’s default).' },
  { name: 'Radian', category: 'misc', kind: 'statement', syntax: 'Radian', description: 'Sets the angle mode to radians.' },
  { name: 'Normal', category: 'misc', kind: 'statement', syntax: 'Normal', description: 'Sets display notation back to normal (this interpreter’s default).' },
  { name: 'Sci', category: 'misc', kind: 'statement', syntax: 'Sci', description: 'Sets display notation to scientific, e.g. 1.23E4.' },
  { name: 'Eng', category: 'misc', kind: 'statement', syntax: 'Eng', description: 'Sets display notation to engineering (exponent is always a multiple of 3).' },
  { name: 'Fix', category: 'misc', kind: 'statement', syntax: 'Fix n', description: 'Displays numbers with exactly n (0-9) decimal places.' },
  { name: 'Float', category: 'misc', kind: 'statement', syntax: 'Float', description: 'Displays numbers with automatic precision (this interpreter’s default).' },
]

/** Words matched bare (no trailing "(") that also act as infix operators. */
export const INFIX_WORD_OPERATORS = new Set(['and', 'or', 'xor', 'nCr', 'nPr'])

/**
 * Multi-character reserved names — statistics/regression results and the
 * graph window variables — that behave exactly like a real variable
 * (readable, writable, and eligible for implicit multiplication) rather
 * than like a command. The lexer gives these the VAR token type, reusing
 * all of the existing single-letter-variable machinery instead of
 * introducing a parallel AST node.
 */
export const RESERVED_VAR_NAMES = new Set([
  // Statistics / regression
  'n',
  'a',
  'b',
  'c',
  'd',
  'r',
  'R²',
  'MeanX',
  'Σx',
  'Σx²',
  'Sx',
  'σx',
  'MinX',
  'Q1',
  'Med',
  'Q3',
  'MaxX',
  'MeanY',
  'Σy',
  'Σy²',
  'Σxy',
  'Sy',
  'σy',
  'MinY',
  'MaxY',
  // Graph window
  'Xmin',
  'Xmax',
  'Xscl',
  'Ymin',
  'Ymax',
  'Yscl',
  'Xres',
  // Euler's number: an ordinary variable (see the 'e' command entry above),
  // not a fixed constant like π — its default is set in createInterpreterState.
  'e',
])

export function findCommand(name: string): CommandSpec | undefined {
  return COMMANDS.find((c) => c.name === name)
}
