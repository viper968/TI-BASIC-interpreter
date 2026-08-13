import { compileProgram, createInterpreterState, runProgram } from '../vm'
import type { InterpreterState, ProgramResolver, ResumeValue, RunEvent } from '../vm'
import { TIError } from '../errors'

export interface RunResult {
  state: InterpreterState
  screenText: string
  error: TIError | null
  events: RunEvent[]
}

/**
 * Runs `source` to completion, feeding canned responses (in order) to any
 * input/menu/pause events it raises. Throws if the program needs more
 * responses than were provided, so tests fail loudly instead of hanging.
 */
export function run(source: string, responses: ResumeValue[] = [], resolveProgram?: ProgramResolver): RunResult {
  const compiled = compileProgram(source)
  if (compiled.diagnostics.length > 0) {
    throw new Error(
      `Program has syntax errors, refusing to run:\n${compiled.diagnostics.map((d) => `line ${d.line}: ${d.code} ${d.message}`).join('\n')}`,
    )
  }
  const state = createInterpreterState()
  const resolver: ProgramResolver = resolveProgram ?? (() => undefined)
  const gen = runProgram(compiled, state, resolver)
  const events: RunEvent[] = []
  let responseIndex = 0
  let error: TIError | null = null

  let next = gen.next()
  while (!next.done) {
    const ev = next.value
    events.push(ev)
    if (ev.type === 'done') break
    if (ev.type === 'error') {
      error = ev.error
      break
    }
    if (ev.type === 'tick') {
      next = gen.next()
      continue
    }
    if (responseIndex >= responses.length) {
      throw new Error(`Program requested more input than the test provided (event: ${ev.type})`)
    }
    next = gen.next(responses[responseIndex++])
  }

  return { state, screenText: state.screen.rows.join('\n').replace(/\s+$/gm, ''), error, events }
}
