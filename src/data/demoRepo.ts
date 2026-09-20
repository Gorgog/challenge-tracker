import { addDays, dayKey, isoDow, parseDay, todayKey } from '@/domain/date'
import type { Challenge, DayLog, EntryMap } from '@/domain/types'
import type { Repo } from './repo'

/** Сколько дней истории насыпает сид. */
const DAYS_BACK = 120

/** Челленджи прототипа. `startsAgo` — за сколько дней до «сегодня» начался челлендж. */
const BLUEPRINT: (Omit<Challenge, 'startDate'> & { startsAgo: number })[] = [
  { id: 'push', code: 'ОТЖ', name: '30 дней отжимаюсь', kind: 'do', measure: 'count', goal: 30, unit: 'раз', color: 'var(--chart-1)', tag: 'тело', lengthDays: 30, status: 'active', sortOrder: 0, startsAgo: 20 },
  { id: 'smoke', code: 'БСГ', name: 'Без сигарет', kind: 'quit', measure: 'binary', goal: 1, unit: null, color: 'var(--chart-2)', tag: 'здоровье', lengthDays: null, status: 'active', sortOrder: 1, startsAgo: 99 },
  { id: 'read', code: 'ЧТН', name: 'Читать 20 страниц', kind: 'do', measure: 'binary', goal: 1, unit: null, color: 'var(--chart-3)', tag: 'ум', lengthDays: null, status: 'active', sortOrder: 2, startsAgo: 81 },
  { id: 'step', code: 'ШАГ', name: '10 000 шагов', kind: 'do', measure: 'count', goal: 10000, unit: 'шагов', color: 'var(--chart-4)', tag: 'тело', lengthDays: null, status: 'active', sortOrder: 3, startsAgo: 81 },
  { id: 'sugar', code: 'БСХ', name: 'Без сахара', kind: 'quit', measure: 'binary', goal: 1, unit: null, color: 'var(--chart-5)', tag: 'еда', lengthDays: null, status: 'active', sortOrder: 4, startsAgo: 42 },
  { id: 'eng', code: 'АНГ', name: 'Английский 30 минут', kind: 'do', measure: 'binary', goal: 1, unit: null, color: 'var(--chart-6)', tag: 'ум', lengthDays: null, status: 'paused', sortOrder: 5, startsAgo: 112 },
]

const NOTES = {
  high: [
    'Хороший день. Успел и поработать, и погулять.',
    'Наконец-то разгрёб хвосты — дышится легче.',
    'Редкий день, когда всё по плану.',
    'Утро задалось, и дальше по накатанной.',
  ],
  mid: [
    'Обычный день, ничего особенного.',
    'Половину задач сделал, половину перенёс.',
    'Вечером сил уже не было, но день нормальный.',
    'Всё ровно, без взлётов.',
  ],
  low: [
    'Тяжело. Весь день как в тумане.',
    'Ничего не успел, злюсь на себя.',
    'Опять лёг под утро — весь день сломан.',
    'Много суеты, толку ноль.',
  ],
  tagged: {
    дедлайн: 'Весь день в задаче, к вечеру выжат.',
    болел: 'Провалялся с температурой.',
    ссора: 'Поругались вечером, настроение на нуле.',
    дорога: 'Полдня в пути, вымотался.',
    алкоголь: 'Посидели с друзьями — завтра будет тяжело.',
  } as Record<string, string>,
}

/** Генератор из прототипа: одно зерно — одна и та же история. */
function mulberry32(seed: number) {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export type DemoOptions = {
  /** «Сегодня» для сида. По умолчанию — реальная текущая дата. */
  today?: Date
  seed?: number
}

/**
 * Демо-репозиторий в памяти. Нужен, чтобы переносить и править интерфейс на живых данных,
 * пока схема в Supabase не готова. Данные держатся до перезагрузки страницы.
 */
export function createDemoRepo(options: DemoOptions = {}): Repo {
  const today = options.today ?? parseDay(todayKey())
  const rnd = mulberry32(options.seed ?? 20260921)

  const challenges: Challenge[] = BLUEPRINT.map(({ startsAgo, ...rest }) => ({
    ...rest,
    startDate: dayKey(addDays(today, -startsAgo)),
  })).sort((a, b) => a.sortOrder - b.sortOrder)

  const entries: Record<string, EntryMap> = {}
  const logs = new Map<string, DayLog>()
  for (const c of challenges) entries[c.id] = {}

  for (let back = DAYS_BACK - 1; back >= 0; back--) {
    const date = addDays(today, -back)
    const key = dayKey(date)
    const weekday = isoDow(date)
    const weekend = weekday >= 5
    const energy = rnd() * 0.55 + (weekend ? 0.12 : 0.42) + (weekday === 0 ? 0.08 : 0)

    for (const c of challenges) {
      const start = parseDay(c.startDate)
      if (date < start) continue
      if (c.lengthDays && date >= addDays(start, c.lengthDays)) continue
      /* Пауза включена недавно — до неё история есть, после неё отметок нет. */
      if (c.status === 'paused' && back < 26) continue

      /* Отказ: запись появляется ТОЛЬКО при срыве. Выдержанный день — пустота, а не единица. */
      if (c.kind === 'quit') {
        const relapse =
          c.id === 'smoke'
            ? back === 63 || back === 40
            : energy < 0.62 && rnd() < (weekend ? 0.34 : 0.11)
        if (relapse) entries[c.id]![key] = 0
        continue
      }

      /* Привычка: день без записи — пропуск. Ноль не пишем, пишем реально сделанное. */
      if (c.id === 'push') {
        if (energy > 0.52) entries[c.id]![key] = 30 + Math.round(rnd() * 14)
        else if (rnd() < 0.5) entries[c.id]![key] = Math.round(rnd() * 22)
      }
      if (c.id === 'step') entries[c.id]![key] = Math.round(4200 + energy * 7600 + rnd() * 2200)
      if (c.id === 'read' && (energy > 0.58 || rnd() < 0.3)) entries[c.id]![key] = 1
      if (c.id === 'eng' && rnd() < 0.62) entries[c.id]![key] = 1
    }

    /* Сегодняшний день ещё идёт — итога у него нет. Позавчерашний оставлен незакрытым:
       на нём видно, как работает долг по оценкам. */
    if (back === 0 || back === 2) continue

    const tags: string[] = []
    const maybe = (chance: number, tag: string) => {
      if (rnd() < chance) tags.push(tag)
    }
    maybe(weekend ? 0.75 : 0, 'выходной')
    maybe(weekend ? 0 : 0.22, 'дедлайн')
    maybe(0.07, 'болел')
    maybe(energy < 0.55 ? 0.4 : 0, 'мало спал')
    maybe(weekend ? 0.3 : 0, 'алкоголь')
    maybe(0.1, 'дорога')
    maybe(weekend ? 0 : 0.2, 'встречи')
    maybe(0.06, 'ссора')
    maybe(0.12, 'учёба')
    maybe(weekend ? 0.25 : 0, 'отдых')

    const has = (t: string) => tags.includes(t)
    const mood = clamp(
      Math.round(
        3.6 + energy * 5.4 + rnd() * 1.4 - (has('ссора') ? 2.6 : 0) - (has('болел') ? 1.8 : 0) + (has('отдых') ? 0.8 : 0),
      ),
      1,
      10,
    )
    const wellbeing = clamp(
      Math.round(
        3.8 + energy * 4.8 + rnd() * 1.2 - (has('мало спал') ? 2.4 : 0) - (has('болел') ? 3.4 : 0) - (has('алкоголь') ? 1.2 : 0),
      ),
      1,
      10,
    )
    const productivity = clamp(
      Math.round(
        2.9 + energy * 5.6 + rnd() * 1.3 + (has('дедлайн') ? 1.4 : 0) - (has('болел') ? 3 : 0) - (has('выходной') ? 1.6 : 0),
      ),
      1,
      10,
    )

    let note = ''
    const tagged = tags.find((t) => NOTES.tagged[t])
    if (tagged && rnd() < 0.7) note = NOTES.tagged[tagged]!
    else if (rnd() < 0.42) {
      const pool = mood >= 8 ? NOTES.high : mood <= 4 ? NOTES.low : NOTES.mid
      note = pool[Math.floor(rnd() * pool.length)]!
    }

    logs.set(key, { day: key, mood, wellbeing, productivity, tags, note, closedAt: `${key}T21:00:00.000Z` })
  }

  let lastId = 0

  /* Наружу отдаём копии: кэш запросов не должен делить объекты с хранилищем. */
  const snapshotEntries = () =>
    Object.fromEntries(Object.entries(entries).map(([id, map]) => [id, { ...map }]))

  return {
    async listChallenges() {
      return challenges.map((c) => ({ ...c }))
    },
    async listEntries() {
      return snapshotEntries()
    },
    async listDayLogs() {
      return [...logs.values()]
        .map((l) => ({ ...l, tags: [...l.tags] }))
        .sort((a, b) => a.day.localeCompare(b.day))
    },
    async createChallenge(draft) {
      const created: Challenge = { ...draft, id: `ch-${++lastId}` }
      challenges.push(created)
      entries[created.id] = {}
      return { ...created }
    },
    async setEntry(challengeId, day, value) {
      const map = (entries[challengeId] ??= {})
      if (value === undefined) delete map[day]
      else map[day] = value
    },
    async saveDayLog(log) {
      logs.set(log.day, { ...log, tags: [...log.tags] })
    },
  }
}
