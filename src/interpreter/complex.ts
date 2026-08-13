/**
 * Complex number arithmetic, kept independent of the VM (mirrors
 * matrix.ts/stats.ts/graph.ts): every function here is a plain operation on
 * a {re,im} pair that either succeeds or throws a `TIError`. `vm.ts` is the
 * only caller — it decides *when* a result is allowed to be complex (based
 * on the calculator's Real/a+bi/re^θi mode); this module just does the math.
 */

import { TIError } from './errors'

export interface Complex {
  re: number
  im: number
}

export function add(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im }
}

export function sub(a: Complex, b: Complex): Complex {
  return { re: a.re - b.re, im: a.im - b.im }
}

export function mul(a: Complex, b: Complex): Complex {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }
}

export function div(a: Complex, b: Complex): Complex {
  if (b.re === 0 && b.im === 0) throw new TIError('ERR:DIVIDE BY 0', 'Cannot divide by 0')
  const denom = b.re * b.re + b.im * b.im
  return { re: (a.re * b.re + a.im * b.im) / denom, im: (a.im * b.re - a.re * b.im) / denom }
}

export function neg(a: Complex): Complex {
  return { re: -a.re, im: -a.im }
}

export function conj(a: Complex): Complex {
  return { re: a.re, im: -a.im }
}

/** Magnitude |a|. */
export function abs(a: Complex): number {
  return Math.hypot(a.re, a.im)
}

/** Principal argument of a, in radians, in (-π, π]. */
export function angle(a: Complex): number {
  return Math.atan2(a.im, a.re)
}

export function isZero(a: Complex): boolean {
  return a.re === 0 && a.im === 0
}

export function fromPolar(r: number, theta: number): Complex {
  return { re: r * Math.cos(theta), im: r * Math.sin(theta) }
}

/** e^a for complex a. */
export function exp(a: Complex): Complex {
  const r = Math.exp(a.re)
  return { re: r * Math.cos(a.im), im: r * Math.sin(a.im) }
}

/** The principal natural logarithm of a nonzero complex number. */
export function log(a: Complex): Complex {
  if (isZero(a)) throw new TIError('ERR:DOMAIN', 'ln(/log( of 0 is undefined')
  return { re: Math.log(abs(a)), im: angle(a) }
}

/**
 * The principal value of a^b for complex a,b, via a^b = e^(b·ln(a)). This
 * one formula covers every case the VM needs (real^fractional with a
 * negative base, complex^integer, complex^complex, ...) instead of a
 * separate code path per case.
 */
export function pow(a: Complex, b: Complex): Complex {
  if (isZero(a)) {
    if (b.re === 0 && b.im === 0) return { re: 1, im: 0 } // 0^0, matching Math.pow(0,0)
    if (b.re > 0) return { re: 0, im: 0 }
    throw new TIError('ERR:DIVIDE BY 0', '0 cannot be raised to a negative power')
  }
  return exp(mul(b, log(a)))
}
