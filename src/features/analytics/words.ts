import { DOW, formatHuman, isoDow, parseDay } from '@/domain/date'
import type { Goal, Tone, Verdict } from '@/domain/overview'
import type { Shift } from '@/domain/timeline'
import { plural } from '@/lib/plural'

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

/** Число с одним знаком и русской запятой: «5,5». */
export const num1 = (v: number) => v.toLocaleString('ru', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

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

/* ---------- обзор: цели и фраза сверху ---------- */

export const GOAL_CHIP: Record<Goal, string> = {
  all: 'Всё',
  sleep: 'Сон',
  wellbeing: 'Самочувствие',
  mood: 'Настроение',
  productivity: 'Продуктивность',
}

/** Подпись графика: что за линия. */
export const GOAL_CHART: Record<Goal, string> = {
  all: 'Состояние дня · среднее самочувствия и настроения утром и вечером',
  sleep: 'Сон · оценка утром',
  wellbeing: 'Самочувствие · среднее утра и вечера',
  mood: 'Настроение · среднее утра и вечера',
  productivity: 'Продуктивность · оценка вечером',
}

const TONE: Record<Tone, string> = {
  worse: 'хуже обычного',
  better: 'лучше обычного',
  usual: 'как обычно',
  mixed: 'то лучше, то хуже обычного',
}
const days = (n: number) => `${n} ${plural(n, 'день', 'дня', 'дней')}`
const fullDays = (n: number) => `${n} ${plural(n, 'полного дня', 'полных дней', 'полных дней')}`

/** Фраза сверху и строка под ней — числа те же, что проверило правило `verdict`. */
export function headline(v: Verdict, goal: Goal, len: number): { title: string; sub: string } {
  const period = len === 14 ? '2 недели' : `${len} дней`
  if (v.kind === 'none') {
    return { title: `Ещё ${v.need} ${plural(v.need, 'полный день', 'полных дня', 'полных дней')} — и покажем твоё обычное`, sub: '' }
  }
  if (v.kind === 'few') {
    return { title: `Полных дней за ${period}: ${v.recorded} — для вывода нужно хотя бы ${v.need}`, sub: '' }
  }
  if (v.kind === 'halves') {
    const week = len === 14
    const second = week ? 'вторая неделя' : `вторые ${len / 2} дней`
    const firstName = week ? 'первая неделя' : `первые ${len / 2} дней`
    const lead = goal === 'all' ? second[0]!.toUpperCase() + second.slice(1) : `${GOAL_CHIP[goal]}: ${second}`
    const cmp =
      v.tone === 'usual'
        ? `— примерно как ${week ? 'первая' : 'первые'}`
        : `${v.tone === 'worse' ? 'хуже' : 'лучше'} ${week ? 'первой' : 'первых'}`
    return { title: `${lead} ${cmp}`, sub: `в среднем ${num1(v.second)}, ${firstName} — ${num1(v.first)}` }
  }
  const title = `${goal === 'all' ? `Последние ${period}` : `${GOAL_CHIP[goal]} за последние ${period}`} — ${TONE[v.tone]}`
  const sub =
    v.tone === 'worse'
      ? `${days(v.below)} из ${v.recorded} полных — ниже твоего обычного`
      : v.tone === 'better'
        ? `${days(v.above)} из ${v.recorded} полных — выше твоего обычного`
        : `ниже обычного — ${v.below}, выше — ${v.above} из ${fullDays(v.recorded)}`
  return { title, sub }
}

/** Ночь и день словами — строка над цифрами дня. */
export function shiftText(s: Shift): string | null {
  if (!s) return null
  if (s.kind === 'noMorning') return 'Утро пропущено — не видно, что сделала ночь, а что сам день.'
  const by = num1(s.by)
  switch (s.kind) {
    case 'nightDown':
      return `Просела ночь: утро ниже вчерашнего вечера на ${by}.`
    case 'dayDown':
      return `Просел сам день: к вечеру ниже утра на ${by}.`
    case 'dayUp':
      return `День вытянул: к вечеру выше утра на ${by}.`
    case 'nightUp':
      return `Ночь помогла: утро выше вчерашнего вечера на ${by}.`
  }
}
