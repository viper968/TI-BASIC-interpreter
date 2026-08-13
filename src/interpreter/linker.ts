import type { Diagnostic } from './errors'
import type { Instruction, Program } from './ast'

export type LinkInfo =
  | { kind: 'for'; endIndex: number }
  | { kind: 'while'; endIndex: number }
  | { kind: 'repeat'; endIndex: number }
  | { kind: 'if-block'; elseIndex: number | null; endIndex: number }
  | { kind: 'if-single'; skipIndex: number }
  | { kind: 'else'; endIndex: number }
  | { kind: 'end'; partnerIndex: number; partnerKind: 'for' | 'while' | 'repeat' | 'if-block' }

export interface LinkedProgram {
  program: Program
  /** Runtime jump/link metadata, keyed by instruction index. */
  links: Map<number, LinkInfo>
  /** Lbl name -> instruction index. */
  labels: Map<string, number>
  diagnostics: Diagnostic[]
}

interface StackFrame {
  kind: 'for' | 'while' | 'repeat' | 'if-block'
  index: number
  elseIndex: number | null
}

/**
 * Resolves block structure (For/While/Repeat/If-Then/Else/End) and label
 * targets (Lbl/Goto) into concrete instruction-pointer jumps, and reports
 * any structural problems as diagnostics (unmatched End, stray Else,
 * Goto to an undefined label, etc).
 */
export function link(program: Program): LinkedProgram {
  const diagnostics: Diagnostic[] = []
  const links = new Map<number, LinkInfo>()
  const labels = new Map<string, number>()
  const stack: StackFrame[] = []
  const { instructions } = program

  instructions.forEach((instr, index) => {
    const { stmt } = instr
    if (stmt.kind === 'Lbl') {
      if (!labels.has(stmt.name)) labels.set(stmt.name, index)
      return
    }
    if (stmt.kind === 'For') {
      stack.push({ kind: 'for', index, elseIndex: null })
      return
    }
    if (stmt.kind === 'While') {
      stack.push({ kind: 'while', index, elseIndex: null })
      return
    }
    if (stmt.kind === 'Repeat') {
      stack.push({ kind: 'repeat', index, elseIndex: null })
      return
    }
    if (stmt.kind === 'If' && stmt.blockMode) {
      stack.push({ kind: 'if-block', index, elseIndex: null })
      return
    }
    if (stmt.kind === 'Else') {
      const top = stack[stack.length - 1]
      if (!top || top.kind !== 'if-block') {
        diagnostics.push({ code: 'ERR:SYNTAX', message: '"Else" has no matching "If…Then"', line: instr.line })
        return
      }
      if (top.elseIndex !== null) {
        diagnostics.push({ code: 'ERR:SYNTAX', message: 'Only one "Else" is allowed per "If…Then"', line: instr.line })
        return
      }
      top.elseIndex = index
      return
    }
    if (stmt.kind === 'End') {
      const top = stack.pop()
      if (!top) {
        diagnostics.push({
          code: 'ERR:SYNTAX',
          message: '"End" has no matching For(/While/Repeat/If…Then',
          line: instr.line,
        })
        return
      }
      links.set(index, { kind: 'end', partnerIndex: top.index, partnerKind: top.kind })
      if (top.kind === 'if-block') {
        links.set(top.index, { kind: 'if-block', elseIndex: top.elseIndex, endIndex: index })
      } else {
        links.set(top.index, { kind: top.kind, endIndex: index })
      }
      return
    }
  })

  for (const unclosed of stack) {
    const label =
      unclosed.kind === 'for'
        ? 'For('
        : unclosed.kind === 'while'
          ? 'While'
          : unclosed.kind === 'repeat'
            ? 'Repeat'
            : 'If…Then'
    diagnostics.push({
      code: 'ERR:SYNTAX',
      message: `"${label}" is missing a matching "End"`,
      line: instructions[unclosed.index].line,
    })
  }

  // Second pass: resolve single-line If skip targets, processed in reverse
  // so a chain of stacked single-line Ifs resolves inner-to-outer.
  for (let i = instructions.length - 1; i >= 0; i--) {
    const { stmt } = instructions[i]
    if (stmt.kind !== 'If' || stmt.blockMode) continue
    const guardedIndex = i + 1
    if (guardedIndex >= instructions.length) {
      links.set(i, { kind: 'if-single', skipIndex: guardedIndex })
      continue
    }
    const guardedLink = links.get(guardedIndex)
    let skipIndex = guardedIndex + 1
    if (guardedLink && (guardedLink.kind === 'for' || guardedLink.kind === 'while' || guardedLink.kind === 'repeat' || guardedLink.kind === 'if-block')) {
      skipIndex = guardedLink.endIndex + 1
    } else if (guardedLink && guardedLink.kind === 'if-single') {
      skipIndex = guardedLink.skipIndex
    }
    links.set(i, { kind: 'if-single', skipIndex })
  }

  // Validate Goto targets now that all labels are known.
  instructions.forEach((instr) => {
    if (instr.stmt.kind === 'Goto' && !labels.has(instr.stmt.name)) {
      diagnostics.push({
        code: 'ERR:LABEL',
        message: `Goto ${instr.stmt.name} has no matching "Lbl ${instr.stmt.name}"`,
        line: instr.line,
      })
    }
  })

  return { program, links, labels, diagnostics }
}

export function instructionAt(program: Program, index: number): Instruction | undefined {
  return program.instructions[index]
}
