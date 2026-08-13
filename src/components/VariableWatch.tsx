import { formatList, formatNumber } from '../interpreter'

interface Props {
  vars: Record<string, number>
  strVars: Record<string, string>
  lists: Record<string, number[]>
}

/** A live debugging view of calculator memory — only shows variables that aren't at their default value. */
export function VariableWatch({ vars, strVars, lists }: Props) {
  const realEntries = Object.entries(vars).filter(([, v]) => v !== 0)
  const strEntries = Object.entries(strVars).filter(([, v]) => v !== '')
  const listEntries = Object.entries(lists).filter(([, v]) => v.length > 0)
  const total = realEntries.length + strEntries.length + listEntries.length

  return (
    <div className="varwatch">
      <div className="varwatch-title">Variables</div>
      {total === 0 ? (
        <div className="varwatch-empty">No variables set yet</div>
      ) : (
        <div className="varwatch-grid">
          {realEntries.map(([k, v]) => (
            <div className="varwatch-item" key={k}>
              <span className="varwatch-name">{k}</span>
              <span className="varwatch-value">{formatNumber(v)}</span>
            </div>
          ))}
          {strEntries.map(([k, v]) => (
            <div className="varwatch-item" key={k}>
              <span className="varwatch-name">{k}</span>
              <span className="varwatch-value">"{v}"</span>
            </div>
          ))}
          {listEntries.map(([k, v]) => (
            <div className="varwatch-item varwatch-item-wide" key={k}>
              <span className="varwatch-name">{k}</span>
              <span className="varwatch-value">{formatList(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
