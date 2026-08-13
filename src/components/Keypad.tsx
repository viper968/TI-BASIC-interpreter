import { useState } from 'react'

interface Props {
  onInsert: (text: string) => void
  onClear: () => void
  onEnter: () => void
}

const ALPHA_ROW = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'θ']

interface KeyDef {
  label: string
  insert?: string
  title?: string
}

const ROWS: KeyDef[][] = [
  [
    { label: 'PRGM', insert: 'prgm', title: 'Call another program' },
    { label: 'CLRHOME', insert: 'ClrHome' },
    { label: 'DISP', insert: 'Disp ' },
    { label: 'PAUSE', insert: 'Pause ' },
    { label: 'CLEAR', title: 'Clear the editor' },
  ],
  [
    { label: 'x⁻¹', insert: '⁻¹' },
    { label: 'sin', insert: 'sin(' },
    { label: 'cos', insert: 'cos(' },
    { label: 'tan', insert: 'tan(' },
    { label: '^', insert: '^' },
  ],
  [
    { label: 'x²', insert: '²' },
    { label: ',', insert: ',' },
    { label: '(', insert: '(' },
    { label: ')', insert: ')' },
    { label: '÷', insert: '/' },
  ],
  [
    { label: '√(', insert: '√(' },
    { label: '7', insert: '7' },
    { label: '8', insert: '8' },
    { label: '9', insert: '9' },
    { label: '×', insert: '*' },
  ],
  [
    { label: 'LOG', insert: 'log(' },
    { label: '4', insert: '4' },
    { label: '5', insert: '5' },
    { label: '6', insert: '6' },
    { label: '−', insert: '-' },
  ],
  [
    { label: 'LN', insert: 'ln(' },
    { label: '1', insert: '1' },
    { label: '2', insert: '2' },
    { label: '3', insert: '3' },
    { label: '+', insert: '+' },
  ],
  [
    { label: 'STO▶', insert: '→' },
    { label: '0', insert: '0' },
    { label: '.', insert: '.' },
    { label: '(-)', insert: '-' },
    { label: 'ENTER', title: 'Insert a newline' },
  ],
]

export function Keypad({ onInsert, onClear, onEnter }: Props) {
  const [showAlpha, setShowAlpha] = useState(false)

  const press = (key: KeyDef) => {
    if (key.label === 'CLEAR') return onClear()
    if (key.label === 'ENTER') return onEnter()
    if (key.insert) onInsert(key.insert)
  }

  return (
    <div className="keypad">
      <div className="keypad-toprow">
        <button className="keypad-key keypad-key-alpha" onClick={() => setShowAlpha((v) => !v)}>
          ALPHA {showAlpha ? '▲' : '▼'}
        </button>
        <button className="keypad-key" onClick={() => onInsert(':')}>
          :
        </button>
        <button className="keypad-key" onClick={() => onInsert('"')}>
          " "
        </button>
        <button className="keypad-key" onClick={() => onInsert('Ans')}>
          Ans
        </button>
      </div>
      {showAlpha && (
        <div className="keypad-alpha-grid">
          {ALPHA_ROW.map((ch) => (
            <button key={ch} className="keypad-key keypad-key-small" onClick={() => onInsert(ch)}>
              {ch}
            </button>
          ))}
        </div>
      )}
      {ROWS.map((row, i) => (
        <div className="keypad-row" key={i}>
          {row.map((key) => (
            <button
              key={key.label}
              className={key.label === 'ENTER' ? 'keypad-key keypad-key-enter' : 'keypad-key'}
              title={key.title}
              onClick={() => press(key)}
            >
              {key.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
