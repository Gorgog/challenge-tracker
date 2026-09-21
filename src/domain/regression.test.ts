import { describe, expect, it } from 'vitest'
import { fitLinear, lag1, tQuantile } from './regression'

const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length
/** Несмещённая дисперсия выборки. */
const variance = (v: number[]) => {
  const m = mean(v)
  return v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)
}

describe('fitLinear', () => {
  it('точно восстанавливает прямую без шума', () => {
    const xs = [0, 1, 2, 3, 4]
    const fit = fitLinear(
      xs.map((x) => [1, x]),
      xs.map((x) => 2 + 3 * x),
    )!
    expect(fit.beta[0]).toBeCloseTo(2, 10)
    expect(fit.beta[1]).toBeCloseTo(3, 10)
    for (const r of fit.residuals) expect(r).toBeCloseTo(0, 10)
  })

  it('восстанавливает два признака сразу', () => {
    const rows = [
      [0, 0], [1, 0], [0, 1], [1, 1], [2, 1], [1, 2],
    ]
    const fit = fitLinear(
      rows.map(([a, b]) => [1, a!, b!]),
      rows.map(([a, b]) => 1 + 2 * a! - b!),
    )!
    expect(fit.beta.map((b) => Number(b.toFixed(8)))).toEqual([1, 2, -1])
  })

  it('один признак 0/1: коэффициент — разность средних, ошибка — как у Уэлча', () => {
    const without = [5, 6, 7]
    const withIt = [7, 8, 9, 10]
    const fit = fitLinear(
      [...without.map(() => [1, 0]), ...withIt.map(() => [1, 1])],
      [...without, ...withIt],
    )!

    expect(fit.beta[1]).toBeCloseTo(mean(withIt) - mean(without), 10)
    const welch = variance(withIt) / withIt.length + variance(without) / without.length
    expect(fit.cov[1]![1]).toBeCloseTo(welch, 10)
  })

  it('постоянный признак не отличить от свободного члена — подгонки нет', () => {
    expect(fitLinear([[1, 1], [1, 1], [1, 1], [1, 1]], [1, 2, 3, 4])).toBeNull()
  })

  it('линейно зависимые признаки — подгонки нет', () => {
    const rows = [[1, 0, 0], [1, 1, 2], [1, 2, 4], [1, 3, 6], [1, 4, 8]]
    expect(fitLinear(rows, [1, 2, 3, 4, 5])).toBeNull()
  })

  it('наблюдений не больше, чем признаков, — подгонки нет', () => {
    expect(fitLinear([[1, 0], [1, 1]], [3, 5])).toBeNull()
  })

  it('наблюдение с полным рычагом делает ошибку неопределённой — подгонки нет', () => {
    // единственный день «с»: его остаток всегда ноль, дисперсия группы не определена
    expect(fitLinear([[1, 0], [1, 0], [1, 0], [1, 1]], [5, 6, 7, 9])).toBeNull()
  })
})

describe('tQuantile', () => {
  /** Двусторонние квантили из стандартных таблиц Стьюдента. */
  const table: [p: number, df: number, t: number][] = [
    [0.975, 3, 3.182], [0.975, 5, 2.571], [0.975, 10, 2.228], [0.975, 30, 2.042], [0.975, 100, 1.984],
    [0.995, 3, 5.841], [0.995, 5, 4.032], [0.995, 10, 3.169], [0.995, 30, 2.75], [0.995, 100, 2.626],
    [0.999, 3, 10.215], [0.999, 5, 5.893], [0.999, 10, 4.144], [0.999, 30, 3.385], [0.999, 100, 3.174],
  ]

  it.each(table)('p = %s, df = %s → %s', (p, df, t) => {
    expect(Math.abs(tQuantile(p, df) - t)).toBeLessThan(0.01)
  })

  it('с ростом степеней свободы приближается к нормальному квантилю', () => {
    expect(tQuantile(0.975, 100_000)).toBeCloseTo(1.96, 2)
  })

  it('строже уровень — шире интервал', () => {
    expect(tQuantile(0.99833, 12)).toBeGreaterThan(tQuantile(0.995, 12))
    expect(tQuantile(0.995, 12)).toBeGreaterThan(tQuantile(0.975, 12))
  })
})

describe('lag1', () => {
  const days = (n: number, from = 1) =>
    Array.from({ length: n }, (_, i) => `2026-09-${String(from + i).padStart(2, '0')}`)

  it('остатки держатся одного знака по несколько дней — автокорреляция положительная', () => {
    const r = lag1([1, 1, 1, -1, -1, -1, 1, 1, 1, -1, -1, -1], days(12))
    expect(r).toBeGreaterThan(0.3)
  })

  it('отрицательная автокорреляция считается нулём — поправка только расширяет ошибку', () => {
    expect(lag1([1, -1, 1, -1, 1, -1, 1, -1], days(8))).toBe(0)
  })

  it('через пропущенный день пара не складывается', () => {
    // 1–3 и 5–7 сентября: внутри троек знак держится, а смена знака приходится на дыру.
    // Склей пары через 4-е — выйдет 0.6 вместо 0.8.
    const keys = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-05', '2026-09-06', '2026-09-07']
    expect(lag1([1, 1, 1, -1, -1, -1], keys)).toBeCloseTo(0.8, 10)
  })

  it('сверху зажата — иначе поправка улетает в бесконечность', () => {
    const r = lag1([1, 1, 1, 1, 1, 1, 1, 1, -1, -1, -1, -1, -1, -1, -1, -1], days(16))
    expect(r).toBeLessThanOrEqual(0.8)
  })

  it('без соседних дней — ноль', () => {
    expect(lag1([1, -1], ['2026-09-01', '2026-09-03'])).toBe(0)
  })
})
