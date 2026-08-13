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
- **`src/components/`, `src/state/`, `src/App.tsx`** — the React GUI: a
  program manager, a syntax-highlighted code editor with live diagnostics,
  a TI-84-style calculator screen that actually runs programs (including
  interactive `Input`/`Prompt`/`Menu(`/`Pause`), a keypad for inserting
  tokens, and a searchable command reference.

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
one slot when you store to index `dim+1`, matching real behavior), `Ans`,
`DelVar`, the `→` store arrow (type `->` if you don't have the glyph
handy), and calling another saved program with `prgmNAME`.

**Expressions:** all the usual arithmetic/relational/logic operators,
implicit multiplication (`2X`, `2(3+4)`, `AB`), correct TI operator
precedence (e.g. `-2^2` is `-4`, `^` is right-associative), `π`, `e`,
`nCr`/`nPr`, and the common math functions (`sin(`, `cos(`, `tan(` and
their inverses, `ln(`, `log(`, `√(`, `abs(`, `round(`, `int(`, `iPart(`,
`fPart(`, `randInt(`, `min(`, `max(`, `gcd(`, `lcm(`, `not(`), list
functions (`dim(`, `seq(`, `sum(`, `augment(`), and string functions
(`length(`, `sub(`, plus `+` for concatenation). `Degree`/`Radian` switch
the angle mode (default: Degree).

Open the **Commands** tab in the app for the full, searchable list with
syntax and descriptions — it's generated straight from
`src/interpreter/commands.ts`.

## Known limitations / roadmap

This is a real subset, not a full emulator. Deliberately not implemented
yet (and worth knowing about if a program uses them):

- Matrices (`[A]`-`[J]`), complex numbers, statistics lists/plots, and all
  graphing commands (`Y=`, `DispGraph`, `Line(`, ...).
- User-created list names (only `L1`-`L6`).
- `{1,2,3}` list-literal syntax — build lists with `seq(` or by assigning
  elements one at a time (`1->L1(1)`, `2->L1(2)`, ...).
- Re-prompting on a bad `Input`/`Prompt` entry — real hardware asks again;
  here it raises `ERR:SYNTAX` instead.
- A handful of rarely-used CATALOG-only commands.

A generous but finite execution-step cap guards against runaway loops
freezing the browser tab (real hardware has no such limit, but a web page
does need one).

## Architecture notes

The interpreter never touches the DOM and has no React dependency — it's
tested independently in `src/interpreter/__tests__/` (lexer, parser,
linker, and end-to-end VM behavior, including the interactive
`Input`/`Menu`/`Pause` pause-and-resume protocol). The GUI is a thin layer
on top: `useCalculator()` drives the VM's generator, batching `tick`
events so long-running loops periodically yield back to the browser
instead of freezing the tab, and surfacing `input`/`menu`/`pause`/`error`
events as UI state.
