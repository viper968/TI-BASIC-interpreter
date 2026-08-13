import { useCallback, useRef, useState } from 'react'
import {
  type CompiledProgram,
  type InterpreterState,
  type ProgramResolver,
  type ResumeValue,
  type RunEvent,
  TIError,
  compileProgram,
  createInterpreterState,
  runProgram,
} from '../interpreter'

export type RunStatus = 'idle' | 'running' | 'input' | 'menu' | 'pause' | 'done' | 'error'

export interface PendingInput {
  type: 'input'
  prompt: string | null
}
export interface PendingMenu {
  type: 'menu'
  title: string
  options: { text: string; label: string }[]
}
export interface PendingPause {
  type: 'pause'
}
export type Pending = PendingInput | PendingMenu | PendingPause | null

/** How many `tick` events to process synchronously before yielding to the browser. */
const BATCH_TICKS = 20

export function useCalculator() {
  const [screenRows, setScreenRows] = useState<string[]>(() => createInterpreterState().screen.rows)
  const [status, setStatus] = useState<RunStatus>('idle')
  const [pending, setPending] = useState<Pending>(null)
  const [error, setError] = useState<TIError | null>(null)
  const [vars, setVars] = useState<Record<string, number>>({})

  const genRef = useRef<Generator<RunEvent, void, ResumeValue> | null>(null)
  const vmStateRef = useRef<InterpreterState | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const syncFromState = useCallback(() => {
    const s = vmStateRef.current
    if (!s) return
    setScreenRows([...s.screen.rows])
    setVars({ ...s.vars })
  }, [])

  const settle = useCallback(
    (ev: RunEvent) => {
      syncFromState()
      switch (ev.type) {
        case 'done':
          setStatus('done')
          setPending(null)
          break
        case 'error':
          setStatus('error')
          setError(ev.error)
          setPending(null)
          break
        case 'input':
          setStatus('input')
          setPending({ type: 'input', prompt: ev.prompt })
          break
        case 'menu':
          setStatus('menu')
          setPending({ type: 'menu', title: ev.title, options: ev.options })
          break
        case 'pause':
          setStatus('pause')
          setPending({ type: 'pause' })
          break
        case 'tick':
          break
      }
    },
    [syncFromState],
  )

  const pump = useCallback(
    (first: IteratorResult<RunEvent, void>) => {
      let res = first
      let batch = 0
      for (;;) {
        if (res.done) {
          settle({ type: 'done' })
          return
        }
        const ev = res.value
        if (ev.type === 'tick') {
          batch++
          syncFromState()
          if (batch >= BATCH_TICKS) {
            timeoutRef.current = setTimeout(() => {
              const gen = genRef.current
              if (gen) pump(gen.next())
            }, 0)
            return
          }
          res = genRef.current!.next()
          continue
        }
        settle(ev)
        return
      }
    },
    [settle, syncFromState],
  )

  const stop = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    genRef.current = null
    setStatus('idle')
    setPending(null)
  }, [])

  const run = useCallback(
    (compiled: CompiledProgram, resolveProgram: ProgramResolver) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      const state = createInterpreterState()
      vmStateRef.current = state
      const gen = runProgram(compiled, state, resolveProgram)
      genRef.current = gen
      setError(null)
      setStatus('running')
      syncFromState()
      pump(gen.next())
    },
    [pump, syncFromState],
  )

  const runSource = useCallback(
    (source: string, resolveProgram: ProgramResolver) => {
      const compiled = compileProgram(source)
      if (compiled.diagnostics.length > 0) {
        setStatus('error')
        setError(new TIError('ERR:SYNTAX', 'Fix the syntax errors below before running.'))
        setPending(null)
        return
      }
      run(compiled, resolveProgram)
    },
    [run],
  )

  const resume = useCallback(
    (value: ResumeValue) => {
      const gen = genRef.current
      if (!gen) return
      pump(gen.next(value))
    },
    [pump],
  )

  return { screenRows, status, pending, error, vars, runSource, resume, stop }
}
