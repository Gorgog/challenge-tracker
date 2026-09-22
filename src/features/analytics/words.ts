import { DOW, formatHuman, isoDow, parseDay } from '@/domain/date'

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

/** Число с одним знаком и русской запятой: «5,5». */
export const num1 = (v: number) => v.toLocaleString('ru', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** Сдвиг со знаком и настоящим минусом: «+1,5», «−0,8», «0,0». */
export function signed1(v: number): string {
  const text = num1(Math.abs(v))
  if (text === '0,0') return text
  return `${v > 0 ? '+' : '−'}${text}`
}

/** «вс, 6 сентября». */
export const dayName = (key: string) => {
  const d = parseDay(key)
  return `${DOW[isoDow(d)]}, ${formatHuman(d)}`
}

/** «6 сен». */
export const shortDate = (key: string) => {
  const d = parseDay(key)
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

/** «вс 6» — для строк недели. */
export const dowDate = (key: string) => {
  const d = parseDay(key)
  return `${DOW[isoDow(d)]} ${d.getDate()}`
}
