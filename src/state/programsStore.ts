import { useCallback, useEffect, useMemo, useState } from 'react'

export interface StoredProgram {
  id: string
  name: string
  source: string
  updatedAt: number
}

const STORAGE_KEY = 'ti84-basic-studio.programs.v1'
const ACTIVE_KEY = 'ti84-basic-studio.active.v1'

function uid(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase()
}

const SAMPLE_PROGRAMS: Omit<StoredProgram, 'id' | 'updatedAt'>[] = [
  {
    name: 'HELLO',
    source: [
      'ClrHome',
      'Disp "HELLO, WORLD!"',
      'Disp ""',
      'Input "YOUR NAME? ",Str1',
      'Disp "NICE TO MEET YOU,"',
      'Disp Str1',
    ].join('\n'),
  },
  {
    name: 'SUMLOOP',
    source: [
      '0->S',
      'Input "SUM 1 TO N, N=",N',
      'For(I,1,N)',
      'S+I->S',
      'End',
      'Disp "SUM IS"',
      'Disp S',
    ].join('\n'),
  },
  {
    name: 'GUESS',
    source: [
      'randInt(1,20)->N',
      '0->G',
      'ClrHome',
      'Disp "GUESS 1-20"',
      'Lbl TRY',
      'Input "GUESS? ",G',
      'If G=N',
      'Then',
      'Disp "CORRECT!"',
      'Else',
      'If G<N',
      'Then',
      'Disp "TOO LOW"',
      'Else',
      'Disp "TOO HIGH"',
      'End',
      'Goto TRY',
      'End',
    ].join('\n'),
  },
  {
    name: 'MATRIX',
    source: [
      'ClrHome',
      'Disp "SOLVE:"',
      'Disp "2X+Y=5"',
      'Disp "X-Y=1"',
      '[[2,1,5][1,-1,1]]->[A]',
      'rref([A])->[B]',
      'Disp "X="',
      'Disp [B](1,3)',
      'Disp "Y="',
      'Disp [B](2,3)',
    ].join('\n'),
  },
]

function loadPrograms(): StoredProgram[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as StoredProgram[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {
    // fall through to seeding defaults
  }
  const now = Date.now()
  const seeded = SAMPLE_PROGRAMS.map((p, i) => ({ ...p, id: uid(), updatedAt: now + i }))
  // Persist immediately: useProgramLibrary calls this from two separate
  // useState initializers, and both must agree on the same generated ids.
  savePrograms(seeded)
  return seeded
}

function savePrograms(programs: StoredProgram[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(programs))
}

/** A tiny localStorage-backed "program manager", similar to the calculator's PRGM menu. */
export function useProgramLibrary() {
  const [programs, setPrograms] = useState<StoredProgram[]>(() => loadPrograms())
  const [activeId, setActiveId] = useState<string>(() => {
    const saved = localStorage.getItem(ACTIVE_KEY)
    const list = loadPrograms()
    return saved && list.some((p) => p.id === saved) ? saved : list[0]?.id
  })

  useEffect(() => savePrograms(programs), [programs])
  useEffect(() => {
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId)
  }, [activeId])

  const activeProgram = useMemo(() => programs.find((p) => p.id === activeId) ?? null, [programs, activeId])

  const createProgram = useCallback((name: string) => {
    const id = uid()
    setPrograms((prev) => [...prev, { id, name, source: '', updatedAt: Date.now() }])
    setActiveId(id)
    return id
  }, [])

  const deleteProgram = useCallback(
    (id: string) => {
      setPrograms((prev) => {
        const next = prev.filter((p) => p.id !== id)
        if (id === activeId) setActiveId(next[0]?.id ?? '')
        return next
      })
    },
    [activeId],
  )

  const renameProgram = useCallback((id: string, name: string) => {
    setPrograms((prev) => prev.map((p) => (p.id === id ? { ...p, name, updatedAt: Date.now() } : p)))
  }, [])

  const updateSource = useCallback((id: string, source: string) => {
    setPrograms((prev) => prev.map((p) => (p.id === id ? { ...p, source, updatedAt: Date.now() } : p)))
  }, [])

  const duplicateProgram = useCallback((id: string) => {
    setPrograms((prev) => {
      const src = prev.find((p) => p.id === id)
      if (!src) return prev
      const newId = uid()
      let n = 2
      let name = `${src.name}${n}`
      while (prev.some((p) => p.name === name)) {
        n++
        name = `${src.name}${n}`
      }
      setActiveId(newId)
      return [...prev, { id: newId, name, source: src.source, updatedAt: Date.now() }]
    })
  }, [])

  const resolveProgramSource = useCallback(
    (name: string) => programs.find((p) => p.name === name)?.source,
    [programs],
  )

  return {
    programs,
    activeId,
    activeProgram,
    setActiveId,
    createProgram,
    deleteProgram,
    renameProgram,
    updateSource,
    duplicateProgram,
    resolveProgramSource,
  }
}
