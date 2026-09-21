import { describe, expect, it } from 'vitest'
import { snapScore } from './score'

describe('snapScore', () => {
  it('округляет до ближайшего целого', () => {
    expect(snapScore(4.49)).toBe(4)
    expect(snapScore(4.5)).toBe(5)
    expect(snapScore(7.8)).toBe(8)
  })

  it('не выходит за шкалу 1–10', () => {
    expect(snapScore(0.3)).toBe(1)
    expect(snapScore(10.4)).toBe(10)
  })
})
