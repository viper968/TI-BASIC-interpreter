import { useEffect, useMemo, useRef, useState } from 'react'
import { GRAPH_COLS, GRAPH_ROWS, colToX, type GraphScreen as GraphScreenData, yToRow } from '../interpreter'

interface Props {
  graphScreen: GraphScreenData | null
  vars: Record<string, number>
  yVars: Record<string, string>
  /** Evaluates a Y-variable at x against the calculator's current state; null if undefined or out of domain. */
  evalYVarAt: (name: string, x: number) => number | null
}

/** Rendered size (in CSS px) of one graph pixel — the 95x63 buffer is tiny otherwise. */
const PIXEL_SIZE = 4

function formatTraceNumber(n: number): string {
  return Number(n.toPrecision(6)).toString()
}

/**
 * A read-only view of the 95x63 graph pixel buffer, the current window and
 * Y= definitions, and a TRACE-style cursor: real hardware's TRACE isn't a
 * TI-BASIC command (it's an OS key), so it's implemented here as a GUI
 * feature — step a cursor along a chosen Y-variable's curve and read off
 * (X,Y), the same interaction real TRACE gives you.
 */
export function GraphScreen({ graphScreen, vars, yVars, evalYVarAt }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [traceOn, setTraceOn] = useState(false)
  const [traceName, setTraceName] = useState<string | null>(null)
  const [traceCol, setTraceCol] = useState(Math.round((GRAPH_COLS - 1) / 2))

  const definedY = Object.entries(yVars)
    .filter(([, def]) => def !== '')
    .sort(([a], [b]) => a.localeCompare(b))

  const win = useMemo(
    () => ({ xMin: vars.Xmin ?? -10, xMax: vars.Xmax ?? 10, yMin: vars.Ymin ?? -10, yMax: vars.Ymax ?? 10 }),
    [vars.Xmin, vars.Xmax, vars.Ymin, vars.Ymax],
  )

  // Keep the traced Y-variable valid as definitions change; default to the first one.
  useEffect(() => {
    if (!traceOn) return
    if (traceName && definedY.some(([n]) => n === traceName)) return
    setTraceName(definedY[0]?.[0] ?? null)
  }, [traceOn, traceName, definedY])

  const traceX = colToX(traceCol, win)
  const traceY = traceOn && traceName ? evalYVarAt(traceName, traceX) : null

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const styles = getComputedStyle(canvas)
    const bg = styles.getPropertyValue('--lcd-bg').trim() || '#bcc9a8'
    const fg = styles.getPropertyValue('--lcd-fg').trim() || '#1c2413'
    const accent = styles.getPropertyValue('--accent').trim() || '#7c9eff'
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    if (graphScreen) {
      ctx.fillStyle = fg
      for (let r = 0; r < GRAPH_ROWS; r++) {
        const row = graphScreen.pixels[r]
        if (!row) continue
        for (let c = 0; c < GRAPH_COLS; c++) {
          if (row[c]) ctx.fillRect(c * PIXEL_SIZE, r * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE)
        }
      }
    }
    if (traceOn && traceName && traceY !== null) {
      const row = yToRow(traceY, win)
      if (row >= 0 && row < GRAPH_ROWS) {
        ctx.fillStyle = accent
        ctx.beginPath()
        ctx.arc(traceCol * PIXEL_SIZE + PIXEL_SIZE / 2, row * PIXEL_SIZE + PIXEL_SIZE / 2, PIXEL_SIZE * 1.4, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }, [graphScreen, traceOn, traceName, traceY, traceCol, win])

  return (
    <div className="graph-panel">
      <canvas ref={canvasRef} width={GRAPH_COLS * PIXEL_SIZE} height={GRAPH_ROWS * PIXEL_SIZE} className="graph-canvas" />
      <div className="graph-window">
        <span>
          X: [{vars.Xmin ?? -10}, {vars.Xmax ?? 10}] scl {vars.Xscl ?? 1}
        </span>
        <span>
          Y: [{vars.Ymin ?? -10}, {vars.Ymax ?? 10}] scl {vars.Yscl ?? 1}
        </span>
      </div>
      <div className="graph-trace">
        <button
          className={traceOn ? 'btn btn-primary' : 'btn'}
          disabled={definedY.length === 0}
          onClick={() => setTraceOn((on) => !on)}
          title={definedY.length === 0 ? 'Define a Y-variable first' : 'Step along a Y-variable\'s curve'}
        >
          {traceOn ? '■ Stop Trace' : '▶ Trace'}
        </button>
        {traceOn && (
          <>
            <select className="graph-trace-select" value={traceName ?? ''} onChange={(e) => setTraceName(e.target.value)}>
              {definedY.map(([name]) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <button className="btn" onClick={() => setTraceCol((c) => Math.max(0, c - 1))} title="Step left">
              ◀
            </button>
            <button className="btn" onClick={() => setTraceCol((c) => Math.min(GRAPH_COLS - 1, c + 1))} title="Step right">
              ▶
            </button>
            <span className="graph-trace-readout">
              X={formatTraceNumber(traceX)} Y={traceY === null ? 'undefined' : formatTraceNumber(traceY)}
            </span>
          </>
        )}
      </div>
      <div className="graph-yvars">
        {definedY.length === 0 ? (
          <div className="graph-yvars-empty">No Y-variables defined. Store a string to Y1-Y9, e.g. "X²"→Y1.</div>
        ) : (
          definedY.map(([name, def]) => (
            <div className="graph-yvar" key={name}>
              <span className="graph-yvar-name">{name}=</span>
              <span className="graph-yvar-def">{def}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
