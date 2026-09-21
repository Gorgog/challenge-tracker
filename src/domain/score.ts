/**
 * Шкала оценки дня. Ноль, а не единица: так «как обычно» (5) приходится ровно
 * на середину дорожки — на шкале 1–10 середина это 5,5, и подпись расходилась с бегунком.
 */
export const SCORE_MIN = 0
export const SCORE_MAX = 10

/**
 * Ползунок под пальцем плавный, а оценка — целая: при отпускании
 * значение доезжает до ближайшей засечки.
 */
export function snapScore(value: number): number {
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, Math.round(value)))
}
