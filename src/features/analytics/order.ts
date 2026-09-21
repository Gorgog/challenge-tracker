import { isLive } from '@/domain/challenges'
import type { ChallengeEffect, Confidence, TagEffect, Verdict, Windows } from '@/domain/effects'

type Ranked = { verdict: Verdict; confidence: Confidence; windows: { day: Windows } }

/** Выводы про сам день — без уверенности, но что-то говорят. */
const ABOUT_DAY: Verdict[] = ['coincidence', 'sameDayOnly', 'streak', 'rebound']

/** Уровень вывода: уверенно, похоже, возможно, про сам день, без вывода, мало данных. */
function rank(e: Ranked): number {
  if (e.confidence === 'sure') return 0
  if (e.confidence === 'likely') return 1
  if (e.confidence === 'possible') return 2
  if (ABOUT_DAY.includes(e.verdict)) return 3
  if (e.verdict === 'insufficient') return 5
  return 4
}

/** Сила вывода внутри уровня: у выводов «назавтра» и у полосы — разница назавтра, у остальных — дня. */
function force(e: Ranked): number {
  const { same, next } = e.windows.day
  return Math.abs(e.confidence || e.verdict === 'streak' ? next.delta : same.delta)
}

/**
 * Карточки экрана и их порядок: сильные выводы сверху. Удалённые челленджи не показываются —
 * в расчётах соседей они уже поучаствовали.
 */
export function cardsOf(effects: ChallengeEffect[]): ChallengeEffect[] {
  return effects.filter((e) => isLive(e.challenge)).sort((a, b) => rank(a) - rank(b) || force(b) - force(a))
}

/** Теги дня: сильные выводы сверху, при равенстве — частые теги. */
export function tagsOf(tags: TagEffect[]): TagEffect[] {
  return [...tags].sort((a, b) => rank(a) - rank(b) || b.tagDays - a.tagDays)
}
