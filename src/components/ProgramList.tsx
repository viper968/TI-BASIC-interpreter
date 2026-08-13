import { useState } from 'react'
import type { StoredProgram } from '../state/programsStore'

interface Props {
  programs: StoredProgram[]
  activeId: string
  onSelect: (id: string) => void
  onCreate: (name: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
}

export function ProgramList({ programs, activeId, onSelect, onCreate, onRename, onDelete, onDuplicate }: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')

  const startRename = (p: StoredProgram) => {
    setRenamingId(p.id)
    setDraftName(p.name)
  }
  const commitRename = () => {
    if (renamingId && draftName.trim()) onRename(renamingId, sanitizeName(draftName))
    setRenamingId(null)
  }

  return (
    <div className="proglist">
      <div className="proglist-header">
        <span>Programs</span>
        <button
          className="proglist-new"
          onClick={() => {
            const name = sanitizeName(prompt('Program name (up to 8 letters/digits):', 'PROGRAM') ?? '')
            if (name) onCreate(name)
          }}
        >
          + New
        </button>
      </div>
      <ul className="proglist-items">
        {programs.map((p) => (
          <li key={p.id} className={p.id === activeId ? 'proglist-item proglist-item-active' : 'proglist-item'}>
            {renamingId === p.id ? (
              <input
                className="proglist-rename-input"
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename()
                  if (e.key === 'Escape') setRenamingId(null)
                }}
              />
            ) : (
              <button className="proglist-name" onClick={() => onSelect(p.id)} title={`prgm${p.name}`}>
                {p.name}
              </button>
            )}
            <div className="proglist-actions">
              <button title="Rename" onClick={() => startRename(p)}>
                ✎
              </button>
              <button title="Duplicate" onClick={() => onDuplicate(p.id)}>
                ⧉
              </button>
              <button
                title="Delete"
                onClick={() => {
                  if (confirm(`Delete prgm${p.name}? This can't be undone.`)) onDelete(p.id)
                }}
              >
                🗑
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function sanitizeName(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8)
}
