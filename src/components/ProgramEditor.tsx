import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import type { Diagnostic } from '../interpreter'
import { highlight } from './highlight'

export interface ProgramEditorHandle {
  insertAtCursor: (text: string) => void
  focus: () => void
}

interface GotoRequest {
  line: number
  /** Bump this on every request so the same line can be re-jumped-to twice in a row. */
  token: number
}

interface Props {
  source: string
  onChange: (source: string) => void
  diagnostics: Diagnostic[]
  gotoRequest?: GotoRequest | null
}

export const ProgramEditor = forwardRef<ProgramEditorHandle, Props>(function ProgramEditor(
  { source, onChange, diagnostics, gotoRequest },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const preRef = useRef<HTMLPreElement>(null)

  const spans = useMemo(() => highlight(source), [source])
  const lines = useMemo(() => source.split('\n'), [source])
  const errorLines = useMemo(() => new Set(diagnostics.map((d) => d.line)), [diagnostics])

  const syncScroll = () => {
    if (preRef.current && textareaRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop
      preRef.current.scrollLeft = textareaRef.current.scrollLeft
    }
  }

  useImperativeHandle(ref, () => ({
    insertAtCursor(text: string) {
      const el = textareaRef.current
      if (!el) return
      const start = el.selectionStart ?? source.length
      const end = el.selectionEnd ?? source.length
      const next = source.slice(0, start) + text + source.slice(end)
      onChange(next)
      requestAnimationFrame(() => {
        el.focus()
        const pos = start + text.length
        el.setSelectionRange(pos, pos)
      })
    },
    focus() {
      textareaRef.current?.focus()
    },
  }))

  useEffect(() => {
    if (!gotoRequest || !textareaRef.current) return
    const idx = lines.slice(0, gotoRequest.line - 1).reduce((sum, l) => sum + l.length + 1, 0)
    const lineLen = lines[gotoRequest.line - 1]?.length ?? 0
    textareaRef.current.focus()
    textareaRef.current.setSelectionRange(idx, idx + lineLen)
    // Intentionally keyed on the token only: re-run exactly when a new jump is requested.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gotoRequest?.token])

  return (
    <div className="editor-wrap">
      <div className="editor-gutter" aria-hidden="true">
        {lines.map((_, i) => (
          <div key={i} className={errorLines.has(i + 1) ? 'gutter-line gutter-error' : 'gutter-line'}>
            {i + 1}
          </div>
        ))}
      </div>
      <div className="editor-code">
        <pre className="editor-highlight" ref={preRef} aria-hidden="true">
          {spans.map((s, i) => (s.cls ? <span key={i} className={s.cls}>{s.text}</span> : <span key={i}>{s.text}</span>))}
          {'\n'}
        </pre>
        <textarea
          ref={textareaRef}
          className="editor-textarea"
          value={source}
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          placeholder={'Disp "HELLO, WORLD!"'}
        />
      </div>
    </div>
  )
})
