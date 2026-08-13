import { describe, expect, it } from 'vitest'
import * as c from '../complex'
import { TIError } from '../errors'

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn()
    return undefined
  } catch (err) {
    return err instanceof TIError ? err.code : undefined
  }
}

describe('complex: arithmetic', () => {
  it('adds and subtracts', () => {
    expect(c.add({ re: 1, im: 2 }, { re: 3, im: -1 })).toEqual({ re: 4, im: 1 })
    expect(c.sub({ re: 1, im: 2 }, { re: 3, im: -1 })).toEqual({ re: -2, im: 3 })
  })

  it('multiplies, matching i*i = -1', () => {
    expect(c.mul({ re: 0, im: 1 }, { re: 0, im: 1 })).toEqual({ re: -1, im: 0 })
    expect(c.mul({ re: 2, im: 3 }, { re: 4, im: -5 })).toEqual({ re: 23, im: 2 })
  })

  it('divides, matching 1/i = -i', () => {
    const r = c.div({ re: 1, im: 0 }, { re: 0, im: 1 })
    expect(r.re).toBeCloseTo(0)
    expect(r.im).toBeCloseTo(-1)
  })

  it('throws ERR:DIVIDE BY 0 for division by zero', () => {
    expect(errorCode(() => c.div({ re: 1, im: 1 }, { re: 0, im: 0 }))).toBe('ERR:DIVIDE BY 0')
  })

  it('negates and conjugates', () => {
    expect(c.neg({ re: 3, im: -4 })).toEqual({ re: -3, im: 4 })
    expect(c.conj({ re: 3, im: -4 })).toEqual({ re: 3, im: 4 })
  })
})

describe('complex: magnitude and angle', () => {
  it('computes |a| via the 3-4-5 triangle', () => {
    expect(c.abs({ re: 3, im: 4 })).toBeCloseTo(5)
  })

  it('computes the principal angle in radians', () => {
    expect(c.angle({ re: 1, im: 0 })).toBeCloseTo(0)
    expect(c.angle({ re: 0, im: 1 })).toBeCloseTo(Math.PI / 2)
    expect(c.angle({ re: -1, im: 0 })).toBeCloseTo(Math.PI)
  })

  it('round-trips through fromPolar', () => {
    const original = { re: 3, im: -4 }
    const r = c.abs(original)
    const theta = c.angle(original)
    const back = c.fromPolar(r, theta)
    expect(back.re).toBeCloseTo(original.re)
    expect(back.im).toBeCloseTo(original.im)
  })
})

describe('complex: exp/log/pow', () => {
  it('computes e^(iπ) = -1 (Euler\'s identity)', () => {
    const r = c.exp({ re: 0, im: Math.PI })
    expect(r.re).toBeCloseTo(-1)
    expect(r.im).toBeCloseTo(0)
  })

  it('round-trips exp(log(a)) = a for a nonzero complex number', () => {
    const a = { re: 2, im: 3 }
    const back = c.exp(c.log(a))
    expect(back.re).toBeCloseTo(a.re)
    expect(back.im).toBeCloseTo(a.im)
  })

  it('throws ERR:DOMAIN for log(0)', () => {
    expect(errorCode(() => c.log({ re: 0, im: 0 }))).toBe('ERR:DOMAIN')
  })

  it('computes i^2 = -1 via pow', () => {
    const r = c.pow({ re: 0, im: 1 }, { re: 2, im: 0 })
    expect(r.re).toBeCloseTo(-1)
    expect(r.im).toBeCloseTo(0)
  })

  it('computes the principal cube root of a negative real via pow(a, 1/3)', () => {
    // (-8)^(1/3) principal value is 1+i√3, not the real root -2.
    const r = c.pow({ re: -8, im: 0 }, { re: 1 / 3, im: 0 })
    expect(r.re).toBeCloseTo(1)
    expect(r.im).toBeCloseTo(Math.sqrt(3))
  })

  it('handles 0^positive = 0 and 0^0 = 1', () => {
    expect(c.pow({ re: 0, im: 0 }, { re: 2, im: 0 })).toEqual({ re: 0, im: 0 })
    expect(c.pow({ re: 0, im: 0 }, { re: 0, im: 0 })).toEqual({ re: 1, im: 0 })
  })

  it('throws ERR:DIVIDE BY 0 for 0 raised to a negative power', () => {
    expect(errorCode(() => c.pow({ re: 0, im: 0 }, { re: -1, im: 0 }))).toBe('ERR:DIVIDE BY 0')
  })
})
