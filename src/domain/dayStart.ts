import type { DayLog, DayStart } from './types'

/**
 * Спрашивать ли утро сейчас: только до часа из настроек. Утро, записанное позже, уже включает
 * сделанное с утра — прогулку, работу — и перестаёт быть базой дня. После полуночи — утро
 * нового дня.
 */
export const morningOpen = (now: Date, untilHour: number) => now.getHours() < untilHour

export type DayStage = 'notStarted' | 'started' | 'closed'

/**
 * Состояние дня. Есть итог — день закрыт, даже без утра: так закрыты старые дни и долги по
 * оценкам. Есть начало — день начат, в том числе с пропущенным утром. Иначе — не начат.
 */
export function dayStage(day: string, starts: DayStart[], logs: DayLog[]): DayStage {
  if (logs.some((l) => l.day === day)) return 'closed'
  return starts.some((s) => s.day === day) ? 'started' : 'notStarted'
}
