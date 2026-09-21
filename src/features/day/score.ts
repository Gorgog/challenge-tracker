/** Шкала оценки дня. */
export const SCORE_MIN = 1
export const SCORE_MAX = 10

/**
 * Ползунок под пальцем плавный, а оценка — целая: при отпускании
 * значение доезжает до ближайшей засечки.
 */
export function snapScore(value: number): number {
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, Math.round(value)))
}
