import { describe, expect, it } from 'vitest'
import type { Challenge, DayLog, DayStart } from '@/domain/types'
import {
  challengeFromRow,
  challengeToRow,
  dayLogFromRow,
  dayLogToRow,
  dayStartFromRow,
  dayStartToRow,
  entriesFromRows,
  type ChallengeRow,
} from './rows'

const challenge: Challenge = {
  id: '6f1c2c1e-0000-4000-8000-000000000001',
  name: 'Отжиматься',
  code: 'ОТЖ',
  kind: 'do',
  measure: 'count',
  goal: 20,
  unit: 'раз',
  color: 'var(--chart-1)',
  tagIds: ['6f1c2c1e-0000-4000-8000-0000000000aa'],
  startDate: '2026-09-01',
  lengthDays: 30,
  pauses: [{ from: '2026-09-10', to: null }],
  rulesLocked: true,
  deletedAt: '2026-09-20T10:00:00.000Z',
  sortOrder: 2,
}

describe('строки базы ↔ домен', () => {
  it('челлендж: туда и обратно без потерь; id и владельца в строку не пишем', () => {
    const row = challengeToRow(challenge)
    expect(row).not.toHaveProperty('id')
    expect(row).not.toHaveProperty('user_id')
    expect(challengeFromRow({ ...row, id: challenge.id } as ChallengeRow)).toEqual(challenge)
  })

  it('челлендж из базы: numeric строкой — число, время с «+00:00» — ISO с «Z»', () => {
    const row = { ...challengeToRow(challenge), id: challenge.id, goal: '7.5', deleted_at: '2026-09-20T10:00:00+00:00' }
    const c = challengeFromRow(row as unknown as ChallengeRow)
    expect(c.goal).toBe(7.5)
    expect(c.deletedAt).toBe('2026-09-20T10:00:00.000Z')
  })

  it('челлендж: паузы — копия, правка снаружи строку не трогает', () => {
    const row = { ...challengeToRow(challenge), id: challenge.id } as ChallengeRow
    const c = challengeFromRow(row)
    c.pauses[0]!.to = '2026-09-11'
    c.tagIds.push('x')
    expect(row.pauses[0]!.to).toBeNull()
    expect(row.tag_ids).toHaveLength(1)
  })

  it('отметки: строки → карта по челленджам; у челленджа без отметок — пустая карта', () => {
    const map = entriesFromRows(
      ['a', 'b'],
      [
        { challenge_id: 'a', day: '2026-09-20', value: 1 },
        { challenge_id: 'a', day: '2026-09-21', value: '0' },
        { challenge_id: 'c', day: '2026-09-21', value: 3 },
      ],
    )
    expect(map).toEqual({ a: { '2026-09-20': 1, '2026-09-21': 0 }, b: {}, c: { '2026-09-21': 3 } })
  })

  it('итог дня: туда и обратно; время закрытия — ISO с «Z»', () => {
    const log: DayLog = {
      day: '2026-09-21',
      mood: 0,
      wellbeing: 10,
      productivity: 5,
      tags: ['алкоголь'],
      note: 'поздно',
      closedAt: '2026-09-21T21:00:00.000Z',
    }
    expect(dayLogFromRow({ ...dayLogToRow(log), closed_at: '2026-09-21T21:00:00+00:00' })).toEqual(log)
    expect(dayLogFromRow({ ...dayLogToRow(log), closed_at: null }).closedAt).toBeNull()
  })

  it('начало дня: утро — три столбца, ночь — четыре; пропущенное утро — null', () => {
    const start: DayStart = {
      day: '2026-09-21',
      morning: { sleep: 0, wellbeing: 6, mood: 10, night: { bed: -30, wake: 460, bedHow: 'usual', wakeHow: 'exact' } },
      startedAt: '2026-09-21T07:30:00.000Z',
    }
    expect(dayStartToRow(start)).toEqual({
      day: '2026-09-21',
      morning_sleep: 0,
      morning_wellbeing: 6,
      morning_mood: 10,
      bed_min: -30,
      wake_min: 460,
      bed_how: 'usual',
      wake_how: 'exact',
      started_at: '2026-09-21T07:30:00.000Z',
    })
    expect(dayStartFromRow(dayStartToRow(start))).toEqual(start)
    const skipped: DayStart = { day: '2026-09-20', morning: null, startedAt: '2026-09-20T16:00:00.000Z' }
    const skippedRow = dayStartToRow(skipped)
    expect([skippedRow.bed_min, skippedRow.wake_min, skippedRow.bed_how, skippedRow.wake_how]).toEqual([null, null, null, null])
    expect(dayStartFromRow({ ...skippedRow, started_at: '2026-09-20T16:00:00+00:00' })).toEqual(skipped)
  })

  it('ночь не целиком — не ночь: база держит все четыре вместе, но читаем осторожно', () => {
    const start: DayStart = { day: '2026-09-21', morning: { sleep: 7, wellbeing: 6, mood: 6 }, startedAt: '2026-09-21T07:30:00.000Z' }
    const row = { ...dayStartToRow(start), bed_min: -30, bed_how: 'exact' as const }
    expect(dayStartFromRow(row).morning?.night).toBeNull()
  })

  it('утро без ночи (до 25.09) — ночь null', () => {
    const start: DayStart = { day: '2026-09-21', morning: { sleep: 7, wellbeing: 6, mood: 6 }, startedAt: '2026-09-21T07:30:00.000Z' }
    expect(dayStartFromRow(dayStartToRow(start)).morning).toEqual({ sleep: 7, wellbeing: 6, mood: 6, night: null })
  })
})
