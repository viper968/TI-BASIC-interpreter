import { describe, expect, it } from 'vitest'
import { run } from './helpers'

describe('vm: arithmetic and Disp', () => {
  it('runs a Disp of a literal', () => {
    const r = run('Disp "HELLO"')
    expect(r.error).toBeNull()
    expect(r.screenText.split('\n')[0]).toBe('HELLO')
  })

  it('stores and reads back a variable', () => {
    const r = run('5->A\nDisp A')
    expect(r.error).toBeNull()
    expect(r.state.vars.A).toBe(5)
    expect(r.screenText.split('\n')[0]).toBe('5')
  })

  it('auto-displays a bare trailing expression, like the real calculator', () => {
    const r = run('2+3')
    expect(r.error).toBeNull()
    expect(r.screenText.split('\n')[0]).toBe('5')
  })

  it('does not auto-display a bare expression that is not the last statement', () => {
    const r = run('2+3\nDisp "X"')
    expect(r.error).toBeNull()
    expect(r.screenText.split('\n')[0]).toBe('X')
    expect(r.state.ans).toEqual({ kind: 'number', value: 5 })
  })
})

describe('vm: control flow', () => {
  it('sums 1..5 with a For( loop', () => {
    const r = run('0->S\nFor(I,1,5)\nS+I->S\nEnd\nDisp S')
    expect(r.error).toBeNull()
    expect(r.state.vars.S).toBe(15)
  })

  it('does not run a For( body when the range is already exhausted', () => {
    const r = run('0->N\nFor(I,5,1)\nN+1->N\nEnd\nDisp N')
    expect(r.error).toBeNull()
    expect(r.state.vars.N).toBe(0)
  })

  it('counts down with a negative step into a real variable', () => {
    const r = run('0->C\nFor(I,3,1,-1)\nC+1->C\nEnd\nDisp C')
    expect(r.error).toBeNull()
    expect(r.state.vars.C).toBe(3)
  })

  it('runs a While loop', () => {
    const r = run('0->I\nWhile I<5\nI+1->I\nEnd\nDisp I')
    expect(r.error).toBeNull()
    expect(r.state.vars.I).toBe(5)
  })

  it('runs a Repeat loop (checks condition after the body, at least once)', () => {
    const r = run('0->I\nRepeat I>=1\nI+1->I\nEnd\nDisp I')
    expect(r.error).toBeNull()
    expect(r.state.vars.I).toBe(1)
  })

  it('runs the Then branch of a block If', () => {
    const r = run('1->A\nIf A=1\nThen\nDisp "YES"\nElse\nDisp "NO"\nEnd')
    expect(r.error).toBeNull()
    expect(r.screenText.split('\n')[0]).toBe('YES')
  })

  it('runs the Else branch of a block If', () => {
    const r = run('0->A\nIf A=1\nThen\nDisp "YES"\nElse\nDisp "NO"\nEnd')
    expect(r.error).toBeNull()
    expect(r.screenText.split('\n')[0]).toBe('NO')
  })

  it('runs a single-line If only when true', () => {
    const yes = run('1->A\nIf A=1\nDisp "YES"\nDisp "ALWAYS"')
    expect(yes.screenText.split('\n').slice(0, 2)).toEqual(['YES', 'ALWAYS'])

    const no = run('0->A\nIf A=1\nDisp "YES"\nDisp "ALWAYS"')
    expect(no.screenText.split('\n')[0]).toBe('ALWAYS')
  })

  it('jumps with Goto/Lbl', () => {
    const r = run('0->A\nGoto SK\nA+1->A\nLbl SK\nA+2->A\nDisp A')
    expect(r.error).toBeNull()
    expect(r.state.vars.A).toBe(2)
  })

  it('loops with IS>( until the bound is exceeded', () => {
    const r = run('0->A\nLbl LP\nIS>(A,3)\nGoto LP\nDisp A')
    expect(r.error).toBeNull()
    expect(r.state.vars.A).toBe(4)
  })
})

describe('vm: lists and strings', () => {
  it('builds a list from a {…} literal', () => {
    const r = run('{1,2,3}->L1\nDisp L1(2)')
    expect(r.error).toBeNull()
    expect(r.state.lists.L1).toEqual([1, 2, 3])
    expect(r.screenText.split('\n')[0]).toBe('2')
  })

  it('evaluates expressions inside a {…} literal', () => {
    const r = run('5->X\n{1,X,X+1}->L1')
    expect(r.error).toBeNull()
    expect(r.state.lists.L1).toEqual([1, 5, 6])
  })

  it('rejects a non-numeric element in a {…} literal', () => {
    const r = run('{1,"A",3}->L1')
    expect(r.error?.code).toBe('ERR:DATA TYPE')
  })

  it('builds a list with element assignment, growing one slot at a time', () => {
    const r = run('1->L1(1)\n2->L1(2)\n3->L1(3)\nDisp dim(L1)\nDisp sum(L1)')
    expect(r.error).toBeNull()
    expect(r.state.lists.L1).toEqual([1, 2, 3])
    expect(r.screenText.split('\n')[0]).toBe('3')
    expect(r.screenText.split('\n')[1]).toBe('6')
  })

  it('rejects a list index that skips past the end', () => {
    const r = run('5->L1(3)')
    expect(r.error).not.toBeNull()
    expect(r.error?.code).toBe('ERR:INVALID DIM')
  })

  it('builds a list with seq(', () => {
    const r = run('seq(I^2,I,1,4)->L1\nDisp L1(4)')
    expect(r.error).toBeNull()
    expect(r.state.lists.L1).toEqual([1, 4, 9, 16])
  })

  it('concatenates strings with +', () => {
    const r = run('"AB"+"CD"->Str1\nDisp Str1')
    expect(r.error).toBeNull()
    expect(r.state.strVars.Str1).toBe('ABCD')
  })
})

describe('vm: angle mode and trig', () => {
  it('defaults to degrees', () => {
    const r = run('sin(90)')
    expect(r.error).toBeNull()
    expect(r.state.ans).toEqual({ kind: 'number', value: 1 })
  })

  it('switches to radians with the Radian command', () => {
    const r = run('Radian\nsin(0)')
    expect(r.error).toBeNull()
    expect(r.state.angleMode).toBe('radian')
  })
})

describe('vm: display modes', () => {
  it('Fix n forces a fixed number of decimal places', () => {
    const r = run('Fix 2\nDisp 5\nDisp 3.14159')
    expect(r.error).toBeNull()
    expect(r.screenText.split('\n').slice(0, 2)).toEqual(['5.00', '3.14'])
    expect(r.state.fixedDecimals).toBe(2)
  })

  it('Float restores automatic precision', () => {
    const r = run('Fix 2\nFloat\nDisp 3.14159')
    expect(r.error).toBeNull()
    expect(r.screenText.split('\n')[0]).toBe('3.14159')
  })

  it('Sci forces scientific notation', () => {
    const r = run('Sci\nDisp 1234')
    expect(r.error).toBeNull()
    expect(r.screenText.split('\n')[0]).toBe('1.234E3')
  })

  it('Eng forces an exponent that is a multiple of 3', () => {
    const r = run('Eng\nDisp 1234')
    expect(r.error).toBeNull()
    expect(r.screenText.split('\n')[0]).toBe('1.234E3')
    const r2 = run('Eng\nDisp 12340')
    expect(r2.screenText.split('\n')[0]).toBe('12.34E3')
  })

  it('►Frac shows a fraction and ►Dec round-trips back', () => {
    const r = run('Disp .5►Frac\nDisp (.5►Frac)►Dec')
    expect(r.error).toBeNull()
    expect(r.screenText.split('\n')[0]).toBe('1/2')
    expect(r.screenText.split('\n')[1]).toBe('.5')
  })

  it('►Frac leaves a non-"nice" decimal alone instead of showing a misleading fraction', () => {
    const r = run('Disp π►Frac')
    expect(r.error).toBeNull()
    expect(r.screenText.split('\n')[0]).not.toContain('/')
  })
})

describe('vm: errors', () => {
  it('raises ERR:DIVIDE BY 0', () => {
    const r = run('1/0')
    expect(r.error?.code).toBe('ERR:DIVIDE BY 0')
  })

  it('raises ERR:DATA TYPE when storing a string into a numeric variable', () => {
    const r = run('"HI"->A')
    expect(r.error?.code).toBe('ERR:DATA TYPE')
  })

  it('raises ERR:DOMAIN for √( of a negative number', () => {
    const r = run('√(-1)')
    expect(r.error?.code).toBe('ERR:DOMAIN')
  })

  it('attaches the offending line number to runtime errors', () => {
    const r = run('Disp "OK"\n1/0')
    expect(r.error?.line).toBe(2)
  })
})

describe('vm: interactive I/O', () => {
  it('pauses for Input and evaluates the typed expression', () => {
    const r = run('Input "N?",N\nDisp N*2', ['21'])
    expect(r.error).toBeNull()
    expect(r.state.vars.N).toBe(21)
    expect(r.screenText.split('\n')[0]).toBe('42')
  })

  it('reads multiple variables with Prompt', () => {
    const r = run('Prompt A,B\nDisp A+B', [3, 4])
    expect(r.error).toBeNull()
    expect(r.state.vars.A).toBe(3)
    expect(r.state.vars.B).toBe(4)
  })

  it('re-prompts Input on unparseable text instead of ending the program', () => {
    const r = run('Input "N?",N\nDisp N', ['(1+2', '7'])
    expect(r.error).toBeNull()
    expect(r.state.vars.N).toBe(7)
    const inputEvents = r.events.filter((e) => e.type === 'input')
    expect(inputEvents).toHaveLength(2)
    expect(inputEvents[0]).toMatchObject({ invalid: false })
    expect(inputEvents[1]).toMatchObject({ invalid: true })
  })

  it('re-prompts Prompt on unparseable text too', () => {
    const r = run('Prompt A', ['???', '9'])
    expect(r.error).toBeNull()
    expect(r.state.vars.A).toBe(9)
  })

  it('still ends the program on a runtime error inside otherwise-valid Input text', () => {
    const r = run('Input "N?",N\nDisp N', ['1/0'])
    expect(r.error?.code).toBe('ERR:DIVIDE BY 0')
  })

  it('pauses on Pause and resumes', () => {
    const r = run('Disp "BEFORE"\nPause\nDisp "AFTER"', [undefined])
    expect(r.error).toBeNull()
    expect(r.events.some((e) => e.type === 'pause')).toBe(true)
    expect(r.screenText).toContain('AFTER')
  })

  it('jumps via Menu( to the chosen label', () => {
    const r = run('Menu("PICK","ONE",A,"TWO",B)\nLbl A\nDisp "GOT A"\nGoto DN\nLbl B\nDisp "GOT B"\nLbl DN', [2])
    expect(r.error).toBeNull()
    expect(r.screenText.split('\n')[0]).toBe('GOT B')
  })
})

describe('vm: sub-programs', () => {
  it('calls another program with prgmNAME and returns', () => {
    const r = run('Disp "START"\nprgmHELPER\nDisp "END"', [], (name) =>
      name === 'HELPER' ? 'Disp "IN HELPER"' : undefined,
    )
    expect(r.error).toBeNull()
    expect(r.screenText.split('\n').slice(0, 3)).toEqual(['START', 'IN HELPER', 'END'])
  })

  it('raises ERR:UNDEFINED for a missing program', () => {
    const r = run('prgmNOPE')
    expect(r.error?.code).toBe('ERR:UNDEFINED')
  })
})

describe('vm: matrices', () => {
  it('builds a matrix from a literal and reads elements back', () => {
    const r = run('[[1,2,3][4,5,6]]->[A]\nDisp [A](2,3)')
    expect(r.error).toBeNull()
    expect(r.state.matrices.A).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ])
    expect(r.screenText.split('\n')[0]).toBe('6')
  })

  it('evaluates expressions inside a matrix literal', () => {
    const r = run('5->X\n[[X,X+1][0,0]]->[A]')
    expect(r.error).toBeNull()
    expect(r.state.matrices.A).toEqual([
      [5, 6],
      [0, 0],
    ])
  })

  it('rejects a matrix index that is out of range', () => {
    const r = run('[[1,2][3,4]]->[A]\nDisp [A](3,1)')
    expect(r.error?.code).toBe('ERR:INVALID DIM')
  })

  it('assigns a single matrix element', () => {
    const r = run('[[1,2][3,4]]->[A]\n9->[A](1,1)\nDisp [A](1,1)')
    expect(r.error).toBeNull()
    expect(r.state.matrices.A[0][0]).toBe(9)
  })

  it('adds and subtracts same-size matrices', () => {
    const r = run('[[1,2][3,4]]->[A]\n[[10,10][10,10]]->[B]\n[A]+[B]->[C]\n[B]-[A]->[D]')
    expect(r.error).toBeNull()
    expect(r.state.matrices.C).toEqual([
      [11, 12],
      [13, 14],
    ])
    expect(r.state.matrices.D).toEqual([
      [9, 8],
      [7, 6],
    ])
  })

  it('rejects adding matrices of different sizes', () => {
    const r = run('[[1,2]]->[A]\n[[1,2,3]]->[B]\n[A]+[B]')
    expect(r.error?.code).toBe('ERR:DIM MISMATCH')
  })

  it('multiplies matrices, and scales by a scalar on either side', () => {
    const r = run('[[1,2][3,4]]->[A]\n[[5,6][7,8]]->[B]\n[A]*[B]->[C]\n2[A]->[D]\n[A]*2->[E]')
    expect(r.error).toBeNull()
    // [[1,2][3,4]] * [[5,6][7,8]] = [[19,22][43,50]]
    expect(r.state.matrices.C).toEqual([
      [19, 22],
      [43, 50],
    ])
    expect(r.state.matrices.D).toEqual([
      [2, 4],
      [6, 8],
    ])
    expect(r.state.matrices.E).toEqual([
      [2, 4],
      [6, 8],
    ])
  })

  it('divides a matrix by a scalar', () => {
    const r = run('[[2,4][6,8]]->[A]\n[A]/2->[B]')
    expect(r.error).toBeNull()
    expect(r.state.matrices.B).toEqual([
      [1, 2],
      [3, 4],
    ])
  })

  it('inverts a matrix with ⁻¹ and with ^-1', () => {
    const r = run('[[4,7][2,6]]->[A]\n[A]⁻¹->[B]\n[A]^-1->[C]')
    expect(r.error).toBeNull()
    // det = 24-14=10; inverse = 1/10 * [[6,-7][-2,4]]
    expect(r.state.matrices.B[0][0]).toBeCloseTo(0.6)
    expect(r.state.matrices.B[0][1]).toBeCloseTo(-0.7)
    expect(r.state.matrices.B[1][0]).toBeCloseTo(-0.2)
    expect(r.state.matrices.B[1][1]).toBeCloseTo(0.4)
    expect(r.state.matrices.C).toEqual(r.state.matrices.B)
  })

  it('raises ERR:SINGULAR MAT when inverting a singular matrix', () => {
    const r = run('[[1,2][2,4]]->[A]\nDisp [A]⁻¹')
    expect(r.error?.code).toBe('ERR:SINGULAR MAT')
  })

  it('squares a matrix with ² and raises it to an integer power with ^', () => {
    const r = run('[[1,1][0,1]]->[A]\n[A]²->[B]\n[A]^3->[C]')
    expect(r.error).toBeNull()
    expect(r.state.matrices.B).toEqual([
      [1, 2],
      [0, 1],
    ])
    expect(r.state.matrices.C).toEqual([
      [1, 3],
      [0, 1],
    ])
  })

  it('computes det( and Transpose(', () => {
    const r = run('[[1,2][3,4]]->[A]\ndet([A])->D\nTranspose([A])->[B]')
    expect(r.error).toBeNull()
    expect(r.state.vars.D).toBe(-2)
    expect(r.state.matrices.B).toEqual([
      [1, 3],
      [2, 4],
    ])
  })

  it('builds identity( and randM( matrices', () => {
    const r = run('identity(3)->[A]\nrandM(2,3)->[B]')
    expect(r.error).toBeNull()
    expect(r.state.matrices.A).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ])
    expect(r.state.matrices.B).toHaveLength(2)
    expect(r.state.matrices.B[0]).toHaveLength(3)
  })

  it('augments two matrices side by side', () => {
    const r = run('[[1,2][3,4]]->[A]\n[[9][9]]->[B]\naugment([A],[B])->[C]')
    expect(r.error).toBeNull()
    expect(r.state.matrices.C).toEqual([
      [1, 2, 9],
      [3, 4, 9],
    ])
  })

  it('solves a system of equations with rref(', () => {
    // 2x + y = 5, x - y = 1  =>  x=2, y=1
    const r = run('[[2,1,5][1,-1,1]]->[A]\nrref([A])->[B]')
    expect(r.error).toBeNull()
    expect(r.state.matrices.B[0][2]).toBeCloseTo(2)
    expect(r.state.matrices.B[1][2]).toBeCloseTo(1)
  })

  it('performs manual row operations', () => {
    const r = run(
      [
        '[[1,2][3,4]]->[A]',
        'rowSwap([A],1,2)->[B]',
        'row+([A],1,2)->[C]',
        '*row(2,[A],1)->[D]',
        '*row+(2,[A],1,2)->[E]',
      ].join('\n'),
    )
    expect(r.error).toBeNull()
    expect(r.state.matrices.B).toEqual([
      [3, 4],
      [1, 2],
    ])
    expect(r.state.matrices.C).toEqual([
      [1, 2],
      [4, 6],
    ])
    expect(r.state.matrices.D).toEqual([
      [2, 4],
      [3, 4],
    ])
    expect(r.state.matrices.E).toEqual([
      [1, 2],
      [5, 8],
    ])
  })

  it('reads and resizes dimensions with dim(', () => {
    const r = run('[[1,2,3][4,5,6]]->[A]\nDisp dim([A])\n{4,5}->dim([B])\nDisp dim([B])')
    expect(r.error).toBeNull()
    expect(r.state.matrices.B).toHaveLength(4)
    expect(r.state.matrices.B[0]).toHaveLength(5)
    expect(r.screenText.split('\n')[0]).toBe('{2 3}')
    expect(r.screenText.split('\n')[1]).toBe('{4 5}')
  })

  it('resizes a list with {n}->dim(L1), preserving existing values', () => {
    const r = run('1->L1(1)\n2->L1(2)\n{4}->dim(L1)\nDisp dim(L1)')
    expect(r.error).toBeNull()
    expect(r.state.lists.L1).toEqual([1, 2, 0, 0])
    expect(r.screenText.split('\n')[0]).toBe('4')
  })

  it('Fill(s a list and a matrix that already have a size', () => {
    const r = run('{3}->dim(L1)\nFill(7,L1)\n{2,2}->dim([A])\nFill(9,[A])')
    expect(r.error).toBeNull()
    expect(r.state.lists.L1).toEqual([7, 7, 7])
    expect(r.state.matrices.A).toEqual([
      [9, 9],
      [9, 9],
    ])
  })

  it('rejects Fill( on a matrix that has no dimension yet', () => {
    const r = run('Fill(1,[A])')
    expect(r.error?.code).toBe('ERR:INVALID DIM')
  })

  it('deletes a matrix with DelVar', () => {
    const r = run('[[1,2][3,4]]->[A]\nDelVar [A]\nDisp dim([A])')
    expect(r.error).toBeNull()
    expect(r.state.matrices.A).toEqual([])
  })

  it('Disp of a matrix renders one line per row', () => {
    const r = run('[[1,2][3,4]]->[A]\nDisp [A]')
    expect(r.error).toBeNull()
    expect(r.screenText.split('\n').slice(0, 2)).toEqual(['[[1 2]', ' [3 4]]'])
  })

  it('rejects Output( of a matrix', () => {
    const r = run('[[1,2][3,4]]->[A]\nOutput(1,1,[A])')
    expect(r.error?.code).toBe('ERR:DATA TYPE')
  })

  it('rejects mixing a matrix with a list or number where it makes no sense', () => {
    const r = run('[[1,2][3,4]]->[A]\n[A]<5')
    expect(r.error?.code).toBe('ERR:DATA TYPE')
  })
})
