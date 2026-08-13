import { TIError } from './errors'

/**
 * Statistics math, kept independent of the `Value`/VM machinery (mirrors
 * `matrix.ts`): every function here takes plain `number[]` and either
 * succeeds or throws a `TIError`. `vm.ts` and `builtins.ts` are the only
 * callers.
 *
 * Functions that accept an optional `weights` array treat it as a
 * frequency list (one non-negative count per data point) — the same
 * optional "Freqlist" argument `1-Var Stats`, `2-Var Stats`, `mean(`, etc.
 * take on-calculator. Omit it for an unweighted (frequency-1) sample.
 */

function totalWeight(xs: number[], weights?: number[]): number {
  return weights ? weights.reduce((a, b) => a + b, 0) : xs.length
}

function requireNonEmpty(n: number, what: string) {
  if (n <= 0) throw new TIError('ERR:DOMAIN', `${what} has no data`)
}

export function sumWeighted(xs: number[], weights?: number[]): number {
  if (!weights) return xs.reduce((a, b) => a + b, 0)
  return xs.reduce((acc, x, i) => acc + x * weights[i], 0)
}

export function mean(xs: number[], weights?: number[]): number {
  const n = totalWeight(xs, weights)
  requireNonEmpty(n, 'mean(')
  return sumWeighted(xs, weights) / n
}

/** Expands a list by its frequencies (each x repeated round(weight) times) and sorts it. */
export function sortedExpand(xs: number[], weights?: number[]): number[] {
  if (!weights) return [...xs].sort((a, b) => a - b)
  const out: number[] = []
  xs.forEach((x, i) => {
    for (let k = 0; k < Math.round(weights[i]); k++) out.push(x)
  })
  return out.sort((a, b) => a - b)
}

export function medianOfSorted(sorted: number[]): number {
  requireNonEmpty(sorted.length, 'median(')
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function median(xs: number[]): number {
  return medianOfSorted([...xs].sort((a, b) => a - b))
}

export interface Quartiles {
  min: number
  q1: number
  med: number
  q3: number
  max: number
}

/** The five-number summary, via the median-of-halves method (excluding the overall median when n is odd). */
export function quartiles(sorted: number[]): Quartiles {
  requireNonEmpty(sorted.length, '1-Var Stats')
  const n = sorted.length
  const med = medianOfSorted(sorted)
  const lower = sorted.slice(0, Math.floor(n / 2))
  const upper = sorted.slice(Math.ceil(n / 2))
  return { min: sorted[0], q1: medianOfSorted(lower), med, q3: medianOfSorted(upper), max: sorted[n - 1] }
}

export function minMax(xs: number[], weights?: number[]): [min: number, max: number] {
  const active = weights ? xs.filter((_, i) => weights[i] > 0) : xs
  requireNonEmpty(active.length, 'min/max')
  return [Math.min(...active), Math.max(...active)]
}

/** Sample variance (Sx²: divides by n-1). */
export function variance(xs: number[], weights?: number[]): number {
  const n = totalWeight(xs, weights)
  if (n < 2) throw new TIError('ERR:DOMAIN', 'stdDev(/variance( need at least 2 data points')
  const m = mean(xs, weights)
  const ss = xs.reduce((acc, x, i) => acc + (weights ? weights[i] : 1) * (x - m) ** 2, 0)
  return ss / (n - 1)
}

export function stdDev(xs: number[], weights?: number[]): number {
  return Math.sqrt(variance(xs, weights))
}

/** Population variance (σx²: divides by n). */
export function populationVariance(xs: number[], weights?: number[]): number {
  const n = totalWeight(xs, weights)
  requireNonEmpty(n, 'σx')
  const m = mean(xs, weights)
  const ss = xs.reduce((acc, x, i) => acc + (weights ? weights[i] : 1) * (x - m) ** 2, 0)
  return ss / n
}

export function populationStdDev(xs: number[], weights?: number[]): number {
  return Math.sqrt(populationVariance(xs, weights))
}

export interface LinRegResult {
  a: number
  b: number
  r: number
}

/** Weighted least-squares fit of y = a*x + b, plus the correlation coefficient r. */
export function linreg(xs: number[], ys: number[], weights?: number[]): LinRegResult {
  const n = totalWeight(xs, weights)
  if (n < 2) throw new TIError('ERR:DOMAIN', 'LinReg needs at least 2 data points')
  const mx = mean(xs, weights)
  const my = mean(ys, weights)
  let sxy = 0
  let sxx = 0
  let syy = 0
  xs.forEach((x, i) => {
    const w = weights ? weights[i] : 1
    sxy += w * (x - mx) * (ys[i] - my)
    sxx += w * (x - mx) ** 2
    syy += w * (ys[i] - my) ** 2
  })
  if (sxx === 0) throw new TIError('ERR:DOMAIN', 'LinReg requires more than one distinct x-value')
  const a = sxy / sxx
  const b = my - a * mx
  const r = syy === 0 ? (a === 0 ? 1 : 0) : sxy / Math.sqrt(sxx * syy)
  return { a, b, r }
}

// ---- Normal distribution ---------------------------------------------------

/** Abramowitz & Stegun 7.1.26 rational approximation of erf, max error ~1.5e-7. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x)
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911
  const t = 1 / (1 + p * ax)
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax)
  return sign * y
}

/** Standard normal CDF, Φ(z). */
export function normalCdf01(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2))
}

function standardNormalPdf(z: number): number {
  return Math.exp(-(z * z) / 2) / Math.sqrt(2 * Math.PI)
}

/** Inverse standard normal CDF, Φ⁻¹(p), via Newton-Raphson refinement of a rough initial guess. */
export function invNormStd(p: number): number {
  if (p <= 0 || p >= 1) throw new TIError('ERR:DOMAIN', 'invNorm( requires 0 < area < 1')
  let x = Math.sign(p - 0.5) * Math.sqrt(-2 * Math.log(Math.min(p, 1 - p)))
  for (let i = 0; i < 50; i++) {
    const pdf = standardNormalPdf(x)
    if (pdf < 1e-300) break
    const dx = (normalCdf01(x) - p) / pdf
    x -= dx
    if (Math.abs(dx) < 1e-12) break
  }
  return x
}
