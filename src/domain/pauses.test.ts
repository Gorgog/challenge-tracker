import { describe, expect, it } from 'vitest'
import { isPaused, pausedOn } from './pauses'

describe('pausedOn', () => {
  const c = { pauses: [{ from: '2026-09-10', to: '2026-09-12' }] }

  it('день внутри паузы — на паузе, включая её первый и последний день', () => {
    expect(pausedOn(c, '2026-09-10')).toBe(true)
    expect(pausedOn(c, '2026-09-11')).toBe(true)
    expect(pausedOn(c, '2026-09-12')).toBe(true)
  })

  it('соседние с паузой дни — нет', () => {
    expect(pausedOn(c, '2026-09-09')).toBe(false)
    expect(pausedOn(c, '2026-09-13')).toBe(false)
  })

  it('незакрытая пауза длится до сих пор', () => {
    const open = { pauses: [{ from: '2026-09-15', to: null }] }
    expect(pausedOn(open, '2026-09-14')).toBe(false)
    expect(pausedOn(open, '2026-09-15')).toBe(true)
    expect(pausedOn(open, '2026-10-01')).toBe(true)
  })

  it('без пауз ни один день не на паузе', () => {
    expect(pausedOn({ pauses: [] }, '2026-09-10')).toBe(false)
  })
})

describe('isPaused', () => {
  it('на паузе, пока есть незакрытый период', () => {
    expect(isPaused({ pauses: [{ from: '2026-09-15', to: null }] })).toBe(true)
  })

  it('закрытые паузы в прошлом — уже не на паузе', () => {
    expect(isPaused({ pauses: [{ from: '2026-09-10', to: '2026-09-12' }] })).toBe(false)
    expect(isPaused({ pauses: [] })).toBe(false)
  })
})
