import { addDays, dayKey, isoDow, parseDay } from '@/domain/date'
import { pausedOn } from '@/domain/pauses'
import { SCORE_MAX, SCORE_MIN } from '@/domain/score'
import type { Challenge, DayLog, EntryMap, Tag } from '@/domain/types'
import { NOTES, clamp, mulberry32, type Seed } from './common'

/*
 * Полное демо — 120 дней и шесть челленджей. Это ещё и приёмочный тест аналитики
 * (domain/effects.acceptance.test.ts): связи в нём заложены известные.
 */

/** Сколько дней истории насыпает сид. */
const DAYS_BACK = 120

/**
 * Челленджи прототипа. `startsAgo` — за сколько дней до «сегодня» начался челлендж,
 * `tag` — имя тега: при сиде из них собирается список тегов, а челлендж получает ссылку.
 * `pausedAgo` — сколько дней назад челлендж поставили на паузу, которая идёт до сих пор.
 */
type Blueprint = Omit<Challenge, 'startDate' | 'tagIds' | 'pauses' | 'rulesLocked' | 'deletedAt'> & {
  startsAgo: number
  tag: string
  pausedAgo?: number
}

const BLUEPRINT: Blueprint[] = [
  { id: 'push', code: 'ОТЖ', name: '30 дней отжимаюсь', kind: 'do', measure: 'count', goal: 30, unit: 'раз', color: 'var(--chart-1)', tag: 'тело', lengthDays: 30, sortOrder: 0, startsAgo: 20 },
  { id: 'smoke', code: 'БСГ', name: 'Без сигарет', kind: 'quit', measure: 'binary', goal: 1, unit: null, color: 'var(--chart-2)', tag: 'здоровье', lengthDays: null, sortOrder: 1, startsAgo: 99 },
  { id: 'read', code: 'ЧТН', name: 'Читать 20 страниц', kind: 'do', measure: 'binary', goal: 1, unit: null, color: 'var(--chart-3)', tag: 'ум', lengthDays: null, sortOrder: 2, startsAgo: 81 },
  { id: 'step', code: 'ШАГ', name: '10 000 шагов', kind: 'do', measure: 'count', goal: 10000, unit: 'шагов', color: 'var(--chart-4)', tag: 'тело', lengthDays: null, sortOrder: 3, startsAgo: 81 },
  { id: 'sugar', code: 'БСХ', name: 'Без сахара', kind: 'quit', measure: 'binary', goal: 1, unit: null, color: 'var(--chart-5)', tag: 'еда', lengthDays: null, sortOrder: 4, startsAgo: 42 },
  { id: 'eng', code: 'АНГ', name: 'Английский 30 минут', kind: 'do', measure: 'binary', goal: 1, unit: null, color: 'var(--chart-6)', tag: 'ум', lengthDays: null, sortOrder: 5, startsAgo: 112, pausedAgo: 25 },
]


/** Насыпает историю: челленджи прототипа, отметки и итоги дней за DAYS_BACK дней. */
export function seedFull(today: Date, seed: number): Seed {
  const rnd = mulberry32(seed)

  /* Теги — в порядке первого появления: у сида должны быть одинаковые id от запуска к запуску. */
  const tags: Tag[] = []
  const tagIdOf = (name: string) => {
    let tag = tags.find((t) => t.name === name)
    if (!tag) {
      tag = { id: `tag-${tags.length + 1}`, name }
      tags.push(tag)
    }
    return tag.id
  }

  const challenges: Challenge[] = BLUEPRINT.map(({ startsAgo, tag, pausedAgo, ...rest }) => ({
    ...rest,
    tagIds: [tagIdOf(tag)],
    startDate: dayKey(addDays(today, -startsAgo)),
    pauses: pausedAgo === undefined ? [] : [{ from: dayKey(addDays(today, -pausedAgo)), to: null }],
    rulesLocked: false,
    deletedAt: null,
  })).sort((a, b) => a.sortOrder - b.sortOrder)

  const entries: Record<string, EntryMap> = {}
  const logs = new Map<string, DayLog>()
  for (const c of challenges) entries[c.id] = {}

  /*
   * Сид — ещё и приёмочный тест аналитики (domain/effects.acceptance.test.ts), поэтому связи
   * в нём заложены известные:
   * — энергия дня тянется от вчерашней (как в жизни: хорошие дни идут полосами) и двигает
   *   и отметки, и оценки того же дня — ложная связь «в тот же день» у ЧТН и остальных;
   * — ШАГ, выполненный вчера, поднимает сегодня самочувствие и настроение — настоящий эффект;
   * — алкоголь бьёт не по своему дню, а по следующему — похмелье;
   * — АНГ — чистый шум.
   */
  let drift = 0
  let walkedYesterday = false
  let drankYesterday = false

  for (let back = DAYS_BACK - 1; back >= 0; back--) {
    const date = addDays(today, -back)
    const key = dayKey(date)
    const weekday = isoDow(date)
    const weekend = weekday >= 5
    drift = 0.35 * drift + Math.sqrt(1 - 0.35 ** 2) * (rnd() - 0.5)
    const energy = (drift + 0.5) * 0.55 + (weekend ? 0.12 : 0.42) + (weekday === 0 ? 0.08 : 0)
    let walked = false

    for (const c of challenges) {
      const start = parseDay(c.startDate)
      if (date < start) continue
      if (c.lengthDays && date >= addDays(start, c.lengthDays)) continue
      /* Дни паузы — без отметок: в них челлендж не участвует. */
      if (pausedOn(c, key)) continue

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
      if (c.id === 'step') {
        const steps = Math.round(4200 + energy * 7600 + rnd() * 2200)
        entries[c.id]![key] = steps
        walked = steps >= c.goal
      }
      if (c.id === 'read' && (energy > 0.58 || rnd() < 0.3)) entries[c.id]![key] = 1
      if (c.id === 'eng' && rnd() < 0.62) entries[c.id]![key] = 1
    }

    const afterWalk = walkedYesterday
    const hangover = drankYesterday
    walkedYesterday = walked
    drankYesterday = false

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
    maybe(weekend ? 0.35 : 0.1, 'алкоголь')
    maybe(0.1, 'дорога')
    maybe(weekend ? 0 : 0.2, 'встречи')
    maybe(0.06, 'ссора')
    maybe(0.12, 'учёба')
    maybe(weekend ? 0.25 : 0, 'отдых')

    const has = (t: string) => tags.includes(t)
    drankYesterday = has('алкоголь')
    const mood = clamp(
      Math.round(
        3.6 + energy * 5.4 + rnd() * 1.4 - (has('ссора') ? 2.6 : 0) - (has('болел') ? 1.8 : 0) + (has('отдых') ? 0.8 : 0) +
          (afterWalk ? 1.5 : 0),
      ),
      SCORE_MIN,
      SCORE_MAX,
    )
    const wellbeing = clamp(
      Math.round(
        3.8 + energy * 4.8 + rnd() * 1.2 - (has('мало спал') ? 2.4 : 0) - (has('болел') ? 3.4 : 0) +
          (afterWalk ? 3 : 0) - (hangover ? 3 : 0),
      ),
      SCORE_MIN,
      SCORE_MAX,
    )
    const productivity = clamp(
      Math.round(
        2.9 + energy * 5.6 + rnd() * 1.3 + (has('дедлайн') ? 1.4 : 0) - (has('болел') ? 3 : 0) - (has('выходной') ? 1.6 : 0) -
          (hangover ? 2 : 0),
      ),
      SCORE_MIN,
      SCORE_MAX,
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

  return { challenges, entries, logs: [...logs.values()], tags }
}
