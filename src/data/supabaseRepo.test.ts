import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { createSupabaseRepo } from './supabaseRepo'

type Row = Record<string, unknown>
type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown][] }

/**
 * Поддельный клиент: таблицы в памяти, фильтр `eq`, страницы `range` и потолок строк за ответ, как у
 * PostgREST (`maxRows`). Правил базы здесь нет — их проверяют `rls.db.test.ts` и `rls-check.sql`.
 */
function fakeDb(tables: Record<string, Row[]>, maxRows = 1000) {
  const calls: Call[] = []
  const rpc: { fn: string; args: unknown }[] = []
  const from = (table: string) => {
    let op = 'select'
    let payload: unknown
    let range: [number, number] | null = null
    let single = false
    const filters: [string, unknown][] = []
    const b = {
      select: () => b,
      order: () => b,
      eq: (col: string, v: unknown) => (filters.push([col, v]), b),
      range: (f: number, t: number) => ((range = [f, t]), b),
      update: (p: unknown) => ((op = 'update'), (payload = p), b),
      insert: (p: unknown) => ((op = 'insert'), (payload = p), b),
      upsert: (p: unknown) => ((op = 'upsert'), (payload = p), b),
      delete: () => ((op = 'delete'), b),
      maybeSingle: () => ((single = true), b),
      single: () => ((single = true), b),
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
        calls.push({ table, op, payload, filters })
        const rows = (tables[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v))
        let data: unknown = null
        if (op === 'select') {
          const [lo, hi] = range ?? [0, rows.length - 1]
          const page = rows.slice(lo, Math.min(hi + 1, lo + maxRows))
          data = single ? (page[0] ?? null) : page
        }
        return Promise.resolve({ data, error: null }).then(res, rej)
      },
    }
    return b
  }
  const client = {
    from,
    rpc: async (fn: string, args: unknown) => (rpc.push({ fn, args }), { data: null, error: null }),
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u' } } } }) },
  }
  return { client: client as unknown as SupabaseClient, calls, rpc }
}

const challengeRow = (over: Row = {}): Row => ({
  id: 'c1',
  name: 'Читать',
  code: 'ЧТН',
  kind: 'do',
  measure: 'binary',
  goal: 1,
  unit: null,
  color: 'var(--chart-1)',
  tag_ids: [],
  start_date: '2026-01-01',
  length_days: null,
  pauses: [],
  rules_locked: false,
  deleted_at: null,
  sort_order: 0,
  ...over,
})

const dayKeyOf = (i: number) => new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10)

describe('хранилище Supabase: как оно разговаривает с базой', () => {
  it('списки читаются до пустой страницы, даже если сервер отдаёт меньше 1000 строк за раз', async () => {
    const logs = Array.from({ length: 1200 }, (_, i) => ({
      day: dayKeyOf(i),
      mood: 5,
      wellbeing: 5,
      productivity: 5,
      tags: [],
      note: '',
      closed_at: null,
    }))
    const { client } = fakeDb({ day_logs: logs }, 500)
    expect(await createSupabaseRepo(client).listDayLogs()).toHaveLength(1200)
  })

  it('пауза смотрит сегодняшнюю отметку прицельно, а не первую тысячу отметок', async () => {
    /* 1500 отметок; сегодняшняя — в хвосте, за пределами одного ответа */
    const entries = Array.from({ length: 1500 }, (_, i) => ({ challenge_id: 'c1', day: dayKeyOf(i), value: 1 }))
    const today = dayKeyOf(1499)
    const { client, calls } = fakeDb({ challenges: [challengeRow()], entries, day_logs: [] })
    await createSupabaseRepo(client).setPaused('c1', true, today)
    const saved = calls.find((c) => c.table === 'challenges' && c.op === 'update')!
    /* привычка сегодня уже выполнена — пауза с завтра */
    expect(saved.payload).toEqual({ pauses: [{ from: dayKeyOf(1500), to: null }] })
  })

  it('правка пишет только изменённые поля — не затирает порядок, паузы и удаление', async () => {
    const { client, calls } = fakeDb({ challenges: [challengeRow({ sort_order: 3 })] })
    await createSupabaseRepo(client).updateChallenge('c1', { name: 'Читать 30 страниц' })
    const saved = calls.find((c) => c.table === 'challenges' && c.op === 'update')!
    expect(saved.payload).toEqual({ name: 'Читать 30 страниц' })
  })

  it('правка без изменений в базу не пишет', async () => {
    const { client, calls } = fakeDb({ challenges: [challengeRow()] })
    await createSupabaseRepo(client).updateChallenge('c1', { name: 'Читать' })
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('порядок — одним вызовом функции базы со всем списком, а не N запросами', async () => {
    const { client, calls, rpc } = fakeDb({
      challenges: [challengeRow({ id: 'a', sort_order: 0 }), challengeRow({ id: 'b', sort_order: 1 }), challengeRow({ id: 'c', sort_order: 2 })],
    })
    await createSupabaseRepo(client).reorderChallenges(['c', 'a'])
    expect(rpc).toEqual([{ fn: 'reorder_challenges', args: { ids: ['c', 'a', 'b'] } }])
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })
})
