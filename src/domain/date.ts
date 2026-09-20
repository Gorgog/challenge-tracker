/**
 * Работа с днями. День — это календарная дата в местном часовом поясе, без времени:
 * отметка в 23:50 должна остаться сегодняшней, а не уехать в завтра через UTC.
 * Поэтому ключ собирается из локальных полей даты, а не через toISOString().
 */

export const DOW = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'] as const
export const DOW_FULL = [
  'понедельник',
  'вторник',
  'среда',
  'четверг',
  'пятница',
  'суббота',
  'воскресенье',
] as const
const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
] as const

/** Ключ дня: `2026-09-21`. В этом же виде день хранится в базе (тип `date`). */
export function dayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayKey(): string {
  return dayKey(new Date())
}

/** Разбирает ключ дня в местную полночь (new Date('2026-09-21') дало бы UTC). */
export function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

/** 0 — понедельник, 6 — воскресенье. */
export function isoDow(date: Date): number {
  return (date.getDay() + 6) % 7
}

/** Разница в календарных днях; считается через UTC, чтобы перевод часов не сбивал счёт. */
export function daysBetween(from: Date, to: Date): number {
  const utc = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.round((utc(to) - utc(from)) / 86_400_000)
}

/** `21 сентября` — так дата подписывается в интерфейсе. */
export function formatHuman(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`
}
