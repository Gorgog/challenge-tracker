import type { Challenge } from './types'

/**
 * Не удалён. Списки и формы показывают только такие.
 * В статистике удалённые учитываются — этим фильтром её не режем.
 */
export const isLive = (c: Challenge) => c.deletedAt === null

/** На экране дня — только живые и не на паузе. */
export const onDay = (c: Challenge) => isLive(c) && c.status === 'active'

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
