/** Фикстуры эффектов для тестов экрана аналитики. В приложение не импортируется. */
import {
  verdictOf,
  type BeforeAfter,
  type ChallengeEffect,
  type Estimate,
  type Metric,
  type Strength,
  type TagEffect,
  type Windows,
} from '@/domain/effects'
import type { Challenge } from '@/domain/types'

export const challenge = (over: Partial<Challenge> = {}): Challenge => ({
  id: 'step',
  name: '10 000 шагов',
  code: 'ШАГ',
  kind: 'do',
  measure: 'count',
  goal: 10000,
  unit: 'шагов',
  color: 'var(--chart-4)',
  tagIds: [],
  startDate: '2026-07-02',
  lengthDays: null,
  pauses: [],
  rulesLocked: false,
  deletedAt: null,
  sortOrder: 3,
  ...over,
})

/** Оценка окна: класс, разница и дни «с» / «без». */
export const est = (strength: Strength, delta = 0, days: [number, number] = [30, 30]): Estimate => ({
  delta,
  low: delta - 0.4,
  high: delta + 0.4,
  strength,
  withDays: days[0],
  withoutDays: days[1],
})

/** Одинаковые окна у всех четырёх метрик. */
export const windows = (same: Estimate, next: Estimate): Record<Metric, Windows> => ({
  day: { same, next },
  mood: { same, next },
  wellbeing: { same, next },
  productivity: { same, next },
})

export function effect(same: Estimate, next: Estimate, over: Partial<ChallengeEffect> = {}): ChallengeEffect {
  const w = windows(same, next)
  return {
    challenge: challenge(),
    windows: w,
    ...verdictOf(w.day),
    partner: null,
    twin: null,
    days: 60,
    sickDays: 0,
    beforeAfter: null,
    morningBase: false,
    morning: null,
    ...over,
  }
}

export function tag(name: string, same: Estimate, next: Estimate, over: Partial<TagEffect> = {}): TagEffect {
  const w = windows(same, next)
  return { tag: name, tagDays: 12, windows: w, ...verdictOf(w.day), days: 110, sickDays: 0, morning: null, ...over }
}

export const beforeAfterOf = (over: Partial<BeforeAfter> = {}): BeforeAfter => {
  const day = est('flat', 0.3, [28, 29])
  return {
    span: 30,
    sinceStart: 60,
    beforeStart: 60,
    daysBefore: 29,
    daysAfter: 28,
    byMetric: { day, mood: day, wellbeing: day, productivity: day },
    overlaps: [],
    inseparableFrom: [],
    ...over,
  }
}
