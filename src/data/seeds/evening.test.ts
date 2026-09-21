import { describe, expect, it } from 'vitest'
import { createDemoRepo, type DemoScenario } from '@/data/demoRepo'
import { parseDay } from '@/domain/date'

/**
 * Охрана вечера. Утро в сидах берёт числа из своей случайной последовательности, а сон — из той
 * же величины, из которой раньше выпадал тег «мало спал». Поэтому вечерние оценки, заметки, теги
 * (кроме «мало спал») и отметки обязаны остаться прежними: на них держится приёмка методики,
 * и её частоты сравнимы с прежними. Отпечатки сняты до появления утра.
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
  return fingerprint(
    JSON.stringify({
      challenges: challenges.map((c) => [c.id, c.startDate, c.lengthDays, c.pauses]),
      entries,
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
    ['full', 20260921, 'd06e3134'],
    ['full', 20266840, '5625293d'],
    ['full', 424242, '078f316f'],
    ['burnout', 20260921, 'b88292d6'],
    ['burnout', 20266840, '482a873f'],
    ['burnout', 424242, '52abde05'],
  ] as const)('%s, зерно %s — вечерние данные те же', async (scenario, seed, expected) => {
    expect(await evening(scenario, seed)).toBe(expected)
  })
})
