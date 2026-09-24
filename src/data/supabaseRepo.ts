import type { SupabaseClient } from '@supabase/supabase-js'
import { applyPatch, pause, restore, resume } from '@/domain/challenges'
import { parseDay } from '@/domain/date'
import { DEFAULT_DAY_GROUPS, DEFAULT_SETTINGS, type DayGroup } from '@/domain/types'
import { orderAfter } from './order'
import type { Repo } from './repo'
import {
  changedFields,
  challengeFromRow,
  challengeToRow,
  dayLogFromRow,
  dayLogToRow,
  dayStartFromRow,
  dayStartToRow,
  entriesFromRows,
  type ChallengeRow,
  type DayLogRow,
  type DayStartRow,
  type EntryRow,
} from './rows'

const CHALLENGE =
  'id, name, code, kind, measure, goal, unit, color, tag_ids, start_date, length_days, pauses, rules_locked, deleted_at, sort_order'
const DAY_LOG = 'day, mood, wellbeing, productivity, tags, note, closed_at'
const DAY_START = 'day, morning_sleep, morning_wellbeing, morning_mood, bed_min, wake_min, bed_how, wake_how, started_at'
/**
 * PostgREST отдаёт ограниченное число строк за раз (по умолчанию 1000, настраивается в проекте) — длинные
 * списки читаем страницами до пустой, не полагаясь на размер ответа.
 */
const PAGE = 1000

type Result<T> = { data: T | null; error: { code?: string; message: string } | null }

/** Ошибка postgrest — простой объект; наружу — настоящий `Error` с его текстом и кодом. */
function failure(error: { code?: string; message: string }): Error {
  return Object.assign(new Error(error.message), { code: error.code })
}

function ok<T>({ data, error }: Result<T>): T {
  if (error) throw failure(error)
  return data as T
}

const duplicate = (e: unknown) => (e as { code?: string } | null)?.code === '23505'

/**
 * Хранилище в Supabase (таблицы — `supabase/migrations`). Видит только строки вошедшего: RLS. Правила,
 * которые держит база (оценки 0–10, одно начало дня, замок), здесь не повторяются, кроме перевода её
 * отказов в те же ошибки, что у демо. Пауза, возврат и порядок — функции домена: прочитать, посчитать,
 * записать.
 */
export function createSupabaseRepo(db: SupabaseClient): Repo {
  async function uid() {
    const { data } = await db.auth.getSession()
    const id = data.session?.user.id
    if (!id) throw new Error('Не выполнен вход')
    return id
  }

  /** Все строки запроса — страницами до пустой; порядок задаёт `build`, он нужен для страниц. */
  async function all<T>(build: (from: number, to: number) => PromiseLike<Result<T[]>>): Promise<T[]> {
    const out: T[] = []
    for (;;) {
      const rows = ok(await build(out.length, out.length + PAGE - 1)) ?? []
      if (!rows.length) return out
      out.push(...rows)
    }
  }

  async function challengeRow(id: string): Promise<ChallengeRow | null> {
    return ok(await db.from('challenges').select(CHALLENGE).eq('id', id).maybeSingle<ChallengeRow>())
  }

  async function closedOn(day: string) {
    const log = ok(await db.from('day_logs').select('closed_at').eq('day', day).maybeSingle<{ closed_at: string | null }>())
    return Boolean(log?.closed_at)
  }

  async function saveChallenge(id: string, row: Partial<Omit<ChallengeRow, 'id'>>) {
    ok(await db.from('challenges').update(row).eq('id', id))
  }

  async function settingsRow() {
    return ok(
      await db
        .from('user_settings')
        .select('morning_until, day_groups')
        .maybeSingle<{ morning_until: number; day_groups: DayGroup[] }>(),
    )
  }

  return {
    async listChallenges() {
      const rows = await all<ChallengeRow>((from, to) =>
        db.from('challenges').select(CHALLENGE).order('sort_order').order('id').range(from, to),
      )
      return rows.map(challengeFromRow)
    },

    async listEntries() {
      const ids = await all<{ id: string }>((from, to) => db.from('challenges').select('id').order('id').range(from, to))
      const rows = await all<EntryRow>((from, to) =>
        db.from('entries').select('challenge_id, day, value').order('challenge_id').order('day').range(from, to),
      )
      return entriesFromRows(
        ids.map((r) => r.id),
        rows,
      )
    },

    async listDayLogs() {
      const rows = await all<DayLogRow>((from, to) => db.from('day_logs').select(DAY_LOG).order('day').range(from, to))
      return rows.map(dayLogFromRow)
    },

    async createChallenge(challenge) {
      const row = ok(await db.from('challenges').insert(challengeToRow(challenge)).select(CHALLENGE).single<ChallengeRow>())
      return challengeFromRow(row)
    },

    async updateChallenge(id, patch) {
      const row = await challengeRow(id)
      if (!row) return
      const before = challengeFromRow(row)
      /* тип меняется, пока нет отметок: спросить базу, только когда тип и правда меняют */
      let marked = false
      if (patch.kind !== undefined && patch.kind !== before.kind) {
        const { count, error } = await db.from('entries').select('day', { count: 'exact', head: true }).eq('challenge_id', id)
        if (error) throw failure(error)
        marked = (count ?? 0) > 0
      }
      const { id: _, ...next } = applyPatch(before, patch, marked)
      /* только изменённое: порядок, паузы и удаление могли поменяться другим запросом */
      const diff = changedFields(challengeToRow(before), challengeToRow(next))
      if (Object.keys(diff).length) await saveChallenge(id, diff)
    },

    async setPaused(id, paused, today) {
      const row = await challengeRow(id)
      if (!row) return
      const c = challengeFromRow(row)
      const closed = await closedOn(today)
      const day = parseDay(today)
      let next
      if (paused) {
        /* паузе нужна только сегодняшняя отметка — прицельно, а не весь список (он длиннее ответа) */
        const entries = ok(
          await db.from('entries').select('challenge_id, day, value').eq('challenge_id', id).eq('day', today),
        ) as EntryRow[]
        next = pause(c, entriesFromRows([id], entries)[id]!, day, closed)
      } else {
        next = resume(c, day, closed)
      }
      await saveChallenge(id, { pauses: next.pauses })
    },

    async deleteChallenge(id) {
      /* время клиента — как в оптимистичном обновлении экрана (queries.ts) */
      await saveChallenge(id, { deleted_at: new Date().toISOString() })
    },

    async restoreChallenge(id, today) {
      const row = await challengeRow(id)
      if (!row) return
      const next = restore(challengeFromRow(row), parseDay(today), await closedOn(today))
      await saveChallenge(id, { pauses: next.pauses, deleted_at: next.deletedAt })
    },

    async purgeChallenge(id) {
      /* отметки уходят каскадом */
      ok(await db.from('challenges').delete().eq('id', id))
    },

    async listTags() {
      const rows = ok(await db.from('tags').select('id, name')) as { id: string; name: string }[]
      return rows.map((t) => ({ id: t.id, name: t.name })).sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    },

    async createTag(name) {
      const clean = name.trim()
      if (!clean) throw new Error('Имя тега не может быть пустым')
      const { data, error } = await db.from('tags').insert({ name: clean }).select('id, name').single<{ id: string; name: string }>()
      if (duplicate(error)) throw new Error(`Тег «${clean}» уже есть`)
      if (error) throw failure(error)
      return { id: data!.id, name: data!.name }
    },

    async deleteTag(id) {
      /* со всех челленджей тег снимает триггер базы в той же транзакции */
      ok(await db.from('tags').delete().eq('id', id))
    },

    async setEntry(challengeId, day, value) {
      if (value === undefined) {
        ok(await db.from('entries').delete().eq('challenge_id', challengeId).eq('day', day))
      } else {
        ok(await db.from('entries').upsert({ challenge_id: challengeId, day, value }, { onConflict: 'challenge_id,day' }))
      }
    },

    async saveDayLog(log) {
      ok(await db.from('day_logs').upsert({ ...dayLogToRow(log), user_id: await uid() }, { onConflict: 'user_id,day' }))
    },

    async listDayStarts() {
      const rows = await all<DayStartRow>((from, to) => db.from('day_starts').select(DAY_START).order('day').range(from, to))
      return rows.map(dayStartFromRow)
    },

    async startDay(start) {
      const { error } = await db.from('day_starts').insert(dayStartToRow(start))
      if (duplicate(error)) throw new Error(`День ${start.day} уже начат: утро не правится`)
      if (error) throw failure(error)
    },

    async getSettings() {
      const row = await settingsRow()
      return row ? { morningUntil: row.morning_until } : { ...DEFAULT_SETTINGS }
    },

    async saveSettings(settings) {
      ok(
        await db
          .from('user_settings')
          .upsert({ user_id: await uid(), morning_until: settings.morningUntil }, { onConflict: 'user_id' }),
      )
    },

    async reorderChallenges(orderedIds) {
      const rows = ok(await db.from('challenges').select('id, sort_order')) as { id: string; sort_order: number }[]
      const order = orderAfter(
        rows.map((r) => ({ id: r.id, sortOrder: r.sort_order })),
        orderedIds,
      )
      /* одним запросом: весь порядок меняется целиком или никак (миграция reorder_challenges) */
      ok(await db.rpc('reorder_challenges', { ids: order }))
    },

    async getDayGroups() {
      const row = await settingsRow()
      return row ? [...row.day_groups] : [...DEFAULT_DAY_GROUPS]
    },

    async saveDayGroups(groups) {
      ok(await db.from('user_settings').upsert({ user_id: await uid(), day_groups: [...groups] }, { onConflict: 'user_id' }))
    },
  }
}
