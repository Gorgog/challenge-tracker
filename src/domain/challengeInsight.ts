import { daysBetween, parseDay } from './date'
import { LINK_DAYS, LINK_MIN } from './links'
import { activeDays, dayOutcome, lastDay } from './streaks'
import { round1, stateOf, type TimelineDay } from './timeline'
import type { Challenge, EntryMap } from './types'

/*
 * Челленджи в аналитике (срез 2, макет «Челленджи»): сначала прогресс, потом — можно ли честно сравнивать.
 * Чисел влияния нет, пока при создании не спрашиваем «на что жду влияния». Отказы не сравниваются:
 * день без отметки у них — «выдержал», а это может быть и «не записал» (до явного «Да, без»).
 */

/** Утро в дни пропуска хуже на столько — сравнение «выполнил / пропустил» нечестное. */
export const BAD_MORNING = 0.7
/** Утр в каждой группе меньше — проверить нельзя. */
const MORNINGS_MIN = 3
/** «Чаще пропуск после» — от стольких раз и во столько раз чаще, чем перед выполнением. */
const AFTER_MIN = 3
const AFTER_RATIO = 2
/** Начались не дальше стольких дней друг от друга — «почти вместе». */
export const TOGETHER_DAYS = 3

export type HabitInsight = {
  /** Пропуски и выполнения в окне связей (прошедшие дни). */
  misses: number
  done: number
  /** 5 + 5 есть. */
  enough: boolean
  /** Средние утра в дни пропуска и выполнения; утр мало — null. */
  mornings: { miss: number; hit: number } | null
  /** Утро в дни пропуска хуже на `BAD_MORNING` — true; проверить нельзя — null. */
  unfair: boolean | null
  /** Теги прошлого вечера, чаще встречавшиеся перед пропуском. */
  after: { tag: string; count: number }[]
}

export type Insight = {
  /** День челленджа с сегодняшним, без пауз. */
  day: number
  of: number | null
  ended: boolean
  /** Выполнено из прошедших дней челленджа. */
  hits: number
  known: number
  habit: HabitInsight | null
}

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length

function habitInsight(c: Challenge, entries: EntryMap, history: TimelineDay[], today: Date): HabitInsight {
  const window = history.slice(-LINK_DAYS)
  const days = window.map((d, i) => ({ d, prev: i > 0 ? window[i - 1]! : null, o: dayOutcome(c, entries, parseDay(d.day), today) }))
  const miss = days.filter((x) => x.o === 'miss')
  const hit = days.filter((x) => x.o === 'hit')
  const morningsOf = (l: typeof days) => l.flatMap((x) => (x.d.morning ? [stateOf(x.d.morning)!] : []))
  const mm = morningsOf(miss)
  const hm = morningsOf(hit)
  const mornings = mm.length >= MORNINGS_MIN && hm.length >= MORNINGS_MIN ? { miss: round1(mean(mm)), hit: round1(mean(hm)) } : null

  const closedPrev = (l: typeof days) => l.filter((x) => x.prev?.evening)
  const missPrev = closedPrev(miss)
  const hitPrev = closedPrev(hit)
  const tags = [...new Set(missPrev.flatMap((x) => x.prev!.tags))]
  const after = tags
    .map((tag) => ({
      tag,
      count: missPrev.filter((x) => x.prev!.tags.includes(tag)).length,
      rest: hitPrev.filter((x) => x.prev!.tags.includes(tag)).length,
    }))
    .filter((t) => t.count >= AFTER_MIN && (!hitPrev.length || t.count / missPrev.length >= (AFTER_RATIO * t.rest) / hitPrev.length))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'ru'))
    .map(({ tag, count }) => ({ tag, count }))

  return {
    misses: miss.length,
    done: hit.length,
    enough: miss.length >= LINK_MIN && hit.length >= LINK_MIN,
    mornings,
    unfair: mornings ? mornings.miss <= mornings.hit - BAD_MORNING : null,
    after,
  }
}

/** Прогресс челленджа и — у привычки — можно ли честно сравнивать дни с ним и без. */
export function challengeInsight(c: Challenge, entries: EntryMap, history: TimelineDay[], today: Date): Insight {
  const past = activeDays(c, today)
  const outcomes = past.map((d) => dayOutcome(c, entries, parseDay(d), today))
  const end = lastDay(c)
  return {
    day: past.length + (dayOutcome(c, entries, today, today) === 'outside' ? 0 : 1),
    of: c.lengthDays,
    ended: end !== null && daysBetween(end, today) > 0,
    hits: outcomes.filter((o) => o === 'hit').length,
    /* прошедшие дни без пауз — только «выполнено» или «пропуск» */
    known: outcomes.length,
    habit: c.kind === 'do' ? habitInsight(c, entries, history, today) : null,
  }
}

/** Группы челленджей, начавшихся почти вместе (сосед ближе `TOGETHER_DAYS` дней): их влияние не разделить. */
export function startedTogether(challenges: Challenge[]): Challenge[][] {
  const sorted = [...challenges].sort((a, b) => a.startDate.localeCompare(b.startDate))
  const groups: Challenge[][] = []
  for (const c of sorted) {
    const last = groups[groups.length - 1]
    const prev = last?.[last.length - 1]
    if (last && prev && daysBetween(parseDay(prev.startDate), parseDay(c.startDate)) <= TOGETHER_DAYS) last.push(c)
    else groups.push([c])
  }
  return groups.filter((g) => g.length > 1)
}
