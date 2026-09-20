import { describe, expect, it } from 'vitest'
import { addDays, dayKey, parseDay } from '@/domain/date'
import { dayOutcome } from '@/domain/streaks'
import { unratedDays } from '@/domain/stats'
import { createDemoRepo } from './demoRepo'

const TODAY = parseDay('2026-09-21')

const repo = (over: { today?: Date; seed?: number } = {}) =>
  createDemoRepo({ today: TODAY, seed: 20260921, ...over })

describe('демо-репозиторий: челленджи', () => {
  it('отдаёт шесть челленджей прототипа', async () => {
    const codes = (await repo().listChallenges()).map((c) => c.code)
    expect(codes).toEqual(['ОТЖ', 'БСГ', 'ЧТН', 'ШАГ', 'БСХ', 'АНГ'])
  })

  it('среди них есть и привычки, и отказы — это разные сущности', async () => {
    const kinds = new Set((await repo().listChallenges()).map((c) => c.kind))
    expect(kinds).toEqual(new Set(['do', 'quit']))
  })

  it('один челлендж на паузе — чтобы фильтр «активные/все» было на чём проверить', async () => {
    const paused = (await repo().listChallenges()).filter((c) => c.status === 'paused')
    expect(paused).toHaveLength(1)
  })

  it('ОТЖ — ограниченный челлендж на 30 дней, остальные бессрочные', async () => {
    const list = await repo().listChallenges()
    const limited = list.filter((c) => c.lengthDays !== null)
    expect(limited).toHaveLength(1)
    expect(limited[0]?.code).toBe('ОТЖ')
    expect(limited[0]?.lengthDays).toBe(30)
  })
})

describe('демо-репозиторий: сид', () => {
  it('детерминирован — одно зерно даёт одни и те же отметки', async () => {
    const a = await repo().listEntries()
    const b = await repo().listEntries()
    expect(a).toEqual(b)
  })

  it('разные зёрна дают разные данные', async () => {
    const a = await repo({ seed: 1 }).listEntries()
    const b = await repo({ seed: 2 }).listEntries()
    expect(a).not.toEqual(b)
  })

  it('строится от переданного «сегодня», а не от даты внутри кода', async () => {
    const other = parseDay('2027-03-05')
    const entries = await createDemoRepo({ today: other, seed: 1 }).listEntries()
    const keys = Object.values(entries).flatMap(Object.keys)
    expect(keys.length).toBeGreaterThan(0)
    expect(Math.max(...keys.map((k) => +parseDay(k)))).toBeLessThanOrEqual(+other)
  })

  it('не ставит отметок раньше старта челленджа', async () => {
    const list = await repo().listChallenges()
    const entries = await repo().listEntries()
    for (const c of list) {
      for (const key of Object.keys(entries[c.id] ?? {})) {
        expect(key >= c.startDate).toBe(true)
      }
    }
  })

  it('у ограниченного челленджа нет отметок после конца периода', async () => {
    const limited = (await repo().listChallenges()).find((c) => c.lengthDays !== null)!
    const entries = (await repo().listEntries())[limited.id] ?? {}
    const end = dayKey(addDays(parseDay(limited.startDate), limited.lengthDays! - 1))
    for (const key of Object.keys(entries)) expect(key <= end).toBe(true)
  })

  it('итоги дня есть за прошедшие дни и отсутствуют за сегодня', async () => {
    const logs = await repo().listDayLogs()
    expect(logs.length).toBeGreaterThan(0)
    expect(logs.some((l) => l.day === dayKey(TODAY))).toBe(false)
  })

  it('оставляет незакрытый день в прошлом — иначе долг по оценкам нечем показать', async () => {
    const logs = await repo().listDayLogs()
    expect(unratedDays(logs, TODAY).length).toBeGreaterThan(0)
  })

  it('оценки дня лежат в диапазоне 1–10', async () => {
    for (const log of await repo().listDayLogs()) {
      for (const v of [log.mood, log.wellbeing, log.productivity]) {
        expect(v).toBeGreaterThanOrEqual(1)
        expect(v).toBeLessThanOrEqual(10)
      }
    }
  })
})

describe('setEntry', () => {
  it('записывает значение отметки', async () => {
    const r = repo()
    const [c] = await r.listChallenges()
    await r.setEntry(c!.id, '2026-09-20', 42)
    expect((await r.listEntries())[c!.id]?.['2026-09-20']).toBe(42)
  })

  it('undefined удаляет отметку, а не пишет ноль', async () => {
    const r = repo()
    const [c] = await r.listChallenges()
    await r.setEntry(c!.id, '2026-09-20', 42)
    await r.setEntry(c!.id, '2026-09-20', undefined)
    expect('2026-09-20' in ((await r.listEntries())[c!.id] ?? {})).toBe(false)
  })

  it('у отказа снятая отметка возвращает дню статус выдержанного, а ноль — срыв', async () => {
    const r = repo()
    const quit = (await r.listChallenges()).find((c) => c.kind === 'quit')!
    const day = parseDay('2026-09-20')

    await r.setEntry(quit.id, '2026-09-20', 0)
    expect(dayOutcome(quit, (await r.listEntries())[quit.id] ?? {}, day, TODAY)).toBe('miss')

    await r.setEntry(quit.id, '2026-09-20', undefined)
    expect(dayOutcome(quit, (await r.listEntries())[quit.id] ?? {}, day, TODAY)).toBe('hit')
  })
})

describe('saveDayLog', () => {
  const log = {
    day: '2026-09-20',
    mood: 7,
    wellbeing: 6,
    productivity: 8,
    tags: ['дедлайн'],
    note: 'проверка',
    closedAt: '2026-09-20T21:00:00.000Z',
  }

  it('сохраняет запись за день', async () => {
    const r = repo()
    await r.saveDayLog(log)
    expect((await r.listDayLogs()).find((l) => l.day === '2026-09-20')?.note).toBe('проверка')
  })

  it('перезаписывает запись за тот же день, а не добавляет вторую', async () => {
    const r = repo()
    await r.saveDayLog(log)
    await r.saveDayLog({ ...log, note: 'исправлено' })
    const same = (await r.listDayLogs()).filter((l) => l.day === '2026-09-20')
    expect(same).toHaveLength(1)
    expect(same[0]?.note).toBe('исправлено')
  })

  it('держит записи отсортированными по дню', async () => {
    const logs = await repo().listDayLogs()
    const days = logs.map((l) => l.day)
    expect(days).toEqual([...days].sort())
  })
})

describe('createChallenge', () => {
  const fresh = {
    name: 'Без кофе',
    code: 'БК',
    kind: 'quit' as const,
    measure: 'binary' as const,
    goal: 1,
    unit: null,
    color: 'var(--chart-6)',
    tag: null,
    startDate: '2026-09-21',
    lengthDays: null,
    status: 'active' as const,
    sortOrder: 6,
  }

  it('добавляет челлендж в список и выдаёт ему id', async () => {
    const r = repo()
    const created = await r.createChallenge(fresh)
    expect(created.id).toBeTruthy()

    const list = await r.listChallenges()
    expect(list).toHaveLength(7)
    expect(list.find((c) => c.id === created.id)?.name).toBe('Без кофе')
  })

  it('новый челлендж начинается без единой отметки', async () => {
    const r = repo()
    const created = await r.createChallenge(fresh)
    expect((await r.listEntries())[created.id]).toEqual({})
  })

  it('выдаёт разные id при повторном создании', async () => {
    const r = repo()
    const a = await r.createChallenge(fresh)
    const b = await r.createChallenge(fresh)
    expect(a.id).not.toBe(b.id)
  })
})
