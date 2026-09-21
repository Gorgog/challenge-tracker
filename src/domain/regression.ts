import { addDays, dayKey, parseDay } from './date'

/**
 * Линейная регрессия и всё, что нужно, чтобы честно сказать «уверенно» или «похоже»:
 * ошибка, устойчивая к неравным дисперсиям групп (HC2), квантили Стьюдента и автокорреляция
 * соседних дней. Без библиотек — матрицы здесь не больше 6×6.
 */

export type Fit = {
  beta: number[]
  /** Ковариация оценок β по HC2: для одного признака 0/1 совпадает с дисперсией Уэлча. */
  cov: number[][]
  residuals: number[]
}

const multiply = (a: number[][], b: number[][]) =>
  a.map((row) => b[0]!.map((_, j) => row.reduce((s, v, k) => s + v * b[k]![j]!, 0)))

/** Обратная матрица методом Гаусса — Жордана; null, если матрица вырождена. */
function invert(m: number[][]): number[][] | null {
  const n = m.length
  const a = m.map((row, i) => [...row, ...row.map((_, j) => (i === j ? 1 : 0))])
  const scale = Math.max(1, ...m.flat().map(Math.abs))

  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) pivot = r
    }
    if (Math.abs(a[pivot]![col]!) < 1e-9 * scale) return null
    ;[a[col], a[pivot]] = [a[pivot]!, a[col]!]

    const lead = a[col]!
    const p = lead[col]!
    for (let j = 0; j < 2 * n; j++) lead[j] = lead[j]! / p
    for (let r = 0; r < n; r++) {
      const row = a[r]!
      const f = row[col]!
      if (r === col || f === 0) continue
      for (let j = 0; j < 2 * n; j++) row[j] = row[j]! - f * lead[j]!
    }
  }
  return a.map((row) => row.slice(n))
}

/**
 * МНК `y = Xβ` с ковариацией HC2. Строки `x` — наблюдения, первый столбец обычно единица.
 * null — если признаков не меньше, чем наблюдений, если XᵀX вырождена (признак постоянный
 * или повторяет другие) или если у наблюдения полный рычаг: например, в группе один день,
 * и разброс внутри неё не определён.
 */
export function fitLinear(x: number[][], y: number[]): Fit | null {
  const n = x.length
  const k = x[0]?.length ?? 0
  if (k === 0 || n <= k) return null

  const xtx = Array.from({ length: k }, (_, i) =>
    Array.from({ length: k }, (_, j) => x.reduce((s, row) => s + row[i]! * row[j]!, 0)),
  )
  const inv = invert(xtx)
  if (!inv) return null

  const xty = Array.from({ length: k }, (_, i) => x.reduce((s, row, r) => s + row[i]! * y[r]!, 0))
  const beta = inv.map((row) => row.reduce((s, v, j) => s + v * xty[j]!, 0))
  const residuals = x.map((row, r) => y[r]! - row.reduce((s, v, j) => s + v * beta[j]!, 0))

  /* HC2: середина «сэндвича» — Σ xᵢxᵢᵀ · eᵢ² / (1 − hᵢᵢ), где hᵢᵢ — рычаг наблюдения. */
  const meat = Array.from({ length: k }, () => new Array<number>(k).fill(0))
  for (let r = 0; r < n; r++) {
    const row = x[r]!
    const leverage = inv.reduce(
      (s, invRow, i) => s + row[i]! * invRow.reduce((t, v, j) => t + v * row[j]!, 0),
      0,
    )
    if (leverage > 1 - 1e-9) return null
    const w = residuals[r]! ** 2 / (1 - leverage)
    for (let i = 0; i < k; i++) {
      const out = meat[i]!
      for (let j = 0; j < k; j++) out[j] = out[j]! + row[i]! * row[j]! * w
    }
  }

  return { beta, cov: multiply(multiply(inv, meat), inv), residuals }
}

/** ln Γ(x) — приближение Ланцоша (g = 7), точность около 1e-15. */
function lnGamma(x: number): number {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ]
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x)
  const z = x - 1
  let a = c[0]!
  for (let i = 1; i < c.length; i++) a += c[i]! / (z + i)
  const t = z + 7.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a)
}

/** Цепная дробь для неполной бета-функции (метод Ленца). */
function betaFraction(a: number, b: number, x: number): number {
  const tiny = 1e-300
  let c = 1
  let d = 1 - ((a + b) * x) / (a + 1)
  if (Math.abs(d) < tiny) d = tiny
  d = 1 / d
  let h = d
  for (let m = 1; m <= 2000; m++) {
    const m2 = 2 * m
    const even = (m * (b - m) * x) / ((a - 1 + m2) * (a + m2))
    d = 1 + even * d
    if (Math.abs(d) < tiny) d = tiny
    c = 1 + even / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    h *= d * c
    const odd = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + 1 + m2))
    d = 1 + odd * d
    if (Math.abs(d) < tiny) d = tiny
    c = 1 + odd / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    const step = d * c
    h *= step
    if (Math.abs(step - 1) < 1e-14) break
  }
  return h
}

/** Регуляризованная неполная бета-функция Iₓ(a, b). */
function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const front = Math.exp(
    lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  )
  return x < (a + 1) / (a + b + 2)
    ? (front * betaFraction(a, b, x)) / a
    : 1 - (front * betaFraction(b, a, 1 - x)) / b
}

/** P(T ≤ t) для распределения Стьюдента. */
function tCdf(t: number, df: number): number {
  const tail = 0.5 * incompleteBeta(df / (df + t * t), df / 2, 0.5)
  return t >= 0 ? 1 - tail : tail
}

const quantiles = new Map<string, number>()

/** Квантиль Стьюдента уровня `p` (больше 0.5) — бисекцией по точной функции распределения. */
export function tQuantile(p: number, df: number): number {
  const key = `${p}:${df}`
  const known = quantiles.get(key)
  if (known !== undefined) return known

  let lo = 0
  let hi = 1
  while (tCdf(hi, df) < p) hi *= 2
  for (let i = 0; i < 200 && hi - lo > 1e-10; i++) {
    const mid = (lo + hi) / 2
    if (tCdf(mid, df) < p) lo = mid
    else hi = mid
  }
  const t = (lo + hi) / 2
  quantiles.set(key, t)
  return t
}

/**
 * Автокорреляция остатков соседних дней: насколько вчерашнее отклонение повторяется сегодня.
 * Пара — только дни подряд, пропуск в оценках пару рвёт. Зажата в [0; 0.8]: отрицательная
 * не учитывается (поправка должна только расширять ошибку), а у единицы поправка бесконечна.
 */
export function lag1(residuals: number[], days: string[]): number {
  const byDay = new Map(days.map((d, i) => [d, residuals[i]!]))
  let pairs = 0
  let sum = 0
  for (const [day, e] of byDay) {
    const next = byDay.get(dayKey(addDays(parseDay(day), 1)))
    if (next === undefined) continue
    pairs++
    sum += e * next
  }
  const variance = residuals.reduce((s, e) => s + e * e, 0) / residuals.length
  if (!pairs || variance === 0) return 0
  return Math.min(0.8, Math.max(0, sum / pairs / variance))
}
