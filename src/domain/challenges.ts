import { addDays, dayKey } from './date'
import { isPaused } from './pauses'
import { dayOutcome } from './streaks'
import type { Challenge, EntryMap } from './types'

/**
 * Не удалён. Списки и формы показывают только такие.
 * В статистике удалённые учитываются — этим фильтром её не режем.
 */
export const isLive = (c: Challenge) => c.deletedAt === null

/** На экране дня — только живые и не на паузе. */
export const onDay = (c: Challenge) => isLive(c) && !isPaused(c)

/** Поля, которые правятся всегда: они не влияют на то, как считается история. */
type FreeFields = Pick<Challenge, 'name' | 'code' | 'color' | 'tagIds'>

/** Правила челленджа. Поменять их задним числом — значит переписать статистику. */
type RuleFields = Pick<Challenge, 'kind' | 'measure' | 'goal' | 'unit' | 'lengthDays'>

export type ChallengePatch = Partial<FreeFields & RuleFields & Pick<Challenge, 'rulesLocked'>>

const RULE_KEYS = ['kind', 'measure', 'goal', 'unit', 'lengthDays'] as const

/**
 * Правка с учётом замка. У запертого челленджа правила молча остаются прежними:
 * интерфейс эти поля и так выключает, а здесь страховка на уровне данных.
 * Запереть можно, отпереть нельзя — иначе замок ничего не значит.
 */
export function applyPatch(c: Challenge, patch: ChallengePatch): Challenge {
  const next: Challenge = { ...c, tagIds: [...c.tagIds] }

  if (patch.name !== undefined) next.name = patch.name.trim()
  if (patch.code !== undefined) next.code = patch.code.trim().toUpperCase()
  if (patch.color !== undefined) next.color = patch.color
  if (patch.tagIds !== undefined) next.tagIds = [...patch.tagIds]

  if (!c.rulesLocked) {
    for (const key of RULE_KEYS) {
      if (patch[key] !== undefined) Object.assign(next, { [key]: patch[key] })
    }
  }

  if (patch.rulesLocked === true) next.rulesLocked = true

  return next
}

/**
 * Ставит на паузу. Решённый сегодня день — закрытый итогом, выполненная привычка или
 * отмеченный срыв — паузой не стирается, и она начинается завтра. Иначе пауза начинается
 * сегодня: незакрытый день не должен превратиться в пропуск.
 */
export function pause(c: Challenge, entries: EntryMap, today: Date, closed = false): Challenge {
  if (isPaused(c)) return c
  const outcome = dayOutcome(c, entries, today, today)
  const decided = closed || (c.kind === 'do' ? outcome === 'hit' : outcome === 'miss')
  const from = dayKey(decided ? addDays(today, 1) : today)
  return { ...c, pauses: [...c.pauses, { from, to: null }] }
}

/**
 * Снимает с паузы: сегодня челлендж снова идёт, пауза заканчивается вчера.
 * Пауза, которая так и не успела начаться, исчезает из истории.
 */
export function resume(c: Challenge, today: Date): Challenge {
  if (!isPaused(c)) return c
  const to = dayKey(addDays(today, -1))
  const pauses = c.pauses
    .map((p) => (p.to === null ? { ...p, to } : p))
    .filter((p) => p.to !== null && p.to >= p.from)
  return { ...c, pauses }
}
