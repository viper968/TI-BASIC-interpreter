# TI-84 BASIC Studio

A from-scratch **TI-BASIC interpreter** with real syntax checking, plus a
calculator-style **web GUI** for writing, viewing, and running programs —
scoped specifically to what a **TI-84 Plus / TI-84 Plus Silver Edition**
can do. Other TI calculators (TI-83, TI-84 Plus CE, TI-89, ...) have their
own dialects and command sets; this project doesn't try to emulate those.

## What's here

- **`src/interpreter/`** — the interpreter, independent of any UI:
  - `lexer.ts` — tokenizes source text, greedily matching the calculator's
    actual command spellings (`For(`, `Disp`, `sin(`, ...) before falling
    back to single-letter variables, so `AB` correctly lexes as `A` times
    `B` (implicit multiplication) instead of a two-letter identifier —
    TI-BASIC only allows single-letter real variables (`A`-`Z`, `θ`).
  - `parser.ts` — a recursive-descent expression/statement parser
    (precedence climbing, implicit multiplication, TI's negation-vs-`^`
    precedence quirk, single-line vs. block `If`, etc.) that recovers from
    errors so one bad line doesn't stop the rest of the program from being
    checked.
  - `linker.ts` — resolves `For(`/`While`/`Repeat`/`If...Then`/`Else`/`End`
    block structure and `Lbl`/`Goto` targets into concrete jumps, and
    reports structural problems (unmatched `End`, `Goto` to an undefined
    label, stray `Else`, ...) as diagnostics with line numbers.
  - `vm.ts` — a generator-based virtual machine. `Input`, `Prompt`, `Pause`,
    and `Menu(` all suspend execution (`yield`) until the driver supplies a
    value, which is what lets the GUI pause a running program and wait for
    a click or keystroke without blocking the browser tab.
  - `commands.ts` — the single source of truth for every supported command
    (name, aliases, syntax, description). The lexer, parser, and the GUI's
    "Commands" reference panel are all generated from this table.
  - `builtins.ts`, `values.ts`, `screen.ts` — math/list/string functions,
    the runtime value model, and the 8×16 character home-screen model.
  - `matrix.ts` — matrix math (add/multiply/inverse/`det(`/`rref(`/row
    operations/...) as plain `number[][]` functions, kept independent of
    TI-BASIC syntax; `vm.ts` and `builtins.ts` are its only callers.
  - `stats.ts` — descriptive statistics, linear regression, and the normal
    distribution (mean/median/stdDev/quartiles/`linreg`/`normalCdf01`/
    `invNormStd`) as plain `number[]` functions, same independence as
    `matrix.ts`.
  - `graph.ts` — the 95×63 graph pixel buffer and graph-coordinate math
    (window-to-pixel mapping, Bresenham line drawing, midpoint circle
    drawing) as plain functions, same independence as `matrix.ts`/`stats.ts`.
  - `complex.ts` — complex number arithmetic (add/subtract/multiply/divide/
    `exp`/`log`/`pow`, the last two used together to compute *any* power,
    real or complex, via a^b = e^(b·ln(a))) as plain functions over a
    `{re,im}` pair, same independence as `matrix.ts`/`stats.ts`/`graph.ts`.
- **`src/components/`, `src/state/`, `src/App.tsx`** — the React GUI: a
  program manager, a syntax-highlighted code editor with live diagnostics,
  a TI-84-style calculator screen that actually runs programs (including
  interactive `Input`/`Prompt`/`Menu(`/`Pause`), a canvas-rendered Graph
  tab for `DispGraph`/drawing output, a keypad for inserting tokens, and a
  searchable command reference.

## Try it

```sh
npm install
npm run dev      # start the dev server
npm test         # run the interpreter's unit test suite (vitest)
npm run build    # typecheck + production build
```

Programs are saved to `localStorage` in the browser, one per "slot" (like
the calculator's program list) — create, rename, duplicate, and delete
them from the left-hand panel. The editor's diagnostics panel reports
syntax errors live (with line numbers you can click to jump to); **Run**
is disabled until they're fixed, the same way a real program with a syntax
error can't be run.

## Supported language

**Control flow:** `If` / `Then` / `Else` / `End`, `For(`, `While`,
`Repeat`, `Lbl` / `Goto`, `IS>(`, `DS<(`, `Menu(`, `Return`, `Stop`,
`Pause`.

**I/O:** `Disp`, `Output(`, `Input`, `Prompt`, `ClrHome`, `getKey`.

**Variables:** real variables `A`-`Z`/`θ`, strings `Str0`-`Str9`, lists
`L1`-`L6` (including `L1(i)` element access, which auto-grows a list by
one slot when you store to index `dim+1`, matching real behavior, and
`{1,2,3}` list-literal syntax), `Ans`, `DelVar`, the `→` store arrow (type
`->` if you don't have the glyph handy), and calling another saved
program with `prgmNAME`.

**Expressions:** all the usual arithmetic/relational/logic operators,
implicit multiplication (`2X`, `2(3+4)`, `AB`), correct TI operator
precedence (e.g. `-2^2` is `-4`, `^` is right-associative), `π`, `e`,
`nCr`/`nPr`, and the common math functions (`sin(`, `cos(`, `tan(` and
their inverses, `ln(`, `log(`, `√(`, `abs(`, `round(`, `int(`, `iPart(`,
`fPart(`, `randInt(`, `min(`, `max(`, `gcd(`, `lcm(`, `not(`), list
functions (`dim(`, `seq(`, `sum(`, `augment(`), and string functions
(`length(`, `sub(`, plus `+` for concatenation). `Degree`/`Radian` switch
the angle mode (default: Degree).

**Display modes:** `Fix n` / `Float`, `Normal` / `Sci` / `Eng`, and
`►Frac` / `►Dec` all work like the MODE menu and math-menu equivalents.
`►Frac` is a deliberate simplification: it renders a fraction as text
(only when one actually reproduces the value — an irrational-looking
result like `π►Frac` is correctly left as a decimal instead of printing a
misleading "exact" fraction) rather than adding a first-class fraction
value type.

**Interactive input:** if `Input`/`Prompt` text doesn't parse as an
expression, the calculator re-prompts (mirroring real hardware) instead
of ending the program; an entry that *parses* but fails when evaluated
(`1/0`, wrong type for the target, ...) is still a real runtime error.

**Matrices:** the 10 matrix variables `[A]`-`[J]`, `[[1,2][3,4]]` literal
syntax (rows adjacent, no commas between them), element access
`[A](row,col)`, `+`/`-`/scalar `*`/scalar `/`/matrix `*` matrix, `⁻¹`
(inverse) and `²` (also usable as `^-1` / `^n` for a non-negative integer
power), `det(`, `Transpose(`, `identity(`, `randM(`, `augment(`, `ref(`
and `rref(` (the usual way to solve a system of equations — see the
`MATRIX` sample program), the row operations `rowSwap(`/`row+(`/`*row(`/
`*row+(`, and resizing either a list or a matrix by storing dimensions
into `dim(` (`{5}->dim(L1)`, `{2,3}->dim([A])`) followed by `Fill(`.

**Statistics:** the list functions `mean(`, `median(`, `stdDev(` (sample),
`variance(` (sample), and `prod(`, each optionally weighted by a second
"frequency list" argument (`mean(L1,L2)`); `1-Var Stats [Xlist[,Freqlist]]`
and `2-Var Stats [Xlist,Ylist[,Freqlist]]` (defaulting to `L1`/`L2`),
which compute the usual summary statistics into `n`, `MeanX`, `Σx`, `Σx²`,
`Sx`, `σx`, `MinX`, `Q1`, `Med`, `Q3`, `MaxX` (plus `MeanY`, `Σy`, `Σy²`,
`Σxy`, `Sy`, `σy`, `MinY`, `MaxY` for 2-Var); `LinReg(ax+b) [Xlist,Ylist[,Freqlist]]`,
which fits a least-squares line into `a`, `b`, `r` (square `r` yourself
for r² — `r²` — rather than a separate stored value); and the normal
distribution functions `normalcdf(` / `invNorm(`. `MeanX`/`MeanY` are
simplified ASCII names for the on-calculator x̄/ȳ (which use a
keyboard-untypable combining-macron glyph); everything else — `n`, `a`,
`b`, `r`, `Σx`, `σx`, ... — is exactly the real reserved name, behaving
like an ordinary variable (readable, writable, usable in expressions)
rather than a special AST node. See the `STATS` sample program.

**Graphing:** the 10 function variables `Y0`-`Y9` — define one by storing a
string (`"X²"->Y1`) and evaluate it at a value with `Y1(x)` (a bare `Y1`
with no call parens is a syntax error, since a Y-variable is only ever used
as a callable, never read directly); the window variables `Xmin`/`Xmax`/
`Xscl`/`Ymin`/`Ymax`/`Yscl`/`Xres` (ordinary real variables, defaulting to
the standard TI-84 window: -10 to 10 on both axes, scale 1); a 95×63-pixel
graph screen, entirely separate from the 8×16 text screen (matching real
`Pxl-On(`/`pxl-Test(` addressable resolution — the physical LCD is 96×64,
one row/col larger); `DispGraph`, which clears the graph screen, draws the
X/Y axes, and plots every Y-variable with a non-empty definition; `ClrDraw`
(clears pixels only — the window and Y-variables are untouched);
`Line(X1,Y1,X2,Y2[,0])` and `Circle(X,Y,radius)` (drawn in graph
coordinates, with an optional trailing 0 on `Line(` to erase instead of
draw); and the raw pixel primitives `Pxl-On(`/`Pxl-Off(`/`Pxl-Change(`/
`pxl-Test(` (row 0-62, col 0-94). Two deliberate simplifications, both
documented rather than hidden: evaluating a Y-variable permanently sets
`X` to the value it was called with, matching a well-known real-hardware
quirk instead of sandboxing it away; and there's no separate per-function
enabled/disabled toggle — a Y-variable counts as "on" for `DispGraph`
purely by having a non-empty definition. See the `GRAPH` sample program,
and the app's **Graph** tab.

**Complex numbers:** the imaginary unit `i` (`i²=-1`), built into ordinary
arithmetic — `3+4i` just works, the same way `2X` does, via implicit
multiplication. `+`/`-`/`*`/`/`/`^`/`=`/`≠`, `²`, and `⁻¹` all accept a
complex operand (`<`/`>`/`≤`/`≥` don't — comparing complex numbers isn't
meaningful, so those raise `ERR:DATA TYPE`, matching real hardware); `^`
handles every case — a complex base or exponent, or even a *real* base
raised to a fractional power (e.g. `(-8)^(1/3)`) — through one formula
(`a^b = e^(b·ln(a))`) instead of a case per situation. `real(`, `imag(`,
`conj(`, and `angle(` extract a complex number's parts (a plain real number
passes through `real(`/`conj(` unchanged, and reads as `0` from `imag(`);
`abs(` and `round(` are extended to accept a complex argument too (`abs(`
returning the magnitude). `A`-`Z`/`θ` can hold a complex value exactly like
real hardware — `(2+3i)->Z` then `Disp Z` works — alongside their existing
real-number storage. Three MODE-row commands, `Real` (this interpreter's
default) / `a+bi` / `re^θi`, control what happens when a *real*-only
operation would produce a non-real result: `√(-4)`, `ln(-1)`, `log(-1)`,
and a negative base to a fractional power all raise `ERR:NONREAL ANS` in
Real mode (matching real hardware) but return a complex number — displayed
in rectangular `a+bi` or polar `r*e^(θi)` form, per the mode — in the other
two. Arithmetic on a complex number you built explicitly with `i` always
works, in every mode; the mode only gates results that start real and
would *become* non-real. Complex numbers are deliberately scoped out of
lists and matrices (an entry can't be complex) — real hardware supports
this, but it's a meaningfully bigger feature (broadcasting, formatting,
every list/matrix builtin gaining a complex path) for less real-world
payoff than the scalar case. See the `COMPLEX` sample program.

Open the **Commands** tab in the app for the full, searchable list with
syntax and descriptions — it's generated straight from
`src/interpreter/commands.ts`. The **Calculator** tab also shows a live
**Variables** watch panel (real vars, strings, lists, matrices, and now
complex-valued vars, each currently holding a non-default value) while a
program runs or is paused; window variables are omitted there since they
always hold a non-default value — see them on the **Graph** tab instead,
alongside the pixel screen and the current Y-variable definitions.

A generous but finite execution-step cap guards against runaway loops
freezing the browser tab (real hardware has no such limit, but a web page
does need one).

## Roadmap

Ranked by (real-world usefulness) ÷ (implementation cost) — earlier items
are more likely to land next.

1. ~~**Matrices**~~ — done: see "Supported language" above.
2. ~~**Statistics**~~ — done: see "Supported language" above. (Other
   regression types besides `LinReg(ax+b)`, e.g. `QuadReg`/`CubicReg`, are
   still long-tail.)
3. ~~**Graphing**~~ — done: see "Supported language" above. `Y0`-`Y9`
   function variables, window variables, a 95×63 pixel graph screen,
   function plotting via `DispGraph`, `ClrDraw`, and the drawing primitives
   `Line(`/`Circle(`/`Pxl-On(`/`Pxl-Off(`/`Pxl-Change(`/`pxl-Test(`. Stat
   *plots* (scatter/box plots), `Shade(`, and a trace cursor are not
   included — moved to the long tail below.
4. ~~**Complex numbers**~~ — done: see "Supported language" above. `i`,
   complex arithmetic (`+`/`-`/`*`/`/`/`^`/`²`/`⁻¹`), `real(`/`imag(`/
   `conj(`/`angle(`, complex-aware `abs(`/`round(`, complex-valued
   variables, and the `Real`/`a+bi`/`re^θi` mode commands. Complex lists
   and matrices are out — moved to the long tail below.
5. **Long tail**, done opportunistically: stat plots (scatter/box, drawn
   onto the graph screen), `Shade(`, a trace cursor, complex lists/matrices,
   `SortA(`/`SortD(`, `ClrList`, `cumSum(`, `ΔList(`, `InString(`, calculus
   tools (`nDeriv(`, `fnInt(`, `solve(`, `fMin(`/`fMax(`), other regression
   types (`QuadReg`, `CubicReg`, ...), user-named lists beyond `L1`-`L6`,
   remaining CATALOG stragglers.

**Permanently out of scope**, worth saying explicitly rather than leaving
as an open question:

- **ASM/App programs** — would need an actual Z80 CPU emulator running a
  real (copyrighted) calculator ROM dump. That's a different project with
  a different license situation, not a "feature" of a TI-BASIC
  interpreter.
- **Calculator-to-calculator linking** and **archive/RAM management
  simulation** — hardware/OS plumbing with no real payoff here.

## Architecture notes

The interpreter never touches the DOM and has no React dependency — it's
tested independently in `src/interpreter/__tests__/` (lexer, parser,
linker, and end-to-end VM behavior, including the interactive
`Input`/`Menu`/`Pause` pause-and-resume protocol). The GUI is a thin layer
on top: `useCalculator()` drives the VM's generator, batching `tick`
events so long-running loops periodically yield back to the browser
instead of freezing the tab, and surfacing `input`/`menu`/`pause`/`error`
events as UI state.
