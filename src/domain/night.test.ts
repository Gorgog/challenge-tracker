import { describe, expect, it } from 'vitest'
import {
  bedFromInput,
  clockText,
  inputOf,
  minutesOf,
  nightProblem,
  usualNight,
  validNight,
  wakeFromInput,
} from './night'
import type { DayStart, Night } from './types'

const night = (bed: number, wake: number, how: Night['bedHow'] = 'exact'): Night => ({ bed, wake, bedHow: how, wakeHow: how })
const start = (day: string, n: Night | null, withMorning = true): DayStart => ({
  day,
  morning: withMorning ? { sleep: 7, wellbeing: 6, mood: 6, night: n } : null,
  startedAt: `${day}T06:00:00.000Z`,
})

describe('время ночи — минуты от полуночи этого утра', () => {
  it('отбой до полуночи — минус, после — плюс; подъём — от полуночи', () => {
    expect(bedFromInput('23:30')).toBe(-30)
    expect(bedFromInput('00:30')).toBe(30)
    expect(bedFromInput('01:20')).toBe(80)
    expect(wakeFromInput('07:40')).toBe(460)
  })

  it('отбой с полудня — это вчера, до полудня — сегодня', () => {
    expect(bedFromInput('12:00')).toBe(-720)
    expect(bedFromInput('11:55')).toBe(715)
  })

  it('пустое поле — не ответ', () => {
    expect(bedFromInput('')).toBeNull()
    expect(wakeFromInput('')).toBeNull()
  })

  it('на экране — часы и минуты, в поле — с ведущим нулём', () => {
    expect(clockText(-30)).toBe('23:30')
    expect(clockText(30)).toBe('00:30')
    expect(clockText(460)).toBe('7:40')
    expect(clockText(-720)).toBe('12:00')
    expect(inputOf(-30)).toBe('23:30')
    expect(inputOf(460)).toBe('07:40')
    expect(inputOf(30)).toBe('00:30')
  })

  it('минуты часов — от полуночи этого дня', () => {
    expect(minutesOf(new Date(2026, 8, 25, 7, 10))).toBe(430)
  })
})

describe('usualNight — середина своих ответов за 14 дней', () => {
  it('медиана отбоя и подъёма, до 5 минут', () => {
    const starts = [
      start('2026-09-22', night(-30, 460)),
      start('2026-09-23', night(-20, 470)),
      start('2026-09-24', night(10, 500)),
    ]
    expect(usualNight(starts, '2026-09-25')).toEqual({ bed: -20, wake: 470 })
  })

  it('чётное число ответов — середина между двумя, округлённая до 5 минут', () => {
    const starts = [
      start('2026-09-21', night(-30, 460)),
      start('2026-09-22', night(-30, 460)),
      start('2026-09-23', night(-20, 465)),
      start('2026-09-24', night(-20, 465)),
    ]
    /* −25 и 462,5 → 465 */
    expect(usualNight(starts, '2026-09-25')).toEqual({ bed: -25, wake: 465 })
  })

  it('округлённое обычное не выходит за границы базы: отбой до 11:55, подъём до 23:55', () => {
    const starts = ['2026-09-22', '2026-09-23', '2026-09-24'].map((d) => start(d, night(718, 1439)))
    expect(usualNight(starts, '2026-09-25')).toEqual({ bed: 715, wake: 1435 })
  })

  it('меньше трёх ответов — обычного нет', () => {
    const starts = [start('2026-09-23', night(-30, 460)), start('2026-09-24', night(-30, 460))]
    expect(usualNight(starts, '2026-09-25')).toEqual({ bed: null, wake: null })
  })

  it('старше 14 дней, сегодняшний, утро без ночи и пропущенное утро — не в счёт', () => {
    const starts = [
      start('2026-09-10', night(120, 600)),
      start('2026-09-11', night(-30, 460)),
      start('2026-09-12', null),
      start('2026-09-13', null, false),
      start('2026-09-20', night(-30, 460)),
      start('2026-09-24', night(-30, 460)),
      start('2026-09-25', night(300, 800)),
    ]
    expect(usualNight(starts, '2026-09-25')).toEqual({ bed: -30, wake: 460 })
    /* без 11-го ответов два — обычного нет: 10-е за окном */
    expect(usualNight(starts.filter((s) => s.day !== '2026-09-11'), '2026-09-25')).toEqual({ bed: null, wake: null })
  })
})

describe('nightProblem — что не пускает начать день', () => {
  it('подъём позже, чем сейчас, — будущее', () => {
    expect(nightProblem({ bed: -30, wake: 460 }, 430)).toBe('future')
    expect(nightProblem({ bed: -30, wake: 430 }, 430)).toBeNull()
  })

  it('отбой не раньше подъёма — ошибка порядка', () => {
    expect(nightProblem({ bed: 460, wake: 460 }, 600)).toBe('order')
    expect(nightProblem({ bed: 500, wake: 460 }, 600)).toBe('order')
  })

  it('не всё заполнено — пока нечего проверять', () => {
    expect(nightProblem({ bed: null, wake: 460 }, 600)).toBeNull()
    expect(nightProblem({ bed: 500, wake: null }, 600)).toBeNull()
  })
})

describe('validNight — те же правила, что в базе', () => {
  it('верная ночь', () => {
    expect(validNight(night(-30, 460))).toBe(true)
    expect(validNight(night(-720, 0, 'usual'))).toBe(true)
    expect(validNight(night(718, 719))).toBe(true)
  })

  it('границы, порядок, целые минуты и способ ответа', () => {
    expect(validNight(night(-721, 460))).toBe(false)
    expect(validNight(night(720, 800))).toBe(false)
    expect(validNight(night(-30, 1440))).toBe(false)
    expect(validNight(night(-30, -1))).toBe(false)
    expect(validNight(night(460, 460))).toBe(false)
    expect(validNight(night(-30.5, 460))).toBe(false)
    expect(validNight({ ...night(-30, 460), wakeHow: 'shift' as Night['wakeHow'] })).toBe(false)
  })
})
