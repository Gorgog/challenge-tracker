// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createSupabaseRepo } from './supabaseRepo'
import { DB_TIMEOUT, TABLES, dbTestsOn, guest, signIn, wipe, type Signed } from './testDb'

/*
 * Что держит сама база, а не код сайта: чужие строки не видны и не меняются (RLS), оценки 0–10, утро не
 * правится, замок челленджа не снимается. Записи о здоровье видны только владельцу.
 */
describe.skipIf(!dbTestsOn)('база: доступ только к своему и правила данных', () => {
  let a: Signed
  let b: Signed
  let challengeId: string
  let tagId: string

  beforeAll(async () => {
    a = await signIn('a')
    b = await signIn('b')
  }, DB_TIMEOUT)

  /* у А — по строке в каждой таблице, Б пуст */
  beforeEach(async () => {
    await wipe(a)
    await wipe(b)
    const repo = createSupabaseRepo(a.client)
    tagId = (await repo.createTag('тело')).id
    challengeId = (
      await repo.createChallenge({
        name: 'Отжиматься',
        code: 'ОТЖ',
        kind: 'do',
        measure: 'count',
        goal: 20,
        unit: 'раз',
        color: 'var(--chart-1)',
        tagIds: [tagId],
        startDate: '2026-09-01',
        lengthDays: null,
        pauses: [],
        rulesLocked: true,
        deletedAt: null,
        sortOrder: 0,
      })
    ).id
    await repo.setEntry(challengeId, '2026-09-21', 20)
    await repo.saveDayLog({ day: '2026-09-21', mood: 5, wellbeing: 5, productivity: 5, tags: [], note: 'личное', closedAt: '2026-09-21T21:00:00.000Z' })
    await repo.startDay({
      day: '2026-09-21',
      morning: { sleep: 7, wellbeing: 6, mood: 6, night: { bed: -30, wake: 460, bedHow: 'usual', wakeHow: 'exact' } },
      startedAt: '2026-09-21T07:00:00.000Z',
    })
    await repo.saveSettings({ morningUntil: 12 })
  }, DB_TIMEOUT)

  it('Б не видит ни одной строки А', async () => {
    for (const table of TABLES) {
      const { data, error } = await b.client.from(table).select('*')
      expect(error).toBeNull()
      expect(data, table).toEqual([])
    }
  }, DB_TIMEOUT)

  it('Б не меняет и не удаляет строки А', async () => {
    await b.client.from('challenges').update({ name: 'взломано' }).eq('id', challengeId)
    await b.client.from('day_logs').update({ note: 'взломано' }).eq('user_id', a.uid)
    await b.client.from('challenges').delete().eq('id', challengeId)
    await b.client.from('tags').delete().eq('id', tagId)
    await b.client.from('day_starts').delete().eq('user_id', a.uid)

    const { data: c } = await a.client.from('challenges').select('name').eq('id', challengeId).single()
    expect(c?.name).toBe('Отжиматься')
    const { data: log } = await a.client.from('day_logs').select('note').single()
    expect(log?.note).toBe('личное')
    expect((await a.client.from('tags').select('id')).data).toHaveLength(1)
    expect((await a.client.from('day_starts').select('day')).data).toHaveLength(1)
  }, DB_TIMEOUT)

  it('Б не пишет строку от имени А и не ставит отметку к челленджу А', async () => {
    const asA = await b.client.from('day_logs').insert({ user_id: a.uid, day: '2026-09-22', mood: 1, wellbeing: 1, productivity: 1 })
    expect(asA.error).not.toBeNull()
    const entry = await b.client.from('entries').insert({ challenge_id: challengeId, day: '2026-09-22', value: 1 })
    expect(entry.error).not.toBeNull()
    expect((await a.client.from('entries').select('day')).data).toEqual([{ day: '2026-09-21' }])
  }, DB_TIMEOUT)

  it('гость без входа не видит ничего', async () => {
    const client = guest()
    for (const table of TABLES) {
      const { data } = await client.from(table).select('*')
      expect(data ?? [], table).toEqual([])
    }
  }, DB_TIMEOUT)

  it('оценки вне 0–10 база не пускает', async () => {
    for (const mood of [-1, 11]) {
      const { error } = await a.client.from('day_logs').insert({ day: '2026-09-22', mood, wellbeing: 5, productivity: 5 })
      expect(error, String(mood)).not.toBeNull()
    }
    const morning = await a.client
      .from('day_starts')
      .insert({ day: '2026-09-22', morning_sleep: 11, morning_wellbeing: 5, morning_mood: 5, started_at: new Date().toISOString() })
    expect(morning.error).not.toBeNull()
  }, DB_TIMEOUT)

  it('утро не правится: ни изменить, ни начать день второй раз', async () => {
    await a.client.from('day_starts').update({ morning_sleep: 1 }).eq('day', '2026-09-21')
    const again = await a.client
      .from('day_starts')
      .insert({ day: '2026-09-21', morning_sleep: 1, morning_wellbeing: 1, morning_mood: 1, started_at: new Date().toISOString() })
    expect(again.error).not.toBeNull()
    const { data } = await a.client.from('day_starts').select('morning_sleep').single()
    expect(data?.morning_sleep).toBe(7)
  }, DB_TIMEOUT)

  it('ночь: границы, порядок, целиком и только при утре; не правится', async () => {
    const started_at = new Date().toISOString()
    const morning = { morning_sleep: 6, morning_wellbeing: 6, morning_mood: 6, started_at }
    const whole = { bed_min: -30, wake_min: 460, bed_how: 'exact', wake_how: 'exact' }
    const bad: Record<string, object> = {
      'отбой за границей': { ...morning, ...whole, bed_min: 800 },
      'подъём за границей': { ...morning, ...whole, wake_min: 1440 },
      'лёг не раньше, чем встал': { ...morning, ...whole, bed_min: 460 },
      'без подъёма': { ...morning, ...whole, wake_min: null, wake_how: null },
      'без способа ответа': { ...morning, ...whole, bed_how: null },
      'чужой способ ответа': { ...morning, ...whole, bed_how: 'shift' },
      'ночь без утра': { started_at, ...whole },
    }
    for (const [name, row] of Object.entries(bad)) {
      const { error } = await a.client.from('day_starts').insert({ day: '2026-09-22', ...row })
      expect(error, name).not.toBeNull()
    }
    await a.client.from('day_starts').update({ bed_min: 60 }).eq('day', '2026-09-21')
    const { data } = await a.client.from('day_starts').select('bed_min, wake_min, bed_how, wake_how').eq('day', '2026-09-21').single()
    expect(data).toEqual({ bed_min: -30, wake_min: 460, bed_how: 'usual', wake_how: 'exact' })
  }, DB_TIMEOUT)

  it('замок челленджа: правила под замком не меняются, замок не снимается', async () => {
    const goal = await a.client.from('challenges').update({ goal: 5 }).eq('id', challengeId)
    expect(goal.error).not.toBeNull()
    const unlock = await a.client.from('challenges').update({ rules_locked: false }).eq('id', challengeId)
    expect(unlock.error).not.toBeNull()
    const name = await a.client.from('challenges').update({ name: 'Отжиматься по 20' }).eq('id', challengeId)
    expect(name.error).toBeNull()
    const { data } = await a.client.from('challenges').select('goal, rules_locked, name').single()
    expect(data).toEqual({ goal: 20, rules_locked: true, name: 'Отжиматься по 20' })
  }, DB_TIMEOUT)
})
