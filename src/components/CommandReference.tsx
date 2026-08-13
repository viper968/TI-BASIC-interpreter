import { useMemo, useState } from 'react'
import { COMMANDS, type CommandCategory } from '../interpreter'

const CATEGORY_LABELS: Record<CommandCategory, string> = {
  control: 'Control flow',
  io: 'Input / Output',
  variable: 'Variables',
  list: 'Lists',
  matrix: 'Matrices',
  stats: 'Statistics',
  graph: 'Graphing',
  complex: 'Complex Numbers',
  string: 'Strings',
  math: 'Math',
  logic: 'Logic',
  misc: 'Misc',
}

interface Props {
  onInsert: (text: string) => void
}

export function CommandReference({ onInsert }: Props) {
  const [query, setQuery] = useState('')

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = COMMANDS.filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.aliases?.some((a) => a.toLowerCase().includes(q)),
    )
    const groups = new Map<CommandCategory, typeof filtered>()
    for (const c of filtered) {
      const arr = groups.get(c.category) ?? []
      arr.push(c)
      groups.set(c.category, arr)
    }
    return groups
  }, [query])

  return (
    <div className="cmdref">
      <input
        className="cmdref-search"
        placeholder="Search commands…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="cmdref-list">
        {[...grouped.entries()].map(([cat, cmds]) => (
          <div key={cat} className="cmdref-group">
            <div className="cmdref-group-title">{CATEGORY_LABELS[cat]}</div>
            {cmds.map((c) => (
              <button key={c.name} className="cmdref-item" onClick={() => onInsert(c.name)} title="Click to insert">
                <div className="cmdref-item-head">
                  <span className="cmdref-item-name">{c.name}</span>
                  {c.aliases && <span className="cmdref-item-alias">({c.aliases.join(', ')})</span>}
                </div>
                <div className="cmdref-item-syntax">{c.syntax}</div>
                <div className="cmdref-item-desc">{c.description}</div>
              </button>
            ))}
          </div>
        ))}
        {grouped.size === 0 && <div className="cmdref-empty">No commands match "{query}"</div>}
      </div>
    </div>
  )
}
