import { useEffect, useRef, useState } from 'react'
import { SCREEN_COLS, SCREEN_ROWS } from '../interpreter'
import type { Pending, RunStatus } from '../state/useCalculator'
import type { TIError } from '../interpreter'

interface Props {
  screenRows: string[]
  status: RunStatus
  pending: Pending
  error: TIError | null
  onResume: (value: string | number | undefined) => void
  onGotoErrorLine?: (line: number) => void
}

export function CalculatorScreen({ screenRows, status, pending, error, onResume, onGotoErrorLine }: Props) {
  const [inputText, setInputText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (pending?.type === 'input') {
      setInputText('')
      inputRef.current?.focus()
    }
  }, [pending])

  const rows = Array.from({ length: SCREEN_ROWS }, (_, i) => screenRows[i] ?? '')

  return (
    <div className="calc-body">
      <div className="calc-brand">
        <span>TI-84 Plus Silver Edition</span>
        <span className="calc-brand-dot" data-status={status} title={`status: ${status}`} />
      </div>
      <div className="calc-lcd" role="status" aria-live="polite">
        {rows.map((row, i) => (
          <div className="calc-lcd-row" key={i}>
            {row.padEnd(SCREEN_COLS, ' ')}
          </div>
        ))}

        {status === 'menu' && pending?.type === 'menu' && (
          <div className="calc-overlay calc-menu">
            <div className="calc-menu-title">{pending.title}</div>
            {pending.options.map((opt, i) => (
              <button key={opt.label + i} className="calc-menu-option" onClick={() => onResume(i + 1)}>
                {i + 1}:{opt.text}
              </button>
            ))}
          </div>
        )}

        {status === 'pause' && (
          <div className="calc-overlay calc-pause">
            <span>Paused — press [ENTER] to continue ▮</span>
            <button className="calc-key-enter" onClick={() => onResume(undefined)}>
              ENTER
            </button>
          </div>
        )}

        {status === 'error' && error && (
          <div className="calc-overlay calc-error">
            <div className="calc-error-code">{error.code}</div>
            <div className="calc-error-msg">{error.message}</div>
            <div className="calc-error-actions">
              {error.line !== undefined && onGotoErrorLine && (
                <button onClick={() => onGotoErrorLine(error.line!)}>2:Goto (line {error.line})</button>
              )}
            </div>
          </div>
        )}
      </div>

      {status === 'input' && pending?.type === 'input' && (
        <div className="calc-input-wrap">
          {pending.invalid && (
            <div className="calc-input-invalid">ERR:SYNTAX — that wasn't a value. Try again.</div>
          )}
          <form
            className="calc-input-row"
            onSubmit={(e) => {
              e.preventDefault()
              onResume(inputText)
            }}
          >
            <span className="calc-input-label">{pending.prompt ?? '?'}</span>
            <input
              ref={inputRef}
              className={pending.invalid ? 'calc-input-field calc-input-field-invalid' : 'calc-input-field'}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="type a value, e.g. 5 or &quot;TEXT&quot;"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit">ENTER</button>
          </form>
        </div>
      )}

      {status === 'done' && <div className="calc-status-line">Done</div>}
    </div>
  )
}
