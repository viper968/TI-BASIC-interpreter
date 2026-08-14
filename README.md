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
    TI-BASIC only allows single-letter real variables (`A`-`Z`, `θ`; user
    lists get around the same limit with a `∟` prefix, e.g. `∟DATA`).
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
  - `stats.ts` — descriptive statistics, linear/polynomial/log/exponential/
    power regression, and the normal distribution (mean/median/stdDev/
    quartiles/`linreg`/`polyReg`/`lnReg`/`expReg`/`pwrReg`/`normalCdf01`/
    `invNormStd`) as plain `number[]` functions, same independence as
    `matrix.ts` — `polyReg` reuses `matrix.ts`'s `rref(` to solve the normal
    equations rather than writing a second linear solver.
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
  tab for `DispGraph`/drawing output with a trace cursor, a keypad for
  inserting tokens, and a searchable command reference.

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

### Deploy it

The whole app is static — no backend, no API calls, everything (including
running programs) happens client-side. `.github/workflows/deploy.yml`
builds and deploys `dist/` to GitHub Pages on every push to `main`; enable
it once in **Settings → Pages → Source → GitHub Actions** and the site is
live at `https://<owner>.github.io/TI-BASIC-interpreter/`. `vite.config.ts`'s
`base` only switches to `/TI-BASIC-interpreter/` inside GitHub Actions (via
the `GITHUB_ACTIONS` env var Actions sets automatically) — local
`dev`/`build`/`preview` stay at `/`. Any other static host (Vercel,
Netlify, Cloudflare Pages, ...) works too: point it at `npm run build` /
`dist`.

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
`fPart(`, `randInt(`, `rand`, `min(`, `max(`, `gcd(`, `lcm(`, `not(`), list
functions (`dim(`, `seq(`, `sum(`, `Σ(`, `augment(`), calculus tools (`nDeriv(`,
`fnInt(`, `fMin(`, `fMax(`, `solve(` — see "Calculus" below), and string
functions (`length(`, `sub(`, `inString(`, plus `+` for concatenation). `rand`
is a random real in [0,1) — no parentheses, but usable in arithmetic like any
other value (`int(10rand)` for a random digit); `Σ(expr,var,start,end[,step])`
sums expr for var stepping across a range, distinct from `sum(list)`, which
totals an existing list.
`Degree`/`Radian` switch the angle mode (default: Degree). Unlike `π`, `e`
is genuinely just an ordinary variable that defaults to 2.718281828459 —
it can be overwritten (e.g. `QuartReg`'s 5th coefficient really does this),
matching a well-known real-hardware quirk rather than treating it as a
protected constant.

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

**Lists:** beyond `L1`-`L6`, a custom-named list works exactly the way
real hardware does it — prefix the name with `∟` (1 letter, then up to 4
more letters/digits) to store or read it, e.g. `{1,2,3}->∟DATA` then
`Disp ∟DATA` — everything that accepts `L1`-`L6` (`dim(`, `Fill(`, element
access, ...) accepts a `∟`-list too, since it's the exact same underlying
mechanism. `SortA(`/`SortD(` sort a list ascending/descending in place,
reordering any additional lists you pass along with it so paired data
(e.g. names alongside scores) stays aligned; `ClrList` empties one or more
lists (`ClrAllLists` empties L1-L6 and deletes every `∟`-named list at
once); `cumSum(` returns running totals; `ΔList(` returns the differences
between consecutive elements.

**Matrices:** the 10 matrix variables `[A]`-`[J]`, `[[1,2][3,4]]` literal
syntax (rows adjacent, no commas between them), element access
`[A](row,col)`, `+`/`-`/scalar `*`/scalar `/`/matrix `*` matrix, `⁻¹`
(inverse) and `²` (also usable as `^-1` / `^n` for a non-negative integer
power), `det(`, `Transpose(`, `identity(`, `randM(`, `augment(`, `ref(`
and `rref(` (the usual way to solve a system of equations — see the
`MATRIX` sample program), the row operations `rowSwap(`/`row+(`/`*row(`/
`*row+(`, resizing either a list or a matrix by storing dimensions
into `dim(` (`{5}->dim(L1)`, `{2,3}->dim([A])`) followed by `Fill(`, and
converting between the two with `List►matr(list1[,list2,…],matrix)` (each
list becomes a column) and `Matr►list(matrix,list1[,list2,…])` (each column
becomes a list, left to right).

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
rather than a special AST node. Beyond `LinReg(ax+b)`: `LinReg(a+bx)` (the
same fit, `a`/`b` swapped), `QuadReg`/`CubicReg`/`QuartReg` (into `a`, `b`,
`c`[, `d`[, `e`]], `R²` — `QuartReg`'s `e` is the one that overwrites
Euler's number), and `LnReg`/`ExpReg`/`PwrReg` (each a linear fit in
transformed coordinates, into `a`, `b`, `r`). `R²`/`r` are always computed
and stored — real hardware only shows them once you've turned on
`DiagnosticOn` (off by default); that toggle itself isn't implemented, so
this interpreter behaves as if it's always on. See the `STATS` and
`ADVANCED` sample programs.

**Calculus:** `nDeriv(expr,var,value[,H])` (symmetric difference quotient,
default step `H=0.001`), `fnInt(expr,var,lower,upper[,tolerance])`
(Simpson's rule), `fMin(`/`fMax(expr,var,lower,upper[,tolerance])`
(golden-section search for a local extremum), and
`solve(expr,var,guess[,{lower,upper}])` (Newton's method from `guess`, or
bisection within `{lower,upper}` if given — not automatically stored
anywhere, assign the result yourself). All four are ordinary expressions,
usable anywhere a value is expected (`Disp nDeriv(X²,X,3)`).

**Graphing:** the 10 function variables `Y0`-`Y9` — define one by storing a
string (`"X²"->Y1`) and evaluate it at a value with `Y1(x)` (a bare `Y1`
with no call parens is a syntax error, since a Y-variable is only ever used
as a callable, never read directly); the window variables `Xmin`/`Xmax`/
`Xscl`/`Ymin`/`Ymax`/`Yscl`/`Xres` (ordinary real variables, defaulting to
the standard TI-84 window: -10 to 10 on both axes, scale 1); a 95×63-pixel
graph screen, entirely separate from the 8×16 text screen (matching real
`Pxl-On(`/`pxl-Test(` addressable resolution — the physical LCD is 96×64,
one row/col larger); `DispGraph`, which clears the graph screen, draws the
X/Y axes, plots every Y-variable with a non-empty definition, and draws
every enabled stat plot; `ClrDraw` (clears pixels only — the window,
Y-variables, and stat plots are untouched); `Line(X1,Y1,X2,Y2[,0])` and
`Circle(X,Y,radius)` (drawn in graph coordinates, with an optional
trailing 0 on `Line(` to erase instead of draw); `Shade(lowerFunc,
upperFunc[,Xleft,Xright])` (shades the region between two expressions in
`X`); `Pt-On(`/`Pt-Off(`/`Pt-Change(X,Y)` (a graph-coordinate point);
`Horizontal Y` / `Vertical X` (a full-width/height line); and the raw
pixel primitives `Pxl-On(`/`Pxl-Off(`/`Pxl-Change(`/`pxl-Test(` (row 0-62,
col 0-94). Deliberate simplifications, all documented rather than hidden:
evaluating a Y-variable permanently sets `X` to the value it was called
with, matching a well-known real-hardware quirk instead of sandboxing it
away; there's no separate per-function enabled/disabled toggle — a
Y-variable counts as "on" for `DispGraph` purely by having a non-empty
definition; and `Shade(`/`Pt-On(` drop the optional pattern/mark-style
arguments real hardware has (always one solid fill / a small box marker).
See the `GRAPH` and `ADVANCED` sample programs, and the app's **Graph**
tab.

**Stat plots:** `Plot1(`/`Plot2(`/`Plot3(type,Xlist[,Ylist][,Freqlist])`
define and enable a plot — `type` is `Scatter`/`xyLine` (need `Xlist`,
`Ylist`) or `Histogram`/`Boxplot` (need `Xlist`, with an optional
`Freqlist`); `PlotsOn`/`PlotsOff [1,2,3]` toggle plots on/off without
touching their configuration (default: all three). `DispGraph` draws every
enabled plot alongside the Y= functions. `ModBoxplot` and `NormProbPlot`
aren't included, and neither is the Mark-style argument (points always
draw as a small box) — both documented simplifications.

**Trace cursor:** real hardware's TRACE is an OS/hardware interaction, not
a TI-BASIC command a program can call — so instead of a language feature,
the **Graph** tab has a **Trace** button: pick a Y-variable, then step a
cursor pixel-by-pixel along its curve with the ◀/▶ buttons while reading
off the exact (X,Y) underneath, the same interaction real TRACE gives you.

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

Every item originally planned for this interpreter is now done:

1. ~~**Matrices**~~ — done: see "Supported language" above.
2. ~~**Statistics**~~ — done, including the additional regression types
   (`QuadReg`/`CubicReg`/`QuartReg`/`LnReg`/`ExpReg`/`PwrReg`) — see
   "Supported language" above.
3. ~~**Graphing**~~ — done, including stat plots (`Plot1(`/`Plot2(`/
   `Plot3(`), `Shade(`, and a trace cursor (as a GUI feature — see
   "Supported language" above.
4. ~~**Complex numbers**~~ — done: see "Supported language" above. Complex
   lists/matrices are the one deliberate exception — see below.
5. ~~**Long tail**~~ — done: `SortA(`/`SortD(`, `ClrList`, `cumSum(`,
   `ΔList(`, `inString(`, calculus tools (`nDeriv(`, `fnInt(`, `solve(`,
   `fMin(`/`fMax(`), and user-named lists (`∟NAME`) beyond `L1`-`L6` — see
   "Supported language" above.

**What's still not included**, each a deliberate, documented scope
decision rather than an oversight:

- **Complex lists and matrices** — real hardware supports a complex-valued
  list/matrix entry (`{1+i,2-i}`); this interpreter doesn't. Every list and
  matrix operation (broadcasting, formatting, `rref(`, `mean(`, ...) would
  need a second, complex-aware code path for meaningfully less real-world
  payoff than complex scalars already provide.
- **`ModBoxplot`/`NormProbPlot`** stat plot types, and the Mark-style
  argument to `Plot1(`/`Pt-On(` — `Scatter`/`xyLine`/`Histogram`/`Boxplot`
  cover the common cases; points always draw as a small box.
- **`Text(`** — drawing text onto the graph screen needs a bitmap font
  renderer this interpreter doesn't have; `Output(`/`Disp` already cover
  text on the home screen.
- **`DiagnosticOn`/`DiagnosticOff`** — `r`/`R²` are always computed and
  stored (as if diagnostics were always on), rather than gating them behind
  a mode that defaults off on real hardware.
- **`Med-Med`, `Logistic`, `SinReg`, `Manual-Fit`** regression types, and
  `GridOn`/`GridOff`/`AxesOn`/`AxesOff` graph-screen toggles — genuinely
  long-tail commands with limited use in typical intro-level programs.
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
