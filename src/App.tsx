import { useMemo, useRef, useState } from 'react'
import './App.css'
import { compileProgram } from './interpreter'
import { useProgramLibrary } from './state/programsStore'
import { useCalculator } from './state/useCalculator'
import { CalculatorScreen } from './components/CalculatorScreen'
import { Keypad } from './components/Keypad'
import { ProgramEditor, type ProgramEditorHandle } from './components/ProgramEditor'
import { ProgramList } from './components/ProgramList'
import { DiagnosticsPanel } from './components/DiagnosticsPanel'
import { CommandReference } from './components/CommandReference'

type RightTab = 'calculator' | 'commands'

export default function App() {
  const lib = useProgramLibrary()
  const calc = useCalculator()
  const editorRef = useRef<ProgramEditorHandle>(null)
  const [rightTab, setRightTab] = useState<RightTab>('calculator')
  const [gotoRequest, setGotoRequest] = useState<{ line: number; token: number } | null>(null)

  const source = lib.activeProgram?.source ?? ''
  const compiled = useMemo(() => compileProgram(source), [source])
  const diagnostics = compiled.diagnostics

  const handleChange = (next: string) => {
    if (lib.activeProgram) lib.updateSource(lib.activeProgram.id, next)
  }

  const handleRun = () => {
    setRightTab('calculator')
    calc.runSource(source, lib.resolveProgramSource)
  }

  const jumpToLine = (line: number) => {
    setRightTab('calculator')
    setGotoRequest({ line, token: Date.now() })
  }
  const jumpAndFocusEditor = (line: number) => {
    setGotoRequest({ line, token: Date.now() })
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>TI-84 BASIC Studio</h1>
        <p>
          A from-scratch TI-BASIC interpreter and calculator-style GUI, scoped to what a{' '}
          <strong>TI-84 Plus / TI-84 Plus Silver Edition</strong> can run.
        </p>
      </header>

      <main className="app-layout">
        <section className="panel panel-programs">
          <ProgramList
            programs={lib.programs}
            activeId={lib.activeId}
            onSelect={lib.setActiveId}
            onCreate={lib.createProgram}
            onRename={lib.renameProgram}
            onDelete={lib.deleteProgram}
            onDuplicate={lib.duplicateProgram}
          />
        </section>

        <section className="panel panel-editor">
          <div className="editor-toolbar">
            <span className="editor-title">{lib.activeProgram ? `prgm${lib.activeProgram.name}` : 'No program selected'}</span>
            <div className="editor-toolbar-actions">
              <button className="btn btn-primary" disabled={!lib.activeProgram || diagnostics.length > 0} onClick={handleRun}>
                ▶ Run
              </button>
              <button className="btn" disabled={calc.status === 'idle' || calc.status === 'done'} onClick={calc.stop}>
                ■ Stop
              </button>
            </div>
          </div>
          {lib.activeProgram ? (
            <ProgramEditor ref={editorRef} source={source} onChange={handleChange} diagnostics={diagnostics} gotoRequest={gotoRequest} />
          ) : (
            <div className="editor-empty">Create a program to get started.</div>
          )}
          <DiagnosticsPanel diagnostics={diagnostics} onJump={jumpAndFocusEditor} />
          <Keypad
            onInsert={(text) => editorRef.current?.insertAtCursor(text)}
            onClear={() => lib.activeProgram && handleChange('')}
            onEnter={() => editorRef.current?.insertAtCursor('\n')}
          />
        </section>

        <section className="panel panel-right">
          <div className="tabs">
            <button className={rightTab === 'calculator' ? 'tab tab-active' : 'tab'} onClick={() => setRightTab('calculator')}>
              Calculator
            </button>
            <button className={rightTab === 'commands' ? 'tab tab-active' : 'tab'} onClick={() => setRightTab('commands')}>
              Commands
            </button>
          </div>
          {rightTab === 'calculator' ? (
            <CalculatorScreen
              screenRows={calc.screenRows}
              status={calc.status}
              pending={calc.pending}
              error={calc.error}
              onResume={calc.resume}
              onGotoErrorLine={jumpToLine}
            />
          ) : (
            <CommandReference onInsert={(text) => editorRef.current?.insertAtCursor(text)} />
          )}
        </section>
      </main>

      <footer className="app-footer">
        <p>
          Scope: TI-84 Plus / TI-84 Plus Silver Edition TI-BASIC only (no matrices, complex numbers, stat plots, or graphing
          commands yet). Angle mode defaults to Degree; switch with the Degree/Radian commands.
        </p>
      </footer>
    </div>
  )
}
