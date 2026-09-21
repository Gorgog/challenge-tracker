import { addDays, dayKey, isoDow } from '@/domain/date'
import { SCORE_MAX, SCORE_MIN } from '@/domain/score'
import type { Challenge, DayLog, DayStart, EntryMap, Tag } from '@/domain/types'
import {
  NOTES,
  SKIP_MORNING,
  clamp,
  morningNoise,
  morningStream,
  mulberry32,
  sleepScore,
  startedAt,
  type Seed,
} from './common'

/*
 * Демо «Выход из выгорания» — месяц по сегодня. Человек прокрастинировал и выгорел; начал иногда
 * нормально спать, стал выходить гулять, читает три раза в неделю, английский забросил, тридцать
 * дней отжимается по десять раз, пьёт пиво раз-два в будни.
 *
 * Заложено: прогулка вчера → сегодня лучше самочувствие и настроение; пиво вчера → сегодня хуже
 * самочувствие и продуктивность; недосып (сон 1–4 утром) бьёт по своему дню. Чтение — по
 * расписанию, нейтрально. Утро — состояние начала дня, до событий дня.
 * Ловушка: прогулок становится больше вместе с общим подъёмом, и этот подъём нельзя приписать им.
 */

/** Месяц истории по сегодня. */
const DAYS = 30

type Blueprint = Omit<Challenge, 'startDate' | 'tagIds' | 'pauses' | 'rulesLocked' | 'deletedAt'> & {
  tag: string
}

const BLUEPRINT: Blueprint[] = [
  { id: 'push', code: 'ОТЖ', name: '30 дней отжимаюсь', kind: 'do', measure: 'count', goal: 10, unit: 'раз', color: 'var(--chart-1)', tag: 'тело', lengthDays: 30, sortOrder: 0 },
  { id: 'step', code: 'ШАГ', name: '10 000 шагов', kind: 'do', measure: 'count', goal: 10000, unit: 'шагов', color: 'var(--chart-4)', tag: 'тело', lengthDays: null, sortOrder: 1 },
  { id: 'read', code: 'ЧТН', name: 'Читать 20 страниц', kind: 'do', measure: 'binary', goal: 1, unit: null, color: 'var(--chart-3)', tag: 'ум', lengthDays: null, sortOrder: 2 },
  { id: 'eng', code: 'АНГ', name: 'Английский 30 минут', kind: 'do', measure: 'binary', goal: 1, unit: null, color: 'var(--chart-6)', tag: 'ум', lengthDays: null, sortOrder: 3 },
]

/** Чтение по расписанию — понедельник, среда, суббота: три раза в неделю. */
const READING_DAYS = new Set([0, 2, 5])

const BURNOUT_NOTES = {
  low: ['Опять весь день откладывал.', 'Сил ни на что, сидел в телефоне.', 'Работа стоит, а заставить себя не могу.'],
  high: ['Впервые за долгое время всё сделал.', 'Прогулка вытащила — голова ясная.', 'Выспался — и день совсем другой.'],
}

export function seedBurnout(today: Date, seed: number): Seed {
  const rnd = mulberry32(seed)

  /* Теги — в порядке первого появления: у сида одинаковые id от запуска к запуску. */
  const tags: Tag[] = []
  const tagIdOf = (name: string) => {
    let tag = tags.find((t) => t.name === name)
    if (!tag) {
      tag = { id: `tag-${tags.length + 1}`, name }
      tags.push(tag)
    }
    return tag.id
  }

  /* Всё заведено в первый день месяца: история начинается с решения выбираться. */
  const start = dayKey(addDays(today, -(DAYS - 1)))
  const challenges: Challenge[] = BLUEPRINT.map(({ tag, ...rest }) => ({
    ...rest,
    tagIds: [tagIdOf(tag)],
    startDate: start,
    pauses: [],
    rulesLocked: false,
    deletedAt: null,
  }))

  const entries: Record<string, EntryMap> = {}
  for (const c of challenges) entries[c.id] = {}
  const logs: DayLog[] = []
  const starts: DayStart[] = []
  const mrnd = morningStream(seed)
  const score = (value: number) => clamp(Math.round(value), SCORE_MIN, SCORE_MAX)

  /**
   * Утро — состояние начала дня: общий подъём, фон дня, сон, болезнь, вчерашняя прогулка и
   * похмелье. События дня (ссора, дедлайн, отдых) в утро не попадают.
   */
  const morningOf = (
    date: Date,
    progress: number,
    drift: number,
    short: boolean,
    sick: boolean,
    afterWalk: boolean,
    hangover: boolean,
  ): DayStart => {
    const day = dayKey(date)
    const at = startedAt(date, mrnd)
    if (mrnd() < SKIP_MORNING) return { day, morning: null, startedAt: at }
    return {
      day,
      startedAt: at,
      morning: {
        sleep: sleepScore(short, mrnd),
        wellbeing: score(
          3.5 + 2.5 * progress + 2 * drift + morningNoise(mrnd) - (short ? 2 : 0) - (sick ? 3 : 0) +
            (afterWalk ? 1.5 : 0) - (hangover ? 2 : 0),
        ),
        mood: score(3.5 + 3 * progress + 2 * drift + morningNoise(mrnd) - (sick ? 1.8 : 0) + (afterWalk ? 1 : 0)),
      },
    }
  }

  let drift = 0
  let walkedYesterday = false
  let drankYesterday = false

  for (let back = DAYS - 1; back >= 0; back--) {
    const date = addDays(today, -back)
    const key = dayKey(date)
    const weekday = isoDow(date)
    const weekend = weekday >= 5
    /* Выход из выгорания: 0 — месяц назад, 1 — сегодня. */
    const progress = (DAYS - 1 - back) / (DAYS - 1)
    drift = 0.35 * drift + Math.sqrt(1 - 0.35 ** 2) * (rnd() - 0.5)

    entries['push']![key] = 10
    const walked = rnd() < 0.2 + 0.4 * progress
    entries['step']![key] = walked ? 10000 + Math.round(rnd() * 2500) : 2500 + Math.round(rnd() * 5000)
    if (rnd() < (READING_DAYS.has(weekday) ? 0.85 : 0.05)) entries['read']![key] = 1
    /* Английский заведён и заброшен — отметок нет. */

    const afterWalk = walkedYesterday
    const hangover = drankYesterday
    walkedYesterday = walked
    drankYesterday = false

    /* Сегодня день ещё не начат: после сброса видно, как день начинается. */
    if (back === 0) continue
    /* Позавчерашний день начат, но не закрыт — виден долг по оценкам. Итога нет, поэтому и
       недосып берётся из утренней последовательности. */
    if (back === 2) {
      starts.push(morningOf(date, progress, drift, mrnd() < 0.6 - 0.45 * progress, false, afterWalk, hangover))
      continue
    }

    const dayTags: string[] = []
    const maybe = (chance: number, tag: string) => {
      if (rnd() < chance) dayTags.push(tag)
    }
    maybe(weekend ? 0.75 : 0, 'выходной')
    maybe(weekend ? 0 : 0.15, 'дедлайн')
    maybe(0.03, 'болел')
    /* Недосып — та же случайная величина, из которой раньше выпадал тег «мало спал»: вечер прежний. */
    const short = rnd() < 0.6 - 0.45 * progress
    maybe(weekend ? 0 : 0.3, 'алкоголь')
    maybe(0.05, 'дорога')
    maybe(weekend ? 0 : 0.2, 'встречи')
    maybe(0.04, 'ссора')
    maybe(0.1, 'учёба')
    maybe(weekend ? 0.25 : 0, 'отдых')
    const has = (t: string) => dayTags.includes(t)
    drankYesterday = has('алкоголь')

    const mood = score(
      3.5 + 3 * progress + 2 * drift + rnd() * 1.2 - (has('ссора') ? 2.5 : 0) - (has('болел') ? 1.8 : 0) +
        (has('отдых') ? 0.8 : 0) + (afterWalk ? 1 : 0),
    )
    const wellbeing = score(
      3.5 + 2.5 * progress + 2 * drift + rnd() * 1.2 - (short ? 2 : 0) - (has('болел') ? 3 : 0) +
        (afterWalk ? 1.5 : 0) - (hangover ? 2 : 0),
    )
    const productivity = score(
      2.5 + 4 * progress + 2 * drift + rnd() * 1.2 - (short ? 1 : 0) - (has('болел') ? 2.5 : 0) +
        (has('дедлайн') ? 1 : 0) - (has('выходной') ? 1 : 0) - (hangover ? 1.5 : 0),
    )

    let note = ''
    const tagged = dayTags.find((t) => NOTES.tagged[t])
    if (tagged && rnd() < 0.7) note = NOTES.tagged[tagged]!
    else if (rnd() < 0.5) {
      const pool =
        mood <= 4 ? [...NOTES.low, ...BURNOUT_NOTES.low] : mood >= 7 ? [...NOTES.high, ...BURNOUT_NOTES.high] : NOTES.mid
      note = pool[Math.floor(rnd() * pool.length)]!
    }

    starts.push(morningOf(date, progress, drift, short, has('болел'), afterWalk, hangover))
    logs.push({ day: key, mood, wellbeing, productivity, tags: dayTags, note, closedAt: `${key}T21:00:00.000Z` })
  }

  /* Сегодня день не начат, а отмечать можно только в начатый день — сегодняшних отметок нет.
     Числа на них всё равно вытянуты: основная последовательность не сдвигается. */
  for (const map of Object.values(entries)) delete map[dayKey(today)]

  return { challenges, entries, logs, starts, tags }
}
