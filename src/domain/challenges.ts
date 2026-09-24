import { addDays, dayKey, parseDay } from './date'
import { isPaused } from './pauses'
import { dayOutcome, deletedDay } from './streaks'
import type { Challenge, EntryMap } from './types'

/**
 * Не удалён. Списки и формы показывают только такие.
 * В статистике удалённые учитываются своими днями по день удаления — этим фильтром её не режем.
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
    /*
     * На «Время» и обратно не переходят (решение Georgy по ревью 4б): прошлые дни задним числом получили бы
     * исходы из ночей, а хранимые отметки — остались бы лишними. Тогда правила остаются прежними целиком.
     */
    if ((next.measure === 'bedtime') !== (c.measure === 'bedtime')) for (const key of RULE_KEYS) Object.assign(next, { [key]: c[key] })
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
 * Снимает с паузы: сегодня челлендж снова идёт, пауза заканчивается вчера. Если день уже
 * закрыт итогом, пауза заканчивается сегодня и челлендж возвращается завтра — иначе закрытый
 * день стал бы пропуском, который уже не отметить. Пауза, так и не успевшая начаться, исчезает.
 */
export function resume(c: Challenge, today: Date, closed = false): Challenge {
  if (!isPaused(c)) return c
  const to = dayKey(closed ? today : addDays(today, -1))
  const pauses = c.pauses
    .map((p) => (p.to === null ? { ...p, to } : p))
    .filter((p) => p.to !== null && p.to >= p.from)
  return { ...c, pauses }
}

/**
 * Возвращает из корзины. Дни, пока челлендж был удалён, становятся паузой — иначе они
 * «ожили» бы пропусками у привычки или «выдержан» у отказа. Как и со снятием паузы: закрытый
 * итогом день тоже остаётся паузой, и челлендж идёт с завтра. Был на паузе, когда удалили, —
 * пауза и так идёт.
 */
export function restore(c: Challenge, today: Date, closed = false): Challenge {
  const gone = deletedDay(c)
  if (!gone) return c
  const from = dayKey(addDays(parseDay(gone), 1))
  const to = dayKey(closed ? today : addDays(today, -1))
  const alreadyPaused = isPaused(c) || to < from
  return { ...c, deletedAt: null, pauses: alreadyPaused ? c.pauses : [...c.pauses, { from, to }] }
}
