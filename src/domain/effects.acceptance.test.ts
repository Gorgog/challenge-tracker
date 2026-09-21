import { describe, expect, it } from 'vitest'
import { createDemoRepo } from '@/data/demoRepo'
import { addDays, dayKey, parseDay } from './date'
import { beforeAfter, challengeEffects, tagEffects } from './effects'

/**
 * Приёмка методики на демо-данных. В сид заложены известные связи:
 * ШАГ вчера → сегодня лучше самочувствие и настроение (настоящий эффект назавтра);
 * алкоголь → назавтра хуже самочувствие и продуктивность (похмелье);
 * ЧТН выполняется в энергичные дни — связь только с самим днём (ложный эффект);
 * АНГ — шум. Экран обязан найти настоящие связи и не поверить ложным.
 * День недели меняет сид, поэтому проверяется неделя «сегодня» подряд.
 */
const WEEK = Array.from({ length: 7 }, (_, i) => addDays(parseDay('2026-09-21'), i))

const worlds = new Map<string, ReturnType<typeof build>>()

async function build(today: Date) {
  const r = createDemoRepo({ today, seed: 20260921, storage: null })
  const [challenges, entries, logs] = await Promise.all([r.listChallenges(), r.listEntries(), r.listDayLogs()])
  const effects = challengeEffects(challenges, entries, logs, today)
  return {
    challenges,
    logs,
    tags: tagEffects(logs),
    byCode: (code: string) => effects.find((e) => e.challenge.code === code)!,
  }
}

function world(today: Date) {
  const key = dayKey(today)
  if (!worlds.has(key)) worlds.set(key, build(today))
  return worlds.get(key)!
}

describe.each(WEEK.map((d) => [dayKey(d), d] as const))('демо-данные, сегодня %s', (_key, today) => {
  it('ШАГ: дни лучше и назавтра — уверенно', async () => {
    const step = (await world(today)).byCode('ШАГ')
    expect(step.verdict).toBe('persists')
    expect(step.confidence).toBe('sure')
  })

  it('алкоголь бьёт по следующему дню, по самочувствию — уверенно', async () => {
    const drink = (await world(today)).tags.find((t) => t.tag === 'алкоголь')!
    expect(drink.verdict).toBe('delayed')
    expect(drink.windows.day.next.delta).toBeLessThan(0)
    expect(drink.windows.wellbeing.next.strength).toBe('strong')
  })

  it('ЧТН связан только с самим днём — назавтра не «похоже» и не «уверенно»', async () => {
    const read = (await world(today)).byCode('ЧТН')
    expect(['coincidence', 'sameDayOnly']).toContain(read.verdict)
    expect(['likely', 'strong']).not.toContain(read.windows.day.next.strength)
  })

  it('АНГ — шум: заметной связи нет или неясно', async () => {
    expect(['noEffect', 'unclear']).toContain((await world(today)).byCode('АНГ').verdict)
  })

  it.each(['ОТЖ', 'БСГ', 'БСХ'])('%s почти без пропусков — только «до/после», и без вывода', async (code) => {
    const e = (await world(today)).byCode(code)
    expect(e.verdict).toBe('insufficient')
    expect(['flat', 'unclear']).toContain(e.beforeAfter!.byMetric.day.strength)
  })

  it('ЧТН и ШАГ начаты в один день — их «до/после» не разделить', async () => {
    const { challenges, logs } = await world(today)
    const read = challenges.find((c) => c.code === 'ЧТН')!
    expect(beforeAfter(read, challenges, logs, today).inseparableFrom.map((c) => c.code)).toEqual(['ШАГ'])
  })
})
