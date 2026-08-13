import { describe, expect, it } from 'vitest'
import * as stats from '../stats'

describe('stats: descriptive', () => {
  it('computes mean, median, stdDev, variance', () => {
    const xs = [2, 4, 4, 4, 5, 5, 7, 9]
    expect(stats.mean(xs)).toBeCloseTo(5)
    expect(stats.stdDev(xs)).toBeCloseTo(2.13809, 4)
    expect(stats.variance(xs)).toBeCloseTo(2.13809 ** 2, 3)
    expect(stats.populationStdDev(xs)).toBeCloseTo(2.0, 4)
  })

  it('computes median for even and odd length lists', () => {
    expect(stats.median([1, 2, 3])).toBe(2)
    expect(stats.median([1, 2, 3, 4])).toBe(2.5)
  })

  it('computes the five-number summary', () => {
    const q = stats.quartiles([...[7, 15, 36, 39, 40, 41]].sort((a, b) => a - b))
    expect(q).toEqual({ min: 7, q1: 15, med: 37.5, q3: 40, max: 41 })
  })

  it('respects a frequency (weight) list', () => {
    // 1 appears 3 times, 2 appears once -> {1,1,1,2}
    const m = stats.mean([1, 2], [3, 1])
    expect(m).toBeCloseTo(1.25)
    expect(stats.sortedExpand([1, 2], [3, 1])).toEqual([1, 1, 1, 2])
  })

  it('rejects an empty list', () => {
    expect(() => stats.mean([])).toThrow()
    expect(() => stats.median([])).toThrow()
  })

  it('requires at least 2 points for stdDev/variance', () => {
    expect(() => stats.stdDev([5])).toThrow()
  })
})

describe('stats: linear regression', () => {
  it('fits a perfect line exactly', () => {
    const xs = [1, 2, 3, 4, 5]
    const ys = xs.map((x) => 3 * x + 1)
    const { a, b, r } = stats.linreg(xs, ys)
    expect(a).toBeCloseTo(3)
    expect(b).toBeCloseTo(1)
    expect(r).toBeCloseTo(1)
  })

  it('fits a noisy but correlated line with |r| close to 1', () => {
    const xs = [1, 2, 3, 4, 5, 6]
    const ys = [2.1, 3.9, 6.2, 7.8, 10.1, 11.9]
    const { a, b, r } = stats.linreg(xs, ys)
    expect(a).toBeCloseTo(2, 0)
    expect(b).toBeCloseTo(0, 0)
    expect(Math.abs(r)).toBeGreaterThan(0.99)
  })

  it('rejects a regression with only one distinct x-value', () => {
    expect(() => stats.linreg([5, 5, 5], [1, 2, 3])).toThrow()
  })
})

describe('stats: normal distribution', () => {
  it('matches known standard-normal CDF values', () => {
    expect(stats.normalCdf01(0)).toBeCloseTo(0.5, 5)
    expect(stats.normalCdf01(1)).toBeCloseTo(0.8413447, 5)
    expect(stats.normalCdf01(-1)).toBeCloseTo(0.1586553, 5)
    expect(stats.normalCdf01(1.96)).toBeCloseTo(0.9750021, 4)
  })

  it('inverts the CDF (round-trips through invNormStd/normalCdf01)', () => {
    for (const p of [0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99]) {
      const z = stats.invNormStd(p)
      expect(stats.normalCdf01(z)).toBeCloseTo(p, 6)
    }
  })

  it('matches a known invNorm value', () => {
    expect(stats.invNormStd(0.975)).toBeCloseTo(1.959964, 3)
  })

  it('rejects an area outside (0,1)', () => {
    expect(() => stats.invNormStd(0)).toThrow()
    expect(() => stats.invNormStd(1)).toThrow()
  })
})
