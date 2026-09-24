import { LINK_MIN, type Case, type Link, type Level } from '@/domain/links'
import type { Goal } from '@/domain/overview'
import { HARMFUL_TAGS } from '@/domain/timeline'
import { plural } from '@/lib/plural'
import { num1 } from './words'

/* Связь словами (макет среза 2): что было после, против чего, в скольких разах. Без «из-за». */

/** Что измерено после тега вечером — утро (или продуктивность следующего дня). */
const AFTER_TAG: Record<Goal, string> = {
  all: 'Самочувствие и настроение утром',
  sleep: 'Сон утром',
  wellbeing: 'Самочувствие утром',
  mood: 'Настроение утром',
  productivity: 'Продуктивность на следующий день',
}
/** Что измерено после плохой ночи — вечер того же дня. */
const AFTER_NIGHT: Record<Goal, string> = {
  all: 'Самочувствие и настроение вечером',
  sleep: 'Сон',
  wellbeing: 'Самочувствие вечером',
  mood: 'Настроение вечером',
  productivity: 'Продуктивность вечером',
}
const NOUN: Record<Goal, [string, string]> = {
  all: ['самочувствие и настроение', 'на следующее утро'],
  sleep: ['сон', 'на следующее утро'],
  wellbeing: ['самочувствие', 'на следующее утро'],
  mood: ['настроение', 'на следующее утро'],
  productivity: ['продуктивность', 'на следующий день'],
}

export const LEVEL: Record<Exclude<Level, 'early' | 'none'>, { dots: string; word: string; explain: string }> = {
  maybe: { dots: '●○○', word: 'похоже', explain: 'Видели 5+ раз «с» и 5+ «без», разница больше балла. Может быть и случайно.' },
  notable: {
    dots: '●●○',
    word: 'заметно',
    explain: 'Видели 8+ раз, держится в обеих половинах периода и с поправкой на выходные. Но это ещё не проверка.',
  },
}

const times = (n: number) => `${n} ${plural(n, 'раз', 'раза', 'раз')}`
/** «из 1 раза», «из 8 раз». */
const ofTimes = (n: number) => `${n} ${plural(n, 'раза', 'раз', 'раз')}`

/** Как фактор называется в строке: «алкоголь» — в кавычках, как тег; плохая ночь — словами. */
export const factorName = (l: Link) => (l.factor.kind === 'tag' ? `«${l.factor.tag}»` : 'плохая ночь')
const afterFactor = (l: Link) => (l.factor.kind === 'tag' ? `после ${factorName(l)}` : 'после плохой ночи')
const harmful = (l: Link) => l.factor.kind === 'badSleep' || HARMFUL_TAGS.includes(l.factor.tag)

/** Строка карточки «Что попробовать». */
export function linkLine(l: Link, goal: Goal): string {
  const what = l.factor.kind === 'tag' ? AFTER_TAG[goal] : AFTER_NIGHT[goal]
  const side = l.direction === 'better' ? 'Лучше' : 'Хуже'
  return `${what} ${afterFactor(l)} — ${num1(l.withMean!)}, без — ${num1(l.withoutMean!)}. ${side} в ${l.sameSide} из ${ofTimes(l.withN)}.`
}

/** Заголовок строки в списке. */
export const linkTitle = (l: Link) => (l.factor.kind === 'tag' ? `${factorName(l)} вечером` : 'Плохая ночь')

/** Заголовок карточки связи — со временем, без «из-за». */
export function sheetTitle(l: Link, goal: Goal): string {
  const side = l.direction === 'better' ? 'лучше' : 'хуже'
  if (l.factor.kind === 'badSleep') return `После плохой ночи ${NOUN[goal][0]} вечером обычно ${side}`
  const [noun, when] = NOUN[goal]
  return `После вечера с ${factorName(l)} ${noun} ${when} обычно ${side}`
}

/** На чём держится ступень. */
export function linkBasis(l: Link): string {
  if (l.level === 'notable') return `${times(l.withN)} «с», в обеих половинах периода — в ту же сторону.`
  return `${times(l.withN)} «с» и ${l.withoutN} «без». Может быть и случайно.`
}

/** «А может быть иначе» — совпал другой тег или выходные. Совпадений нет — null. */
export function otherwiseText(l: Link): string | null {
  const o = l.otherwise
  if (!o) return null
  const lead = `А может быть иначе: ${o.together} из ${ofTimes(o.of)}`
  if (o.kind === 'weekend') {
    return `${lead} это была суббота или воскресенье — выходные и так бывают другими. С поправкой на выходные разница ${num1(Math.abs(o.diff))}.`
  }
  const other = `«${o.tag}»`
  const was = l.factor.kind === 'tag' ? `это был ещё и вечер с ${other}` : `накануне был вечер с ${other}`
  if (o.diff === null) return `${lead} ${was} — разделить их пока нельзя.`
  /* причину не называем: только что осталось без совпавших вечеров, и число не спорит со словами */
  if (Math.abs(o.diff) < 0.5) return `${lead} ${was}. Без таких вечеров разницы почти нет.`
  const raw = l.withMean! - l.withoutMean!
  if (Math.sign(o.diff) !== Math.sign(raw)) return `${lead} ${was}. Без таких вечеров — наоборот: на ${num1(Math.abs(o.diff))} в другую сторону.`
  return `${lead} ${was}. Без таких вечеров разница ${num1(Math.abs(o.diff))}.`
}

const CASE_NOUN: Record<Goal, string> = {
  all: 'самочувствие и настроение',
  sleep: 'сон',
  wellbeing: 'самочувствие',
  mood: 'настроение',
  productivity: 'продуктивность',
}
/** Целое — без запятой: сон 3, а не 3,0. */
const plain = (v: number) => (Number.isInteger(v) ? String(v) : num1(v))
const listOf = (v: string[]) => (v.length < 2 ? v.join('') : `${v.slice(0, -1).join(', ')} и ${v[v.length - 1]}`)

/**
 * Случаи без обобщения: каждое число отдельно, рядом — что бывает после других вечеров (не полоса «обычно»
 * с графика: та считается по полным дням). Неотмеченные дни после тега названы, «оба» — только о записанных.
 */
export function caseLine(c: Case, goal: Goal): string {
  const day = goal === 'productivity'
  const n = c.values.length
  const rec = c.missing ? (day ? ' записанный' : ' записанное') : ''
  const recs = c.missing ? ' записанных' : ''
  const lead =
    n === 1
      ? day ? `Единственный${rec} день` : `Единственное${rec} утро`
      : n === 2
        ? `Оба${recs} ${day ? 'дня' : 'утра'}`
        : `Все ${n}${recs} ${day ? 'дня' : 'утра'}`
  const miss = c.missing ? ` Ещё ${times(c.missing)} ${day ? 'вечер не закрыт' : 'утро не отмечено'}.` : ''
  return `${lead} после «${c.tag}» ${CASE_NOUN[goal]} — ${listOf(c.values.map(plain))}. После других вечеров — около ${plain(c.usual)}.${miss}`
}

/** Под прогрессом «пока рано»: вредное не зовём, остальному — сколько не хватает. */
export function earlyNote(l: Link): string {
  if (harmful(l)) return `${l.factor.kind === 'tag' ? factorName(l) : 'Плохие ночи'} звать не будем — это просто счётчик.`
  const [need, side] = l.withN < LINK_MIN ? [LINK_MIN - l.withN, 'с'] : [LINK_MIN - l.withoutN, 'без']
  return `До связи с ${factorName(l)} не хватает ${need} ${plural(need, 'дня', 'дней', 'дней')} «${side}».`
}
