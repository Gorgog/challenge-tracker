import { DOW, formatHuman, isoDow, parseDay } from '@/domain/date'
import type { Goal, Verdict } from '@/domain/overview'
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

const TONE: Record<'worse' | 'better' | 'usual', string> = { worse: 'хуже обычного', better: 'лучше обычного', usual: 'как обычно' }
const HALF: Record<'worse' | 'better' | 'usual', string> = { worse: 'хуже', better: 'лучше', usual: 'примерно как' }
const days = (n: number) => `${n} ${plural(n, 'день', 'дня', 'дней')}`

/** Фраза сверху и строка под ней — числа те же, что проверило правило `verdict`. */
export function headline(v: Verdict, goal: Goal, len: number): { title: string; sub: string } {
  const period = len === 14 ? '2 недели' : `${len} дней`
  if (v.kind === 'none') {
    return { title: v.need > 0 ? `Ещё ${days(v.need)} с записями — и покажем твоё обычное` : 'Пока мало записей', sub: '' }
  }
  if (v.kind === 'halves') {
    const [second, first] = len === 14 ? ['вторая неделя', 'первой'] : [`вторые ${len / 2} дней`, 'первых']
    const lead = goal === 'all' ? second[0]!.toUpperCase() + second.slice(1) : `${GOAL_CHIP[goal]}: ${second}`
    const firstName = len === 14 ? 'первая неделя' : `первые ${len / 2} дней`
    return { title: `${lead} ${HALF[v.tone]} ${first}`, sub: `в среднем ${num1(v.second)}, ${firstName} — ${num1(v.first)}` }
  }
  const title = `${goal === 'all' ? `Последние ${period}` : `${GOAL_CHIP[goal]} за последние ${period}`} — ${TONE[v.tone]}`
  const sub =
    v.tone === 'worse'
      ? `${days(v.below)} из ${v.recorded} с записями — ниже твоего обычного`
      : v.tone === 'better'
        ? `${days(v.above)} из ${v.recorded} с записями — выше твоего обычного`
        : `ниже обычного — ${v.below}, выше — ${v.above} из ${days(v.recorded)} с записями`
  return { title, sub }
}
