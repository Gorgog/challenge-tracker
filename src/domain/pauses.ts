import type { Challenge, Pause } from './types'

type WithPauses = Pick<Challenge, 'pauses'>

/** Пауза, в которую попадает день. Ключи `YYYY-MM-DD` сравниваются как строки. */
export function pauseAt(c: WithPauses, day: string): Pause | undefined {
  return c.pauses.find((p) => day >= p.from && (p.to === null || day <= p.to))
}

/** День внутри какой-либо паузы — для челленджа его нет: ни выполнения, ни пропуска. */
export const pausedOn = (c: WithPauses, day: string) => pauseAt(c, day) !== undefined

/** На паузе сейчас — есть незакрытый период. */
export const isPaused = (c: WithPauses) => c.pauses.some((p) => p.to === null)
