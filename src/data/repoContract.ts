import { describe, expect, it } from 'vitest'
import { addDays, dayKey, parseDay } from '@/domain/date'
import { isPaused } from '@/domain/pauses'
import { DEFAULT_DAY_GROUPS, DEFAULT_SETTINGS, type Challenge, type DayLog } from '@/domain/types'
import type { Repo } from './repo'

/**
 * Договор хранилища — один набор тестов для каждой реализации `Repo` (демо и Supabase). Данные тесты
 * заводят через сам репозиторий, без сида: `makeRepo` отдаёт пустое хранилище.
 */
export function repoContract(name: string, makeRepo: () => Promise<Repo>, options: { skip?: boolean; timeout?: number } = {}) {
  const suite = options.skip ? describe.skip : describe
  const t = options.timeout

  const draft = (over: Partial<Omit<Challenge, 'id'>> = {}): Omit<Challenge, 'id'> => ({
    name: 'Читать 20 страниц',
    code: 'ЧТН',
    kind: 'do',
    measure: 'binary',
    goal: 1,
    unit: null,
    color: 'var(--chart-1)',
    tagIds: [],
    startDate: '2026-09-01',
    lengthDays: null,
    pauses: [],
    rulesLocked: false,
    deletedAt: null,
    sortOrder: 0,
    ...over,
  })
  const byId = async (r: Repo, id: string) => (await r.listChallenges()).find((c) => c.id === id)!
  const closedLog = (day: string): DayLog => ({
    day,
    mood: 5,
    wellbeing: 5,
    productivity: 5,
    tags: [],
    note: '',
    closedAt: `${day}T21:00:00.000Z`,
  })

  suite(`${name}: договор хранилища`, () => {
    it('пустое хранилище: ничего нет, настройки и блоки дня — по умолчанию', async () => {
      const r = await makeRepo()
      expect(await r.listChallenges()).toEqual([])
      expect(await r.listEntries()).toEqual({})
      expect(await r.listDayLogs()).toEqual([])
      expect(await r.listDayStarts()).toEqual([])
      expect(await r.listTags()).toEqual([])
      expect(await r.getSettings()).toEqual(DEFAULT_SETTINGS)
      expect(await r.getDayGroups()).toEqual(DEFAULT_DAY_GROUPS)
    }, t)

    describe('челленджи', () => {
      it('заводит челлендж и отдаёт его с id; отметок у нового нет, но карта есть', async () => {
        const r = await makeRepo()
        const created = await r.createChallenge(draft({ measure: 'count', goal: 20, unit: 'стр.', lengthDays: 30 }))
        expect(created.id).toBeTruthy()
        expect(await r.listChallenges()).toEqual([created])
        expect(created).toMatchObject({ goal: 20, unit: 'стр.', lengthDays: 30, pauses: [], deletedAt: null })
        expect((await r.listEntries())[created.id]).toEqual({})
      }, t)

      it('правка меняет имя; под замком правила не меняются, а замок не снимается', async () => {
        const r = await makeRepo()
        const c = await r.createChallenge(draft({ measure: 'count', goal: 20, unit: 'стр.' }))
        await r.updateChallenge(c.id, { name: 'Читать 30 страниц' })
        await r.updateChallenge(c.id, { rulesLocked: true })
        await r.updateChallenge(c.id, { goal: 5, kind: 'quit', lengthDays: 10 })
        await r.updateChallenge(c.id, { rulesLocked: false })
        expect(await byId(r, c.id)).toMatchObject({
          name: 'Читать 30 страниц',
          goal: 20,
          kind: 'do',
          lengthDays: null,
          rulesLocked: true,
        })
      }, t)

      it('пауза и снятие — периодом, который остаётся в истории', async () => {
        const r = await makeRepo()
        const c = await r.createChallenge(draft())
        await r.setPaused(c.id, true, '2026-09-25')
        expect(isPaused(await byId(r, c.id))).toBe(true)
        await r.setPaused(c.id, false, '2026-09-28')
        const after = await byId(r, c.id)
        expect(isPaused(after)).toBe(false)
        expect(after.pauses).toEqual([{ from: '2026-09-25', to: '2026-09-27' }])
      }, t)

      it('пауза после закрытого дня и в день выполненной привычки начинается завтра', async () => {
        const r = await makeRepo()
        const a = await r.createChallenge(draft())
        const b = await r.createChallenge(draft({ code: 'ОТЖ', sortOrder: 1 }))
        await r.setEntry(b.id, '2026-09-24', 1)
        await r.setPaused(b.id, true, '2026-09-24')
        expect((await byId(r, b.id)).pauses).toEqual([{ from: '2026-09-25', to: null }])

        await r.saveDayLog(closedLog('2026-09-25'))
        await r.setPaused(a.id, true, '2026-09-25')
        expect((await byId(r, a.id)).pauses).toEqual([{ from: '2026-09-26', to: null }])
      }, t)

      it('удаление: дата проставлена, отметки на месте; возврат — дни удаления стали паузой', async () => {
        const r = await makeRepo()
        const c = await r.createChallenge(draft())
        await r.setEntry(c.id, '2026-09-20', 1)
        await r.deleteChallenge(c.id)
        const deleted = await byId(r, c.id)
        expect(deleted.deletedAt).not.toBeNull()
        expect((await r.listEntries())[c.id]).toEqual({ '2026-09-20': 1 })

        const deletedOn = parseDay(dayKey(new Date(deleted.deletedAt!)))
        await r.restoreChallenge(c.id, dayKey(addDays(deletedOn, 5)))
        const back = await byId(r, c.id)
        expect(back.deletedAt).toBeNull()
        expect(back.pauses).toEqual([{ from: dayKey(addDays(deletedOn, 1)), to: dayKey(addDays(deletedOn, 4)) }])
      }, t)

      it('удаление навсегда уносит и челлендж, и его отметки', async () => {
        const r = await makeRepo()
        const c = await r.createChallenge(draft())
        await r.setEntry(c.id, '2026-09-20', 1)
        await r.purgeChallenge(c.id)
        expect(await r.listChallenges()).toEqual([])
        expect(c.id in (await r.listEntries())).toBe(false)
      }, t)

      it('порядок: заданный, неизвестные id пропускаются, не упомянутые — следом в прежнем порядке', async () => {
        const r = await makeRepo()
        const a = await r.createChallenge(draft({ code: 'А', sortOrder: 0 }))
        const b = await r.createChallenge(draft({ code: 'Б', sortOrder: 1 }))
        const c = await r.createChallenge(draft({ code: 'В', sortOrder: 2 }))
        const d = await r.createChallenge(draft({ code: 'Г', sortOrder: 3 }))
        await r.reorderChallenges([c.id, 'нет-такого', a.id])
        const list = await r.listChallenges()
        expect(list.map((x) => x.code)).toEqual(['В', 'А', 'Б', 'Г'])
        expect(list.map((x) => x.sortOrder)).toEqual([0, 1, 2, 3])
        expect(list.map((x) => x.id)).toEqual([c.id, a.id, b.id, d.id])
      }, t)
    })

    describe('теги', () => {
      it('заводит тег с обрезанными пробелами; список — по алфавиту', async () => {
        const r = await makeRepo()
        const sleep = await r.createTag('  сон  ')
        await r.createTag('еда')
        expect(sleep.name).toBe('сон')
        expect((await r.listTags()).map((x) => x.name)).toEqual(['еда', 'сон'])
      }, t)

      it('пустое имя и дубль без учёта регистра и пробелов — отказ', async () => {
        const r = await makeRepo()
        await r.createTag('Тело')
        await expect(r.createTag('   ')).rejects.toThrow()
        await expect(r.createTag('  тЕло ')).rejects.toThrow(/уже есть/i)
        expect(await r.listTags()).toHaveLength(1)
      }, t)

      it('удаление тега снимает его со всех челленджей', async () => {
        const r = await makeRepo()
        const body = await r.createTag('тело')
        const mind = await r.createTag('ум')
        const c = await r.createChallenge(draft({ tagIds: [body.id, mind.id] }))
        await r.deleteTag(body.id)
        expect((await r.listTags()).map((x) => x.id)).toEqual([mind.id])
        expect((await byId(r, c.id)).tagIds).toEqual([mind.id])
      }, t)
    })

    describe('отметки', () => {
      it('ставит, перезаписывает; ноль — значение; undefined — удаляет запись', async () => {
        const r = await makeRepo()
        const c = await r.createChallenge(draft({ kind: 'quit' }))
        await r.setEntry(c.id, '2026-09-20', 1)
        await r.setEntry(c.id, '2026-09-20', 0)
        await r.setEntry(c.id, '2026-09-21', 1)
        expect((await r.listEntries())[c.id]).toEqual({ '2026-09-20': 0, '2026-09-21': 1 })
        await r.setEntry(c.id, '2026-09-21', undefined)
        expect((await r.listEntries())[c.id]).toEqual({ '2026-09-20': 0 })
      }, t)

      it('число с долями сохраняется как есть', async () => {
        const r = await makeRepo()
        const c = await r.createChallenge(draft({ measure: 'count', goal: 10, unit: 'км' }))
        await r.setEntry(c.id, '2026-09-20', 7.5)
        expect((await r.listEntries())[c.id]).toEqual({ '2026-09-20': 7.5 })
      }, t)
    })

    describe('день', () => {
      it('итог дня: запись за день одна, повторная перезаписывает; список — по дням', async () => {
        const r = await makeRepo()
        await r.saveDayLog({ ...closedLog('2026-09-21'), tags: ['алкоголь'], note: 'поздно' })
        await r.saveDayLog(closedLog('2026-09-20'))
        await r.saveDayLog({ ...closedLog('2026-09-21'), mood: 9, tags: ['спорт', 'отдых'] })
        const logs = await r.listDayLogs()
        expect(logs.map((l) => l.day)).toEqual(['2026-09-20', '2026-09-21'])
        expect(logs[1]).toEqual({ ...closedLog('2026-09-21'), mood: 9, tags: ['спорт', 'отдых'] })
      }, t)

      it('начало дня: второе бросает, первое остаётся; день без утра — утро null', async () => {
        const r = await makeRepo()
        const morning = { day: '2026-09-21', morning: { sleep: 7, wellbeing: 6, mood: 5 }, startedAt: '2026-09-21T07:30:00.000Z' }
        await r.startDay(morning)
        await expect(
          r.startDay({ day: '2026-09-21', morning: { sleep: 1, wellbeing: 1, mood: 1 }, startedAt: '2026-09-21T08:00:00.000Z' }),
        ).rejects.toThrow(/уже начат/)
        await r.startDay({ day: '2026-09-20', morning: null, startedAt: '2026-09-20T16:00:00.000Z' })
        expect(await r.listDayStarts()).toEqual([
          { day: '2026-09-20', morning: null, startedAt: '2026-09-20T16:00:00.000Z' },
          morning,
        ])
      }, t)

      it('настройки и порядок блоков дня сохраняются', async () => {
        const r = await makeRepo()
        await r.saveSettings({ morningUntil: 12 })
        await r.saveDayGroups(['holds', 'tasks'])
        expect(await r.getSettings()).toEqual({ morningUntil: 12 })
        expect(await r.getDayGroups()).toEqual(['holds', 'tasks'])
        await r.saveSettings({ morningUntil: 16 })
        expect(await r.getSettings()).toEqual({ morningUntil: 16 })
        expect(await r.getDayGroups()).toEqual(['holds', 'tasks'])
      }, t)
    })
  })
}
