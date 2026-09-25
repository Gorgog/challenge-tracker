import type { DayStory, Guess, Suspect } from '@/domain/dayStory'
import type { Goal } from '@/domain/overview'
import { num1 } from './words'

/** «хуже обычного · обычно 6,5–8,0»; полосы нет — только число дня, без сравнения. */
export function toneText(s: DayStory): string | null {
  if (s.tone === null || s.band === null) return null
  const word = s.tone === 'worse' ? 'хуже обычного' : s.tone === 'better' ? 'лучше обычного' : 'как обычно'
  const low = num1(s.band.low)
  const high = num1(s.band.high)
  return `${word} · обычно ${low === high ? low : `${low}–${high}`}`
}

/** 135 → «2 ч 15 мин», 120 → «2 ч», 45 → «45 мин». */
export function duration(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return [h ? `${h} ч` : '', m ? `${m} мин` : ''].filter(Boolean).join(' ')
}

/** Отбой против обычного: от получаса — словами, меньше — «как обычно». */
export function laterText(later: number | null): string {
  if (later === null) return ''
  if (Math.abs(later) < 30) return ' — как обычно'
  return ` — на ${duration(Math.abs(later))} ${later > 0 ? 'позже' : 'раньше'} обычного`
}

const suspect = (x: Suspect) => (x.kind === 'tag' ? `«${x.tag}» накануне` : x.kind === 'lateBed' ? 'поздний отбой' : 'плохой сон')

/** Одна догадка словами. Связь — «похоже», совпадение — прямо так и названо. */
export function guessText(g: Guess, goal: Goal): string {
  if (g.kind === 'none') return 'Явной причины в записях нет'
  if (g.kind === 'context') return `Похоже на ${g.tags.map((t) => `«${t}»`).join(', ')} — такие дни бывают сами`
  if (g.kind === 'coincidence') return `Возможно, ${g.what.map(suspect).join(', ')} — связь пока не найдена, это совпадение`
  const dir = g.direction === 'worse' ? 'хуже' : 'лучше'
  const f = g.factor
  if (f.kind === 'badSleep') return `Похоже на плохую ночь: после неё вечер у тебя обычно ${dir}`
  const after = goal === 'productivity' ? 'следующий вечер' : 'утро'
  if (f.kind === 'lateBed') return `Похоже на поздний отбой: после него ${after} у тебя обычно ${dir}`
  return `Похоже на «${f.tag}» накануне: после него ${after} у тебя обычно ${dir}`
}
