import { describe, expect, it } from 'vitest'
import { SCORE_MAX, SCORE_MIN, snapScore } from './score'

describe('шкала оценки дня', () => {
  it('идёт от нуля до десяти — так пятёрка попадает ровно в середину', () => {
    expect(SCORE_MIN).toBe(0)
    expect(SCORE_MAX).toBe(10)
  })
})

describe('snapScore', () => {
  it('округляет до ближайшего целого', () => {
    expect(snapScore(4.49)).toBe(4)
    expect(snapScore(4.5)).toBe(5)
    expect(snapScore(7.8)).toBe(8)
  })

  it('не выходит за шкалу', () => {
    expect(snapScore(-0.4)).toBe(0)
    expect(snapScore(0.4)).toBe(0)
    expect(snapScore(10.4)).toBe(10)
  })
})
