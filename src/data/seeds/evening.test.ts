import { describe, expect, it } from 'vitest'
import { createDemoRepo, type DemoScenario } from '@/data/demoRepo'
import { dayKey, parseDay } from '@/domain/date'

/**
 * Охрана вечера. Утро в сидах берёт числа из своей случайной последовательности, а сон — из той
 * же величины, из которой раньше выпадал тег «мало спал». Поэтому вечерние оценки, заметки, теги
 * (кроме «мало спал») и прошлые отметки обязаны остаться прежними: на них держится приёмка методики,
 * и её частоты сравнимы с прежними. Сегодняшние отметки не в счёт: в демо день ещё не начат, и их
 * нет. Отпечатки сняты на коде до появления утра.
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

async function evening(scenario: DemoScenario, seed: number): Promise<string> {
  const r = createDemoRepo({ today: TODAY, seed, storage: null, scenario })
  const [challenges, entries, logs] = await Promise.all([r.listChallenges(), r.listEntries(), r.listDayLogs()])
  const past = Object.fromEntries(
    Object.entries(entries).map(([id, map]) => [
      id,
      Object.fromEntries(Object.entries(map).filter(([day]) => day !== dayKey(TODAY))),
    ]),
  )
  return fingerprint(
    JSON.stringify({
      challenges: challenges.map((c) => [c.id, c.startDate, c.lengthDays, c.pauses]),
      entries: past,
      logs: logs.map((l) => [
        l.day,
        l.mood,
        l.wellbeing,
        l.productivity,
        l.tags.filter((t) => t !== 'мало спал'),
        l.note,
        l.closedAt,
      ]),
    }),
  )
}

describe('утро не меняет вечер в демо', () => {
  it.each([
    ['full', 20260921, '9e03883f'],
    ['full', 20266840, 'f4c3ddb8'],
    ['full', 424242, '382023ce'],
    ['burnout', 20260921, '02c4804e'],
    ['burnout', 20266840, '2e7ffffe'],
    ['burnout', 424242, 'd5974460'],
  ] as const)('%s, зерно %s — вечерние данные те же', async (scenario, seed, expected) => {
    expect(await evening(scenario, seed)).toBe(expected)
  })
})
