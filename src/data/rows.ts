import type { Challenge, DayLog, DayStart, EntryMap, Pause } from '@/domain/types'

/*
 * Строки таблиц Supabase (supabase/migrations) ↔ доменные типы. Дни — строки YYYY-MM-DD как есть, без
 * Date: `date` в Postgres так и приходит. Время (`timestamptz`) приводится к ISO с «Z», как пишет сайт.
 * `numeric` может прийти строкой — приводится к числу.
 */

export type ChallengeRow = {
  id: string
  name: string
  code: string
  kind: Challenge['kind']
  measure: Challenge['measure']
  goal: number | string
  unit: string | null
  color: string
  tag_ids: string[]
  start_date: string
  length_days: number | null
  pauses: Pause[]
  rules_locked: boolean
  deleted_at: string | null
  sort_order: number
}

export type EntryRow = { challenge_id: string; day: string; value: number | string }

export type DayLogRow = {
  day: string
  mood: number
  wellbeing: number
  productivity: number
  tags: string[]
  note: string
  closed_at: string | null
}

export type DayStartRow = {
  day: string
  morning_sleep: number | null
  morning_wellbeing: number | null
  morning_mood: number | null
  started_at: string
}

const iso = (v: string) => new Date(v).toISOString()

export function challengeFromRow(r: ChallengeRow): Challenge {
  return {
    id: r.id,
    name: r.name,
    code: r.code,
    kind: r.kind,
    measure: r.measure,
    goal: Number(r.goal),
    unit: r.unit,
    color: r.color,
    tagIds: [...r.tag_ids],
    startDate: r.start_date,
    lengthDays: r.length_days,
    pauses: r.pauses.map((p) => ({ from: p.from, to: p.to })),
    rulesLocked: r.rules_locked,
    deletedAt: r.deleted_at === null ? null : iso(r.deleted_at),
    sortOrder: r.sort_order,
  }
}

/** Без id и владельца: id выдаёт база, владелец — `auth.uid()` по умолчанию. */
export function challengeToRow(c: Omit<Challenge, 'id'>): Omit<ChallengeRow, 'id'> {
  return {
    name: c.name,
    code: c.code,
    kind: c.kind,
    measure: c.measure,
    goal: c.goal,
    unit: c.unit,
    color: c.color,
    tag_ids: [...c.tagIds],
    start_date: c.startDate,
    length_days: c.lengthDays,
    pauses: c.pauses.map((p) => ({ from: p.from, to: p.to })),
    rules_locked: c.rulesLocked,
    deleted_at: c.deletedAt,
    sort_order: c.sortOrder,
  }
}

/** Поля строки, которые отличаются, — чтобы правка не затирала то, что поменял другой запрос. */
export function changedFields<T extends object>(before: T, after: T): Partial<T> {
  const out: Partial<T> = {}
  for (const key of Object.keys(after) as (keyof T)[]) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) out[key] = after[key]
  }
  return out
}

/** Отметки по челленджам. У челленджа без отметок — пустая карта, как у демо. */
export function entriesFromRows(challengeIds: string[], rows: EntryRow[]): Record<string, EntryMap> {
  const out: Record<string, EntryMap> = Object.fromEntries(challengeIds.map((id) => [id, {}]))
  for (const r of rows) (out[r.challenge_id] ??= {})[r.day] = Number(r.value)
  return out
}

export function dayLogFromRow(r: DayLogRow): DayLog {
  return {
    day: r.day,
    mood: r.mood,
    wellbeing: r.wellbeing,
    productivity: r.productivity,
    tags: [...r.tags],
    note: r.note,
    closedAt: r.closed_at === null ? null : iso(r.closed_at),
  }
}

export function dayLogToRow(l: DayLog): DayLogRow {
  return {
    day: l.day,
    mood: l.mood,
    wellbeing: l.wellbeing,
    productivity: l.productivity,
    tags: [...l.tags],
    note: l.note,
    closed_at: l.closedAt,
  }
}

export function dayStartFromRow(r: DayStartRow): DayStart {
  const has = r.morning_sleep !== null && r.morning_wellbeing !== null && r.morning_mood !== null
  return {
    day: r.day,
    morning: has ? { sleep: r.morning_sleep!, wellbeing: r.morning_wellbeing!, mood: r.morning_mood! } : null,
    startedAt: iso(r.started_at),
  }
}

export function dayStartToRow(s: DayStart): DayStartRow {
  return {
    day: s.day,
    morning_sleep: s.morning?.sleep ?? null,
    morning_wellbeing: s.morning?.wellbeing ?? null,
    morning_mood: s.morning?.mood ?? null,
    started_at: s.startedAt,
  }
}
