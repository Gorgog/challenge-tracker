import { DOW, formatHuman, isoDow, parseDay } from '@/domain/date'
import {
  BAD_SLEEP,
  GOOD_SLEEP,
  HARMFUL_TAGS,
  type Change,
  type DayReport,
  type Fact,
  type PeriodReport,
} from '@/domain/timeline'
import type { Challenge } from '@/domain/types'
import { plural } from '@/lib/plural'

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

/** Стрелка строки: к лучшему, к худшему или просто было. */
export type Tone = 'good' | 'bad' | 'neutral'
export type Line = { text: string; tone: Tone }

const tagTone = (tag: string): Tone => (HARMFUL_TAGS.includes(tag) ? 'bad' : 'neutral')

export const DAY_VERDICT: Record<DayReport['verdict'], string> = {
  worse: 'День хуже обычного',
  better: 'День лучше обычного',
  usual: 'Обычный день',
  empty: 'Оценок за этот день нет',
}

/** Где сдвинулся день — ночью или днём. */
export function shiftText(shift: DayReport['shift']): string | null {
  if (!shift) return null
  switch (shift.kind) {
    case 'noMorning':
      return 'Утро пропущено — не видно, что сделала ночь, а что сам день.'
    case 'nightDown':
      return `Просела ночь: утро ниже вчерашнего вечера на ${num1(shift.by)}.`
    case 'dayDown':
      return `Просел сам день: к вечеру ниже утра на ${num1(shift.by)}.`
    case 'dayUp':
      return `День вытянул: к вечеру выше утра на ${num1(shift.by)}.`
    case 'nightUp':
      return `Ночь помогла: утро выше вчерашнего вечера на ${num1(shift.by)}.`
  }
}

/** Факт дня — одной фразой со стрелкой. */
export function factLine(f: Fact, c: Challenge): Line {
  switch (f.kind) {
    case 'tagBefore':
      return { text: `Накануне вечером «${f.tag}»`, tone: tagTone(f.tag) }
    case 'sleep':
      if (f.value <= BAD_SLEEP) return { text: `Плохо спал: сон ${f.value}`, tone: 'bad' }
      if (f.value >= GOOD_SLEEP) return { text: `Хорошо спал: сон ${f.value}`, tone: 'good' }
      return { text: `Сон обычный: ${f.value}`, tone: 'neutral' }
    case 'outcome': {
      if (f.outcome === 'pending') return { text: `${c.code}: день ещё идёт`, tone: 'neutral' }
      const hit = f.outcome === 'hit'
      if (c.kind === 'quit') return { text: `${c.code}: ${hit ? 'без срыва' : 'срыв'}`, tone: hit ? 'good' : 'bad' }
      return { text: `${c.code} ${hit ? 'выполнен' : 'пропущен'}`, tone: hit ? 'good' : 'bad' }
    }
    case 'tag':
      return { text: `В этот день «${f.tag}»`, tone: tagTone(f.tag) }
    case 'eveningMissing':
      return { text: 'Вечер не закрыт', tone: 'neutral' }
  }
}

/** Что поменялось в делах против прошлого периода. */
export function changeLine(ch: Change, c: Challenge, len: number): Line {
  const { event } = ch
  const fewer = ch.by < 0
  const tone: Tone = ch.good === true ? 'good' : ch.good === false ? 'bad' : 'neutral'
  const per = len >= 30 ? 'за 30 дней' : 'за неделю'
  switch (event.kind) {
    case 'tag':
      return { text: `${fewer ? 'Реже' : 'Чаще'} «${event.tag}»: ${event.now} ${plural(event.now, 'вечер', 'вечера', 'вечеров')} ${per}`, tone }
    case 'badSleep':
      return { text: `${fewer ? 'Лучше спал' : 'Хуже спал'}: плохих ночей ${event.now}`, tone }
    case 'misses':
      return { text: `${c.code}: ${c.kind === 'do' ? 'пропусков' : 'срывов'} ${fewer ? 'меньше' : 'больше'} — ${event.now}`, tone }
    case 'skippedMornings':
      return { text: `Пропущено утр: ${event.now}`, tone }
  }
}

/** Итог недели или 30 дней одной строкой. */
export function periodVerdict(r: PeriodReport): string {
  const week = r.len < 30
  if (r.verdict === 'noPrev') {
    return week
      ? 'Прошлая неделя почти не записана — сравнивать не с чем'
      : 'Предыдущие 30 дней почти не записаны — сравнивать не с чем'
  }
  const what = week ? 'Неделя' : '30 дней'
  const than = week ? 'прошлой' : 'предыдущих 30'
  switch (r.verdict) {
    case 'worse':
      return `${what} хуже ${than}`
    case 'better':
      return `${what} лучше ${than}`
    case 'mixed':
      return week ? 'Неделя неоднозначная' : '30 дней — неоднозначно'
    case 'same':
      return week ? 'Неделя примерно как прошлая' : '30 дней примерно как предыдущие'
  }
}

/** Названия событий в таблице «все цифры». */
export function eventLabel(e: PeriodReport['events'][number], c: Challenge): string {
  switch (e.kind) {
    case 'tag':
      return `«${e.tag}»`
    case 'badSleep':
      return 'плохой сон (0–4)'
    case 'misses':
      return c.kind === 'do' ? `${c.code}: пропуски` : `${c.code}: срывы`
    case 'skippedMornings':
      return 'утро пропущено'
  }
}
