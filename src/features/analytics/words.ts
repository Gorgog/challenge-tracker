import type { Confidence, Metric, Strength } from '@/domain/effects'
import { plural } from '@/lib/plural'

export const METRIC_LABEL: Record<Metric, string> = {
  day: 'Оценка дня',
  mood: 'Настроение',
  wellbeing: 'Самочувствие',
  productivity: 'Продуктивность',
}

/** Слово класса оценки окна — так он читается в таблице. */
export const STRENGTH_WORD: Record<Strength, string> = {
  few: 'мало данных',
  flat: 'без разницы',
  unclear: 'неясно',
  echo: 'полоса',
  likely: 'похоже',
  strong: 'уверенно',
}

export const CONFIDENCE_WORD: Record<Exclude<Confidence, null>, string> = {
  sure: 'Уверенно',
  likely: 'Похоже',
}

/** Разница в баллах: «+1,2», «−0,9» — с настоящим минусом и русской запятой. */
export function signed(delta: number): string {
  const abs = Math.abs(delta).toLocaleString('ru', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  if (abs === '0,0') return abs
  return `${delta > 0 ? '+' : '−'}${abs}`
}

export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

export const daysText = (n: number) => `${n} ${plural(n, 'день', 'дня', 'дней')}`
