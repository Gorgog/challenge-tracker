import { addDays, dayKey, parseDay } from './date'
import type { DayStart, EntryMap } from './types'

/*
 * «Ложусь раньше» (срез 4б): челлендж измерения `bedtime` не отмечается руками — выполнение считается из отбоя,
 * который записан утром. Ночь в утре D+1 идёт после вечера D и относится к дню D — как ряд «лёг 00:30+» и связи.
 * Цель — минуты от полуночи утра (23:30 = −30): лёг не позже цели — выполнено.
 */

/**
 * Отметки челленджа `bedtime` из начал дней: `map[D]` — отбой ночи после вечера D; `NaN` — день D+1 начат без
 * ночи (утро пропущено или без времени сна): ночь уже не узнать; ключа нет — день D+1 не начат. Не хранится —
 * считается при чтении, поэтому поправить отбой задним числом нельзя, как и само утро.
 */
export function bedtimeEntries(starts: DayStart[]): EntryMap {
  const map: EntryMap = {}
  for (const s of starts) map[dayKey(addDays(parseDay(s.day), -1))] = s.morning?.night ? s.morning.night.bed : NaN
  return map
}

/** Цель «лечь не позже» — те же границы, что у отбоя в базе: целые минуты от −720 (полдень) до 719. */
export const validBedtimeGoal = (goal: number) => Number.isInteger(goal) && goal >= -720 && goal < 720
