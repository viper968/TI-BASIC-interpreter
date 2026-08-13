import { useEffect, useRef } from 'react'
import { GRAPH_COLS, GRAPH_ROWS, type GraphScreen as GraphScreenData } from '../interpreter'

interface Props {
  graphScreen: GraphScreenData | null
  vars: Record<string, number>
  yVars: Record<string, string>
}

/** Rendered size (in CSS px) of one graph pixel — the 95x63 buffer is tiny otherwise. */
const PIXEL_SIZE = 4

/** A read-only view of the 95x63 graph pixel buffer, plus the current window and Y= definitions. */
export function GraphScreen({ graphScreen, vars, yVars }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const styles = getComputedStyle(canvas)
    ctx.fillStyle = styles.getPropertyValue('--lcd-bg').trim() || '#bcc9a8'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    if (!graphScreen) return
    ctx.fillStyle = styles.getPropertyValue('--lcd-fg').trim() || '#1c2413'
    for (let r = 0; r < GRAPH_ROWS; r++) {
      const row = graphScreen.pixels[r]
      if (!row) continue
      for (let c = 0; c < GRAPH_COLS; c++) {
        if (row[c]) ctx.fillRect(c * PIXEL_SIZE, r * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE)
      }
    }
  }, [graphScreen])

  const definedY = Object.entries(yVars)
    .filter(([, def]) => def !== '')
    .sort(([a], [b]) => a.localeCompare(b))

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
