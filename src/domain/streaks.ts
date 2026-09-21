import { addDays, dayKey, daysBetween, parseDay } from './date'
import { pausedOn } from './pauses'
import type { Challenge, EntryMap, Outcome } from './types'

/**
 * Последний день ограниченного челленджа — тот, на котором набрано `lengthDays` дней
 * вне пауз: пауза отодвигает финиш на свою длину. null — челлендж бессрочный или финиш
 * пока неизвестен: пауза, начатая до него, ещё не закрыта. Кривой срок из испорченных
 * данных (дробный, неположительный) считается бессрочным.
 *
 * Считается по паузам, а не по дням: функцию зовёт `dayOutcome` на каждый день истории,
 * и перебор дней сделал бы статистику квадратичной, а опечатку в сроке — зависанием.
 */
export function lastDay(c: Challenge): Date | null {
  const length = c.lengthDays
  if (!length || !Number.isInteger(length) || length < 1) return null

  let end = addDays(parseDay(c.startDate), length - 1)
  /* Первый день, который ещё не учтён паузами, — чтобы перекрытые паузы не сдвигали дважды.
     Сравниваются даты, а не ключи: у огромного срока год пятизначный, и строки врут. */
  let cursor = parseDay(c.startDate)
  const pauses = [...c.pauses].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))
  for (const p of pauses) {
    const pauseFrom = parseDay(p.from)
    if (daysBetween(end, pauseFrom) > 0) break
    if (p.to === null) return null
    const pauseTo = parseDay(p.to)
    const from = daysBetween(cursor, pauseFrom) > 0 ? pauseFrom : cursor
    if (daysBetween(from, pauseTo) < 0) continue
    end = addDays(end, daysBetween(from, pauseTo) + 1)
    cursor = addDays(pauseTo, 1)
  }
  /* Срок за пределами календаря даёт битую дату — такой срок считается бессрочным. */
  return Number.isNaN(end.getTime()) ? null : end
}

/**
 * Что случилось с челленджем в конкретный день.
 *
 * Привычка: запись есть — сравниваем с целью; записи нет — пропуск, но только для
 * прошедших дней, сегодняшний ещё идёт.
 * Отказ: день засчитывается сам, запись появляется только когда отмечен срыв.
 * День паузы — вне челленджа, как и дни до старта и после финиша.
 */
export function dayOutcome(c: Challenge, entries: EntryMap, day: Date, today: Date): Outcome {
  const start = parseDay(c.startDate)
  if (daysBetween(start, day) < 0) return 'outside'
  if (pausedOn(c, dayKey(day))) return 'outside'
  const end = lastDay(c)
  if (end && daysBetween(end, day) > 0) return 'outside'
  if (daysBetween(today, day) > 0) return 'outside'

  const value = entries[dayKey(day)]
  const isToday = daysBetween(today, day) === 0

  if (c.kind === 'quit') return value === 0 ? 'miss' : 'hit'

  if (value === undefined) return isToday ? 'pending' : 'miss'
  if (value >= c.goal) return 'hit'
  return isToday ? 'pending' : 'miss'
}

/**
 * Прошедшие дни, за которые челлендж отвечает. Сегодняшний не входит: он ещё не закончен.
 * Дни паузы не входят тоже.
 */
export function activeDays(c: Challenge, today: Date): string[] {
  const start = parseDay(c.startDate)
  const end = lastDay(c)
  const lastPassed = addDays(today, -1)
  const until = end && daysBetween(end, lastPassed) > 0 ? end : lastPassed

  const out: string[] = []
  for (let d = start; daysBetween(d, until) >= 0; d = addDays(d, 1)) {
    const key = dayKey(d)
    if (!pausedOn(c, key)) out.push(key)
  }
  return out
}

/**
 * Текущая серия. Для привычки счёт начинается со вчера, если сегодня ещё не отмечено —
 * незаконченный день не должен обнулять серию. Для отказа сегодняшний день идёт в счёт
 * сразу, а отмеченный срыв обрывает серию немедленно. Пауза серию замораживает:
 * её дни не рвут счёт и не прибавляют к нему.
 */
export function currentStreak(c: Challenge, entries: EntryMap, today: Date): number {
  let day = today
  const todayOutcome = dayOutcome(c, entries, today, today)
  if (todayOutcome === 'miss') return 0
  if (todayOutcome !== 'hit') day = addDays(today, -1)

  let streak = 0
  for (;;) {
    if (pausedOn(c, dayKey(day))) {
      day = addDays(day, -1)
      continue
    }
    if (dayOutcome(c, entries, day, today) !== 'hit') break
    streak++
    day = addDays(day, -1)
  }
  return streak
}

export function bestStreak(c: Challenge, entries: EntryMap, today: Date): number {
  let best = 0
  let run = 0
  for (const key of activeDays(c, today)) {
    if (dayOutcome(c, entries, parseDay(key), today) === 'hit') {
      run++
      best = Math.max(best, run)
    } else {
      run = 0
    }
  }
  return Math.max(best, currentStreak(c, entries, today))
}

/**
 * Доля выполненных дней среди прошедших. `lastDays` — окно последних календарных дней:
 * пауза внутри окна его не растягивает на давние дни.
 */
export function completionRate(
  c: Challenge,
  entries: EntryMap,
  today: Date,
  lastDays?: number,
): number {
  const all = activeDays(c, today)
  const since = lastDays ? dayKey(addDays(today, -lastDays)) : null
  const window = since ? all.filter((k) => k >= since) : all
  if (!window.length) return 0
  const hits = window.filter((k) => dayOutcome(c, entries, parseDay(k), today) === 'hit').length
  return hits / window.length
}

/** Сколько дней за последние `back` закрыты по всем переданным челленджам разом. */
export function fullDays(
  challenges: Challenge[],
  entriesById: Record<string, EntryMap>,
  today: Date,
  back: number,
): number {
  let count = 0
  for (let i = 1; i <= back; i++) {
    const day = addDays(today, -i)
    const tracked = challenges.filter(
      (c) => dayOutcome(c, entriesById[c.id] ?? {}, day, today) !== 'outside',
    )
    if (!tracked.length) continue
    if (tracked.every((c) => dayOutcome(c, entriesById[c.id] ?? {}, day, today) === 'hit')) count++
  }
  return count
}
