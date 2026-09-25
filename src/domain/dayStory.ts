import { CONTEXT_TAGS, NOT_MORE, type Factor, type Link, type Links } from './links'
import { goalValue, isComplete, pointClass, type Band, type Goal } from './overview'
import { BAD_SLEEP, HARMFUL_TAGS, stateOf, type TimelineDay } from './timeline'

/*
 * Шторка дня лентой (решение Georgy 25.09, макет одобрен): итог против обычного, вечер накануне, ночь, утро, вечер
 * и одна догадка. Догадка — не причина: найденная на твоих днях связь, «не в моих силах» или совпадение с пометкой.
 * Челленджи в догадку не идут: их пропускают как раз в плохие дни, «пропустил — поэтому хуже» было бы неправдой.
 */

/** Что в догадке «совпадение»: вредный тег накануне, поздний отбой, плохой сон этой ночи. */
export type Suspect = { kind: 'tag'; tag: string } | { kind: 'lateBed' } | { kind: 'badSleep' }

export type Guess =
  | { kind: 'link'; factor: Factor; level: 'maybe' | 'notable'; direction: 'worse' | 'better' }
  | { kind: 'context'; tags: string[] }
  | { kind: 'coincidence'; what: Suspect[] }
  | { kind: 'none' }

export type DayStory = {
  /** Точка дня на графике по цели. */
  value: number | null
  /** Против полосы «обычно» — только у полного дня и при полосе. */
  tone: 'worse' | 'better' | 'usual' | null
  band: { low: number; high: number } | null
  /** Закрытый вечер накануне: оценка по цели, теги и какие из них вредные. */
  before: { value: number | null; tags: string[]; levels?: Record<string, number>; harmful: string[] } | null
  /** Ночь перед утром; `later` — минут позже обычного отбоя (null — обычного нет), `late` — не раньше порога позднего. */
  night: { bed: number; wake: number; later: number | null; late: boolean } | null
  morning: { value: number | null; note: string } | null
  evening: { value: number | null; tags: string[]; note: string } | null
  /** Только у дня хуже или лучше обычного. */
  guess: Guess | null
}

/** Обычный отбой и порог позднего — те же, что у ряда «лёг 00:30+» (минуты от полуночи утра). */
export type NightBase = { usualBed: number | null; lateFrom: number | null }

const morningPart = (d: TimelineDay, goal: Goal): number | null => {
  const m = d.morning
  if (!m || goal === 'productivity') return null
  return goal === 'sleep' ? m.sleep : goal === 'wellbeing' ? m.wellbeing : goal === 'mood' ? m.mood : stateOf(m)
}

const eveningPart = (d: TimelineDay, goal: Goal): number | null => {
  const e = d.evening
  if (!e || goal === 'sleep') return null
  return goal === 'productivity' ? e.productivity : goal === 'wellbeing' ? e.wellbeing : goal === 'mood' ? e.mood : stateOf(e)
}

const harmfulOf = (tags: string[]) => tags.filter((t) => HARMFUL_TAGS.includes(t) || NOT_MORE.includes(t))

const size = (l: Link) => Math.abs((l.withMean ?? 0) - (l.withoutMean ?? 0))

/** Связь «про этот день»: её фактор был — тег накануне, поздний отбой перед утром, плохой сон этой ночи. */
function present(l: Link, d: TimelineDay, prev: TimelineDay | null): boolean {
  const f = l.factor
  if (f.kind === 'tag') return Boolean(prev?.evening && prev.tags.includes(f.tag))
  if (f.kind === 'badSleep') return d.morning !== null && d.morning.sleep <= BAD_SLEEP
  const bed = d.morning?.night?.bed
  return bed !== undefined && bed !== null && bed >= f.from
}

export function dayStory(history: TimelineDay[], index: number, goal: Goal, band: Band, links: Links, base: NightBase): DayStory {
  const d = history[index]!
  const prev = index > 0 ? history[index - 1]! : null
  const value = goalValue(d, goal)
  const complete = isComplete(d, goal)
  const cls = complete && value !== null && band.kind === 'band' ? pointClass(value, band) : null
  const tone = cls === null ? null : cls === 'below' ? 'worse' : cls === 'above' ? 'better' : 'usual'

  const before =
    prev?.evening
      ? {
          value: eveningPart(prev, goal),
          tags: [...prev.tags],
          ...(prev.levels ? { levels: { ...prev.levels } } : {}),
          harmful: harmfulOf(prev.tags),
        }
      : null
  const n = d.morning?.night ?? null
  const night = n
    ? {
        bed: n.bed,
        wake: n.wake,
        later: base.usualBed === null ? null : n.bed - base.usualBed,
        late: base.lateFrom !== null && n.bed >= base.lateFrom,
      }
    : null

  let guess: Guess | null = null
  if (tone === 'worse' || tone === 'better') {
    const found = links.pairs
      .filter((l) => (l.level === 'maybe' || l.level === 'notable') && l.direction === tone && present(l, d, prev))
      .sort((a, b) => (a.level === b.level ? size(b) - size(a) : a.level === 'notable' ? -1 : 1))[0]
    if (found) guess = { kind: 'link', factor: found.factor, level: found.level as 'maybe' | 'notable', direction: tone }
    else if (tone === 'worse') {
      const context = [...new Set([...d.tags, ...(prev?.evening ? prev.tags : [])].filter((t) => CONTEXT_TAGS.includes(t)))]
      const what: Suspect[] = [
        ...(before?.harmful ?? []).map((tag) => ({ kind: 'tag' as const, tag })),
        ...(night?.late ? [{ kind: 'lateBed' as const }] : []),
        ...(d.morning && d.morning.sleep <= BAD_SLEEP ? [{ kind: 'badSleep' as const }] : []),
      ]
      guess = context.length ? { kind: 'context', tags: context } : what.length ? { kind: 'coincidence', what } : { kind: 'none' }
    }
  }

  return {
    value,
    tone,
    band: band.kind === 'band' ? { low: band.low, high: band.high } : null,
    before,
    night,
    morning: d.morning ? { value: morningPart(d, goal), note: d.morning.note ?? '' } : null,
    evening: d.evening ? { value: eveningPart(d, goal), tags: [...d.tags], note: d.note ?? '' } : null,
    guess,
  }
}
