import { describe, expect, it, vi } from 'vitest'
import { addDays, dayKey, isoDow, parseDay } from '@/domain/date'
import { isPaused } from '@/domain/pauses'
import { activeDays, dayOutcome } from '@/domain/streaks'
import { SCORE_MAX, SCORE_MIN } from '@/domain/score'
import { unratedDays } from '@/domain/stats'
import type { DayLog, ScoreField } from '@/domain/types'
import { SCENARIO_KEY, createDemoRepo, demoScenario } from './demoRepo'

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
    const paused = (await repo().listChallenges()).filter(isPaused)
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

  it('оценки дня лежат в диапазоне шкалы', async () => {
    for (const log of await repo().listDayLogs()) {
      for (const v of [log.mood, log.wellbeing, log.productivity]) {
        expect(v).toBeGreaterThanOrEqual(SCORE_MIN)
        expect(v).toBeLessThanOrEqual(SCORE_MAX)
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
    tagIds: [],
    startDate: '2026-09-21',
    lengthDays: null,
    pauses: [],
    rulesLocked: false,
    deletedAt: null,
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
    tagIds: [],
    startDate: '2026-09-21',
    lengthDays: null,
    pauses: [],
    rulesLocked: false,
    deletedAt: null,
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

describe('управление челленджем', () => {
  const byCode = async (r: ReturnType<typeof repo>, code: string) =>
    (await r.listChallenges()).find((c) => c.code === code)!

  it('правка меняет название', async () => {
    const r = repo()
    const c = await byCode(r, 'ЧТН')
    await r.updateChallenge(c.id, { name: 'Читать 30 страниц' })
    expect((await byCode(r, 'ЧТН')).name).toBe('Читать 30 страниц')
  })

  it('у запертого челленджа правка не трогает цель', async () => {
    const r = repo()
    const c = await byCode(r, 'ОТЖ')
    await r.updateChallenge(c.id, { rulesLocked: true })
    await r.updateChallenge(c.id, { goal: 5 })
    expect((await byCode(r, 'ОТЖ')).goal).toBe(30)
  })

  it('ставит на паузу и снимает с неё — пауза остаётся в истории', async () => {
    const r = repo()
    const c = await byCode(r, 'ЧТН')

    await r.setPaused(c.id, true, '2026-09-25')
    expect(isPaused(await byCode(r, 'ЧТН'))).toBe(true)

    await r.setPaused(c.id, false, '2026-09-28')
    const after = await byCode(r, 'ЧТН')
    expect(isPaused(after)).toBe(false)
    expect(after.pauses).toEqual([{ from: '2026-09-25', to: '2026-09-27' }])
  })

  it('пауза после «Завершить день» начинается завтра — закрытый день не переписать', async () => {
    const r = repo()
    const c = await byCode(r, 'ЧТН')
    await r.saveDayLog({
      day: '2026-09-25', mood: 5, wellbeing: 5, productivity: 5, tags: [], note: '',
      closedAt: '2026-09-25T21:00:00.000Z',
    })

    await r.setPaused(c.id, true, '2026-09-25')
    expect((await byCode(r, 'ЧТН')).pauses).toEqual([{ from: '2026-09-26', to: null }])
  })

  it('снятие паузы после «Завершить день» оставляет закрытый день днём паузы', async () => {
    const r = repo()
    const eng = await byCode(r, 'АНГ')
    await r.saveDayLog({
      day: '2026-09-25', mood: 5, wellbeing: 5, productivity: 5, tags: [], note: '',
      closedAt: '2026-09-25T21:00:00.000Z',
    })

    await r.setPaused(eng.id, false, '2026-09-25')
    expect((await byCode(r, 'АНГ')).pauses.at(-1)?.to).toBe('2026-09-25')
  })

  it('отдаёт копию пауз — правка снаружи хранилище не трогает', async () => {
    const r = repo()
    const eng = await byCode(r, 'АНГ')
    eng.pauses[0]!.to = '2026-09-01'
    eng.pauses.push({ from: '2026-09-02', to: null })

    expect((await byCode(r, 'АНГ')).pauses).toHaveLength(1)
    expect((await byCode(r, 'АНГ')).pauses[0]?.to).toBeNull()
  })

  it('пауза в день, когда привычка уже выполнена, начинается завтра', async () => {
    const r = repo()
    const c = await byCode(r, 'ЧТН')
    await r.setEntry(c.id, '2026-09-25', 1)

    await r.setPaused(c.id, true, '2026-09-25')
    expect((await byCode(r, 'ЧТН')).pauses).toEqual([{ from: '2026-09-26', to: null }])
  })

  it('мягкое удаление проставляет дату и не трогает отметки', async () => {
    const r = repo()
    const c = await byCode(r, 'ЧТН')
    const before = (await r.listEntries())[c.id]

    await r.deleteChallenge(c.id)

    expect((await byCode(r, 'ЧТН')).deletedAt).not.toBeNull()
    expect((await r.listEntries())[c.id]).toEqual(before)
  })

  it('возврат снимает дату удаления', async () => {
    const r = repo()
    const c = await byCode(r, 'ЧТН')
    await r.deleteChallenge(c.id)
    await r.restoreChallenge(c.id, dayKey(new Date()))
    expect((await byCode(r, 'ЧТН')).deletedAt).toBeNull()
  })

  it('дни, пока челлендж был удалён, после возврата — пауза', async () => {
    const r = repo()
    const c = await byCode(r, 'ЧТН')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 10, 12))
    await r.deleteChallenge(c.id)
    vi.useRealTimers()

    await r.restoreChallenge(c.id, '2026-09-21')
    expect((await byCode(r, 'ЧТН')).pauses).toEqual([{ from: '2026-09-11', to: '2026-09-20' }])
  })

  it('удаление навсегда сносит и челлендж, и его отметки', async () => {
    const r = repo()
    const c = await byCode(r, 'ЧТН')
    await r.purgeChallenge(c.id)

    expect((await r.listChallenges()).some((x) => x.id === c.id)).toBe(false)
    expect(c.id in (await r.listEntries())).toBe(false)
  })

  it('правка и удаление переживают перезагрузку', async () => {
    const storage = fakeStorage()
    const first = createDemoRepo({ today: TODAY, seed: 20260921, storage })
    const c = (await first.listChallenges()).find((x) => x.code === 'ЧТН')!
    await first.updateChallenge(c.id, { name: 'Переименован' })
    await first.deleteChallenge(c.id)

    const again = (await createDemoRepo({ today: TODAY, seed: 20260921, storage }).listChallenges()).find(
      (x) => x.id === c.id,
    )!
    expect(again.name).toBe('Переименован')
    expect(again.deletedAt).not.toBeNull()
  })
})

describe('теги челленджей', () => {
  it('в демо заведены теги прототипа, и челленджи на них ссылаются', async () => {
    const r = repo()
    const tags = await r.listTags()
    expect(tags.map((t) => t.name).sort()).toEqual(['еда', 'здоровье', 'тело', 'ум'])

    const body = tags.find((t) => t.name === 'тело')!
    const push = (await r.listChallenges()).find((c) => c.code === 'ОТЖ')!
    expect(push.tagIds).toEqual([body.id])
  })

  it('заводит тег', async () => {
    const r = repo()
    const created = await r.createTag('сон')
    expect((await r.listTags()).some((t) => t.id === created.id && t.name === 'сон')).toBe(true)
  })

  it('обрезает пробелы по краям имени', async () => {
    expect((await repo().createTag('  сон  ')).name).toBe('сон')
  })

  it('не даёт завести тег, который уже есть, — без учёта регистра и пробелов', async () => {
    await expect(repo().createTag('  Тело ')).rejects.toThrow(/уже есть/i)
  })

  it('пустое имя отклоняется', async () => {
    await expect(repo().createTag('   ')).rejects.toThrow()
  })

  it('удаление тега снимает его со всех челленджей', async () => {
    const r = repo()
    const body = (await r.listTags()).find((t) => t.name === 'тело')!
    await r.deleteTag(body.id)

    expect((await r.listTags()).some((t) => t.id === body.id)).toBe(false)
    for (const c of await r.listChallenges()) expect(c.tagIds).not.toContain(body.id)
  })

  it('теги переживают перезагрузку', async () => {
    const storage = fakeStorage()
    await createDemoRepo({ today: TODAY, seed: 20260921, storage }).createTag('сон')
    const tags = await createDemoRepo({ today: TODAY, seed: 20260921, storage }).listTags()
    expect(tags.some((t) => t.name === 'сон')).toBe(true)
  })
})

describe('демо-репозиторий: пауза в сиде', () => {
  it('АНГ на паузе последние 26 дней: отметок нет, и это не пропуски', async () => {
    const r = repo()
    const eng = (await r.listChallenges()).find((c) => c.code === 'АНГ')!
    const entries = (await r.listEntries())[eng.id] ?? {}

    for (let back = 0; back < 26; back++) {
      const day = addDays(TODAY, -back)
      expect(entries[dayKey(day)]).toBeUndefined()
      expect(dayOutcome(eng, entries, day, TODAY)).toBe('outside')
    }
    expect(dayOutcome(eng, entries, addDays(TODAY, -26), TODAY)).not.toBe('outside')
  })
})

describe('демо «Выход из выгорания» — 30 дней', () => {
  const burnout = (seed = 20260921) =>
    createDemoRepo({ today: TODAY, seed, storage: null, scenario: 'burnout' })
  /** Двадцать историй: вероятностные свойства проверяются по среднему, а не на удачном зерне. */
  const SEEDS = Array.from({ length: 20 }, (_, i) => 20260921 + i * 7919)
  const byCode = async (r: ReturnType<typeof burnout>, code: string) =>
    (await r.listChallenges()).find((c) => c.code === code)!
  const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length

  it('четыре челленджа из истории: отжимания, шаги, чтение, английский', async () => {
    expect((await burnout().listChallenges()).map((c) => c.code)).toEqual(['ОТЖ', 'ШАГ', 'ЧТН', 'АНГ'])
  })

  it('месяц истории: итоги за прошедшие дни, кроме позавчерашнего долга', async () => {
    const logs = await burnout().listDayLogs()
    expect(logs).toHaveLength(28)
    expect(logs[0]!.day).toBe(dayKey(addDays(TODAY, -29)))
  })

  it('отжимания — цель 10, срок 30 дней, выполнены каждый прошедший день', async () => {
    const r = burnout()
    const push = await byCode(r, 'ОТЖ')
    const entries = (await r.listEntries())[push.id]!

    expect(push.goal).toBe(10)
    expect(push.lengthDays).toBe(30)
    for (const key of activeDays(push, TODAY)) {
      expect(dayOutcome(push, entries, parseDay(key), TODAY)).toBe('hit')
    }
  })

  it('английский заведён, но не выполняется ни разу', async () => {
    const r = burnout()
    expect((await r.listEntries())[(await byCode(r, 'АНГ')).id]).toEqual({})
  })

  it('чтение — около трёх раз в неделю', async () => {
    const counts = await Promise.all(
      SEEDS.map(async (seed) => {
        const r = burnout(seed)
        return Object.keys((await r.listEntries())[(await byCode(r, 'ЧТН')).id]!).length
      }),
    )
    // месяц — это четыре с лишним недели
    expect(mean(counts)).toBeGreaterThanOrEqual(11)
    expect(mean(counts)).toBeLessThanOrEqual(15)
  })

  it('пиво — только в будни, раз-два в неделю', async () => {
    const drinks = await Promise.all(
      SEEDS.map(async (seed) => (await burnout(seed).listDayLogs()).filter((l) => l.tags.includes('алкоголь'))),
    )
    expect(drinks.flat().every((l) => isoDow(parseDay(l.day)) < 5)).toBe(true)
    expect(mean(drinks.map((d) => d.length))).toBeGreaterThanOrEqual(4)
    expect(mean(drinks.map((d) => d.length))).toBeLessThanOrEqual(9)
  })

  it('недосып во второй половине месяца реже, чем в первой', async () => {
    const halves = await Promise.all(
      SEEDS.map(async (seed) => {
        const logs = await burnout(seed).listDayLogs()
        const short = (part: DayLog[]) => part.filter((l) => l.tags.includes('мало спал')).length
        return [short(logs.slice(0, 14)), short(logs.slice(14))] as const
      }),
    )
    expect(mean(halves.map((h) => h[1]))).toBeLessThan(mean(halves.map((h) => h[0])))
  })

  it('прогулки с месяцем учащаются', async () => {
    const halves = await Promise.all(
      SEEDS.map(async (seed) => {
        const r = burnout(seed)
        const steps = (await r.listEntries())[(await byCode(r, 'ШАГ')).id]!
        const walks = (from: number, to: number) =>
          Array.from({ length: to - from }, (_, k) => dayKey(addDays(TODAY, -(29 - from - k)))).filter(
            (key) => (steps[key] ?? 0) >= 10000,
          ).length
        return [walks(0, 15), walks(15, 30)] as const
      }),
    )
    // заметно: больше чем на полторы прогулки за полмесяца, а не случайный перевес
    expect(mean(halves.map((h) => h[1])) - mean(halves.map((h) => h[0]))).toBeGreaterThan(1.5)
  })

  it('из выгорания выходит: последняя неделя лучше первой, продуктивность — заметнее всего', async () => {
    const lifts = await Promise.all(
      SEEDS.map(async (seed) => {
        const logs = await burnout(seed).listDayLogs()
        const avg = (part: DayLog[], field: ScoreField) => mean(part.map((l) => l[field]))
        const [first, last] = [logs.slice(0, 7), logs.slice(-7)]
        return { mood: avg(last, 'mood') - avg(first, 'mood'), prod: avg(last, 'productivity') - avg(first, 'productivity') }
      }),
    )
    expect(mean(lifts.map((l) => l.mood))).toBeGreaterThan(0.5)
    expect(mean(lifts.map((l) => l.prod))).toBeGreaterThan(mean(lifts.map((l) => l.mood)))
  })

  it('детерминирован по зерну', async () => {
    expect(await burnout().listDayLogs()).toEqual(await burnout().listDayLogs())
  })

  it('без выбора сценария — полное демо, как раньше', async () => {
    const codes = (await repo().listChallenges()).map((c) => c.code)
    expect(codes).toEqual(['ОТЖ', 'БСГ', 'ЧТН', 'ШАГ', 'БСХ', 'АНГ'])
  })
})

describe('сценарий демо из хранилища', () => {
  it('выбранная история переживает перезагрузку', async () => {
    const storage = fakeStorage()
    storage.setItem(SCENARIO_KEY, 'burnout')
    const r = createDemoRepo({ today: TODAY, seed: 20260921, storage })
    expect((await r.listChallenges()).map((c) => c.code)).toEqual(['ОТЖ', 'ШАГ', 'ЧТН', 'АНГ'])
  })

  it('непонятное значение в хранилище — полное демо', async () => {
    const storage = fakeStorage()
    storage.setItem(SCENARIO_KEY, 'что-то старое')
    const r = createDemoRepo({ today: TODAY, seed: 20260921, storage })
    expect((await r.listChallenges()).map((c) => c.code)).toContain('БСГ')
  })

  it('кнопке сброса видно, какая история выбрана', () => {
    const storage = fakeStorage()
    expect(demoScenario(storage)).toBe('full')
    storage.setItem(SCENARIO_KEY, 'burnout')
    expect(demoScenario(storage)).toBe('burnout')
  })
})
