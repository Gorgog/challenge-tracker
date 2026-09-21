import { describe, expect, it } from 'vitest'
import { createDemoRepo, type DemoScenario } from '@/data/demoRepo'
import { addDays, dayKey, parseDay } from './date'
import { METRICS, challengeEffects, tagEffects, type Estimate, type Windows } from './effects'

/**
 * Охрана расчёта: без утр выводы обязаны остаться прежними до последнего знака. Утро приходит в
 * аналитику отдельным параметром; переделка модели под него не должна сдвинуть ни класс окна, ни
 * вывод, ни слово уверенности. Отпечатки сняты на коде до утра в аналитике. Разницы округляются
 * до 1e-9: порядок сложения может сдвинуть последний знак, а сдвиг класса отпечаток поймает и так.
 */
const TODAY = parseDay('2026-09-21')

/** FNV-1a: короткий отпечаток длинной строки. */
function fingerprint(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

const round = (x: number) => Math.round(x * 1e9) / 1e9
const estimate = (e: Estimate) => [e.strength, round(e.delta), round(e.low), round(e.high), e.withDays, e.withoutDays]
const windows = (w: Record<string, Windows>) => METRICS.map((m) => [estimate(w[m]!.same), estimate(w[m]!.next)])

async function outcome(scenario: DemoScenario, seed: number, day: number): Promise<string> {
  const r = createDemoRepo({ today: TODAY, seed, storage: null, scenario })
  const [challenges, entries, all] = await Promise.all([r.listChallenges(), r.listEntries(), r.listDayLogs()])
  const today = addDays(TODAY, day - 30)
  const logs = all.filter((l) => l.day < dayKey(today))
  const effects = challengeEffects(challenges, entries, logs, today).map((e) => [
    e.challenge.code,
    e.verdict,
    e.confidence,
    e.partner?.code ?? null,
    e.twin?.code ?? null,
    e.days,
    e.sickDays,
    windows(e.windows),
    e.beforeAfter && [
      e.beforeAfter.span,
      e.beforeAfter.sinceStart,
      e.beforeAfter.beforeStart,
      e.beforeAfter.daysBefore,
      e.beforeAfter.daysAfter,
      METRICS.map((m) => estimate(e.beforeAfter!.byMetric[m])),
      e.beforeAfter.overlaps.map((c) => c.code),
      e.beforeAfter.inseparableFrom.map((c) => c.code),
    ],
  ])
  const tags = tagEffects(logs).map((t) => [t.tag, t.tagDays, t.verdict, t.confidence, t.days, t.sickDays, windows(t.windows)])
  return fingerprint(JSON.stringify({ effects, tags }))
}

describe('без утр выводы прежние', () => {
  it.each([
    ['full', 20260921, 30, '76bb6733'],
    ['full', 20266840, 30, 'f86a241f'],
    ['full', 424242, 30, '735c0739'],
    ['burnout', 20260921, 30, 'ea0acb79'],
    ['burnout', 20266840, 30, '0eac4882'],
    ['burnout', 424242, 30, '696ca228'],
    ['burnout', 20260921, 15, 'edc61808'],
    ['burnout', 20266840, 15, '63f64fce'],
    ['burnout', 424242, 15, '6865ffaa'],
  ] as const)('%s, зерно %s, день %s — отпечаток тот же', async (scenario, seed, day, expected) => {
    expect(await outcome(scenario, seed, day)).toBe(expected)
  })
})
