import { describe, expect, it } from 'vitest'
import { addDays, dayKey, parseDay } from '@/domain/date'
import { dayOutcome } from '@/domain/streaks'
import { unratedDays } from '@/domain/stats'
import { createDemoRepo } from './demoRepo'

const TODAY = parseDay('2026-09-21')

/* `storage: null` — эти тесты проверяют сид, а не хранение между перезагрузками. */
const repo = (over: { today?: Date; seed?: number } = {}) =>
  createDemoRepo({ today: TODAY, seed: 20260921, storage: null, ...over })

/** Хранилище в памяти: настоящее localStorage из jsdom протекало бы между тестами. */
function fakeStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage
}

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

describe('порядок челленджей', () => {
  it('выстраивает челленджи в переданном порядке', async () => {
    const r = repo()
    const ids = (await r.listChallenges()).map((c) => c.id)
    const reversed = [...ids].reverse()

    await r.reorderChallenges(reversed)
    expect((await r.listChallenges()).map((c) => c.id)).toEqual(reversed)
  })

  it('челлендж, не попавший в список порядка, не теряется', async () => {
    const r = repo()
    const ids = (await r.listChallenges()).map((c) => c.id)

    await r.reorderChallenges([ids[2]!, ids[0]!])
    const after = (await r.listChallenges()).map((c) => c.id)
    expect(after).toHaveLength(ids.length)
    expect(after.slice(0, 2)).toEqual([ids[2], ids[0]])
  })

  it('порядок переживает перезагрузку', async () => {
    const storage = fakeStorage()
    const first = createDemoRepo({ today: TODAY, seed: 20260921, storage })
    const reversed = (await first.listChallenges()).map((c) => c.id).reverse()
    await first.reorderChallenges(reversed)

    const second = createDemoRepo({ today: TODAY, seed: 20260921, storage })
    expect((await second.listChallenges()).map((c) => c.id)).toEqual(reversed)
  })
})

describe('порядок блоков на экране дня', () => {
  it('по умолчанию сначала привычки, потом отказы', async () => {
    expect(await repo().getDayGroups()).toEqual(['tasks', 'holds'])
  })

  it('переставленные блоки переживают перезагрузку', async () => {
    const storage = fakeStorage()
    await createDemoRepo({ today: TODAY, seed: 20260921, storage }).saveDayGroups([
      'holds',
      'tasks',
    ])

    const second = createDemoRepo({ today: TODAY, seed: 20260921, storage })
    expect(await second.getDayGroups()).toEqual(['holds', 'tasks'])
  })
})

describe('хранение между перезагрузками', () => {
  const withStorage = (storage: Storage) =>
    createDemoRepo({ today: TODAY, seed: 20260921, storage })

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

  it('заведённый челлендж переживает пересоздание репозитория', async () => {
    const storage = fakeStorage()
    await withStorage(storage).createChallenge(fresh)

    const after = await withStorage(storage).listChallenges()
    expect(after.map((c) => c.name)).toContain('Без кофе')
  })

  it('отметка переживает пересоздание', async () => {
    const storage = fakeStorage()
    const first = withStorage(storage)
    const [c] = await first.listChallenges()
    await first.setEntry(c!.id, '2026-09-20', 77)

    expect((await withStorage(storage).listEntries())[c!.id]?.['2026-09-20']).toBe(77)
  })

  it('снятая отметка тоже сохраняется — а не воскресает из сида', async () => {
    const storage = fakeStorage()
    const first = withStorage(storage)
    const [c] = await first.listChallenges()
    await first.setEntry(c!.id, '2026-09-20', 77)
    await first.setEntry(c!.id, '2026-09-20', undefined)

    expect('2026-09-20' in ((await withStorage(storage).listEntries())[c!.id] ?? {})).toBe(false)
  })

  it('итог дня переживает пересоздание', async () => {
    const storage = fakeStorage()
    await withStorage(storage).saveDayLog({
      day: '2026-09-20',
      mood: 7,
      wellbeing: 6,
      productivity: 8,
      tags: ['отдых'],
      note: 'сохранилось',
      closedAt: '2026-09-20T21:00:00.000Z',
    })

    const logs = await withStorage(storage).listDayLogs()
    expect(logs.find((l) => l.day === '2026-09-20')?.note).toBe('сохранилось')
  })

  it('id не повторяются после перезагрузки', async () => {
    const storage = fakeStorage()
    const a = await withStorage(storage).createChallenge(fresh)
    const b = await withStorage(storage).createChallenge(fresh)
    expect(a.id).not.toBe(b.id)
  })

  it('битое содержимое хранилища не роняет — демо-данные пересобираются', async () => {
    const storage = fakeStorage()
    storage.setItem('tabel-demo', '{это не json')

    const list = await withStorage(storage).listChallenges()
    expect(list).toHaveLength(6)
  })

  it('недоступное хранилище не мешает работать в памяти', async () => {
    const broken = {
      getItem: () => {
        throw new Error('доступ запрещён')
      },
      setItem: () => {
        throw new Error('доступ запрещён')
      },
    } as unknown as Storage

    const r = withStorage(broken)
    const [c] = await r.listChallenges()
    await r.setEntry(c!.id, '2026-09-20', 5)
    expect((await r.listEntries())[c!.id]?.['2026-09-20']).toBe(5)
  })
})
