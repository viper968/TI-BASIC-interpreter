import type { Diagnostic } from '../interpreter'

interface Props {
  diagnostics: Diagnostic[]
  onJump: (line: number) => void
}

export function DiagnosticsPanel({ diagnostics, onJump }: Props) {
  if (diagnostics.length === 0) {
    return (
      <div className="diagnostics diagnostics-ok">
        <span className="diagnostics-dot diagnostics-dot-ok" />
        No syntax errors
      </div>
    )
  }
  return (
    <div className="diagnostics diagnostics-bad">
      <div className="diagnostics-header">
        <span className="diagnostics-dot diagnostics-dot-bad" />
        {diagnostics.length} {diagnostics.length === 1 ? 'error' : 'errors'}
      </div>
      <ul className="diagnostics-list">
        {diagnostics.map((d, i) => (
          <li key={i}>
            <button className="diagnostics-item" onClick={() => onJump(d.line)}>
              <span className="diagnostics-code">{d.code}</span>
              <span className="diagnostics-line">line {d.line}</span>
              <span className="diagnostics-msg">{d.message}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
