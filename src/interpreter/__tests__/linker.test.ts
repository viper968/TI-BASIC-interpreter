import { describe, expect, it } from 'vitest'
import { parse } from '../parser'
import { link } from '../linker'

function linkSource(source: string) {
  const { program, diagnostics } = parse(source)
  const linked = link(program)
  return { linked, diagnostics: [...diagnostics, ...linked.diagnostics] }
}

describe('linker', () => {
  it('links a For/End pair', () => {
    const { linked, diagnostics } = linkSource('For(I,1,10)\nDisp I\nEnd')
    expect(diagnostics).toHaveLength(0)
    expect(linked.links.get(0)).toEqual({ kind: 'for', endIndex: 2 })
    expect(linked.links.get(2)).toEqual({ kind: 'end', partnerIndex: 0, partnerKind: 'for' })
  })

  it('reports a missing End', () => {
    const { diagnostics } = linkSource('For(I,1,10)\nDisp I')
    expect(diagnostics.some((d) => d.message.includes('missing a matching "End"'))).toBe(true)
  })

  it('reports a stray End', () => {
    const { diagnostics } = linkSource('End')
    expect(diagnostics.some((d) => d.message.includes('no matching'))).toBe(true)
  })

  it('reports Else without a matching If...Then', () => {
    const { diagnostics } = linkSource('Else')
    expect(diagnostics.some((d) => d.message.includes('Else'))).toBe(true)
  })

  it('links If/Then/Else/End with the else branch', () => {
    const { linked, diagnostics } = linkSource('If A=1\nThen\nDisp "A"\nElse\nDisp "B"\nEnd')
    expect(diagnostics).toHaveLength(0)
    const ifLink = linked.links.get(0)
    expect(ifLink).toMatchObject({ kind: 'if-block' })
    if (ifLink?.kind !== 'if-block') throw new Error('expected if-block')
    expect(ifLink.elseIndex).not.toBeNull()
  })

  it('resolves a single-line If to skip exactly one guarded statement', () => {
    const { linked, diagnostics } = linkSource('If A=1\nDisp "A"\nDisp "B"')
    expect(diagnostics).toHaveLength(0)
    const ifLink = linked.links.get(0)
    expect(ifLink).toEqual({ kind: 'if-single', skipIndex: 2 })
  })

  it('resolves a single-line If guarding a whole For loop', () => {
    const { linked, diagnostics } = linkSource('If A=1\nFor(I,1,10)\nDisp I\nEnd\nDisp "DONE"')
    expect(diagnostics).toHaveLength(0)
    // instructions: 0=If 1=For 2=Disp 3=End 4=Disp
    const ifLink = linked.links.get(0)
    expect(ifLink).toEqual({ kind: 'if-single', skipIndex: 4 })
  })

  it('resolves labels and flags an undefined Goto target', () => {
    const ok = linkSource('Lbl AA\nGoto AA')
    expect(ok.diagnostics).toHaveLength(0)
    expect(ok.linked.labels.get('AA')).toBe(0)

    const bad = linkSource('Goto ZZ')
    expect(bad.diagnostics.some((d) => d.code === 'ERR:LABEL')).toBe(true)
  })
})
