import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { addDays, dayKey, parseDay } from '@/domain/date'
import type { TimelineDay } from '@/domain/timeline'
import type { Challenge, Outcome } from '@/domain/types'
import { DayChart, type ChartMode } from './DayChart'

const TODAY = parseDay('2026-09-23')
const key = (i: number) => dayKey(addDays(TODAY, i - 29))

/** 30 дней: утро и вечер по заданным состояниям (самочувствие = настроение), сон 7. */
function days(spec: (i: number) => Partial<{ m: number | null; e: number | null; sleep: number; tags: string[] }> = () => ({})) {
  return Array.from({ length: 30 }, (_, i): TimelineDay => {
    const { m = 6, e = 6, sleep = 7, tags = [] } = spec(i)
    return {
      day: key(i),
      morning: m === null ? null : { sleep, wellbeing: m, mood: m },
      evening: e === null ? null : { wellbeing: e, mood: e, productivity: 5 },
      tags,
    }
  })
}

const challenge: Challenge = {
  id: 'push',
  name: 'Отжиматься по 20 раз',
  code: 'ОТЖ',
  kind: 'do',
  measure: 'count',
  goal: 20,
  unit: 'раз',
  color: 'var(--chart-1)',
  tagIds: [],
  startDate: key(0),
  lengthDays: null,
  pauses: [],
  rulesLocked: false,
  deletedAt: null,
  sortOrder: 0,
}

function chart(
  opts: Partial<{
    days: TimelineDay[]
    norm: number | null
    outcomes: Outcome[]
    cursor: number
    mode: ChartMode
    shown: Record<'wellbeing' | 'mood' | 'sleep', boolean>
    period: number | null
    onCursor: (i: number) => void
  }> = {},
) {
  const props = {
    days: days(),
    norm: 6,
    challenge,
    outcomes: Array.from({ length: 30 }, (): Outcome => 'hit'),
    cursor: 29,
    onCursor: vi.fn(),
    mode: 'norm' as ChartMode,
    shown: { wellbeing: true, mood: true, sleep: true },
    period: null,
    ...opts,
  }
  const view = render(<DayChart {...props} />)
  return { ...view, props, svg: view.container.querySelector('svg')! }
}

const all = (root: Element, selector: string) => [...root.querySelectorAll(selector)]

describe('DayChart — зигзаг «утро → вечер» против нормы', () => {
  it('точки утра и вечера подряд; день — сплошной отрезок, ночь — пунктир', () => {
    const { svg } = chart()
    expect(all(svg, '[data-point="morning"]')).toHaveLength(30)
    expect(all(svg, '[data-point="evening"]')).toHaveLength(30)
    /* 60 точек — 59 отрезков: 30 «день» (утро → вечер) и 29 «ночь» (вечер → следующее утро) */
    expect(all(svg, '[data-segment="day"]')).toHaveLength(30)
    expect(all(svg, '[data-segment="night"]')).toHaveLength(29)
  })

  it('пропуск рвёт линию, а не подставляет значение', () => {
    const { svg } = chart({ days: days((i) => (i === 10 ? { m: null } : i === 20 ? { e: null } : {})) })
    expect(all(svg, '[data-point]')).toHaveLength(58)
    /* без утра 10-го нет ночи 9→10 и дня 10; без вечера 20-го нет дня 20 и ночи 20→21 */
    expect(all(svg, '[data-segment="day"]')).toHaveLength(28)
    expect(all(svg, '[data-segment="night"]')).toHaveLength(27)
  })

  it('точки выше нормы — «hi», ниже — «lo»; норма подписана', () => {
    const { svg } = chart({ days: days((i) => (i === 5 ? { m: 3, e: 8 } : {})), norm: 6 })
    const m5 = all(svg, '[data-point="morning"]')[5]!
    const e5 = all(svg, '[data-point="evening"]')[5]!
    expect(m5.getAttribute('data-side')).toBe('lo')
    expect(e5.getAttribute('data-side')).toBe('hi')
    expect(svg.textContent).toContain('норма 6,0')
  })

  it('сон — столбики по утрам, плохой (0–4) отмечен', () => {
    const { svg } = chart({ days: days((i) => (i === 3 ? { sleep: 2 } : i === 4 ? { m: null } : {})) })
    expect(all(svg, '[data-sleep]')).toHaveLength(29)
    expect(all(svg, '[data-sleep="bad"]')).toHaveLength(1)
  })

  it('«Три линии» — самочувствие, настроение и сон своими линиями, спрятанная не рисуется', () => {
    const { svg } = chart({ mode: 'lines', shown: { wellbeing: true, mood: false, sleep: true } })
    expect(all(svg, '[data-series="wellbeing"]').length).toBeGreaterThan(0)
    expect(all(svg, '[data-series="mood"]')).toHaveLength(0)
    expect(all(svg, '[data-series="sleep"]').length).toBeGreaterThan(0)
    expect(all(svg, '[data-segment]').every((s) => s.hasAttribute('data-series'))).toBe(true)
  })
})

describe('DayChart — полосы событий', () => {
  it('отметки челленджа — по исходам, вне челленджа пусто', () => {
    const outcomes = Array.from({ length: 30 }, (_, i): Outcome => (i === 29 ? 'pending' : i < 5 ? 'outside' : i % 2 ? 'miss' : 'hit'))
    const { svg } = chart({ outcomes })
    expect(all(svg, '[data-outcome="miss"]')).toHaveLength(12)
    expect(all(svg, '[data-outcome="hit"]')).toHaveLength(12)
    expect(all(svg, '[data-outcome="pending"]')).toHaveLength(1)
    expect(all(svg, '[data-outcome="outside"]')).toHaveLength(0)
    expect(svg.textContent).toContain('ОТЖ')
  })

  it('строки тегов — до четырёх самых частых', () => {
    const tags = ['алкоголь', 'встречи', 'дедлайн', 'дорога', 'учёба']
    const { svg } = chart({ days: days((i) => ({ tags: tags.filter((_, k) => i % (k + 1) === 0) })) })
    expect(all(svg, '[data-tag-row]').map((r) => r.getAttribute('data-tag-row'))).toEqual(tags.slice(0, 4))
    expect(all(svg, '[data-tag="алкоголь"]')).toHaveLength(30)
  })
})

describe('DayChart — выбранный день', () => {
  it('две полоски по краям дня; день подписан для экранного диктора', () => {
    const { svg } = chart({ cursor: 12 })
    const [left, right] = all(svg, '[data-bracket]').map((l) => Number(l.getAttribute('x1')))
    expect(right! - left!).toBeGreaterThan(0)
    const slider = screen.getByRole('slider', { name: 'День на графике' })
    expect(slider).toHaveAttribute('aria-valuenow', '13')
    expect(slider).toHaveAttribute('aria-valuetext', 'вс, 6 сентября')
  })

  it('стрелки, Home и End двигают день в пределах окна', () => {
    const onCursor = vi.fn()
    chart({ cursor: 12, onCursor })
    const slider = screen.getByRole('slider')
    fireEvent.keyDown(slider, { key: 'ArrowLeft' })
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    fireEvent.keyDown(slider, { key: 'Home' })
    fireEvent.keyDown(slider, { key: 'End' })
    expect(onCursor.mock.calls.map(([i]) => i)).toEqual([11, 13, 0, 29])
  })

  it('на краю окна стрелка дальше не ведёт', () => {
    const onCursor = vi.fn()
    chart({ cursor: 0, onCursor })
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowLeft' })
    expect(onCursor).not.toHaveBeenCalled()
  })

  it('нажатие и протягивание переносят день под палец', () => {
    const onCursor = vi.fn()
    const { svg } = chart({ cursor: 12, onCursor })
    const [left, right] = all(svg, '[data-bracket]').map((l) => Number(l.getAttribute('x1')))
    const step = right! - left!
    const x = (i: number) => left! - 12 * step + i * step + step / 2
    fireEvent.pointerDown(svg, { clientX: x(3), pointerId: 1 })
    fireEvent.pointerMove(svg, { clientX: x(4), pointerId: 1 })
    fireEvent.pointerUp(svg, { pointerId: 1 })
    fireEvent.pointerMove(svg, { clientX: x(9), pointerId: 1 })
    expect(onCursor.mock.calls.map(([i]) => i)).toEqual([3, 4])
  })

  it('браузер забрал касание под прокрутку — день возвращается на прежний', () => {
    const onCursor = vi.fn()
    const { svg } = chart({ cursor: 12, onCursor })
    const [left, right] = all(svg, '[data-bracket]').map((l) => Number(l.getAttribute('x1')))
    const step = right! - left!
    const x = (i: number) => left! - 12 * step + i * step + step / 2
    fireEvent.pointerDown(svg, { clientX: x(3), pointerId: 1 })
    fireEvent.pointerCancel(svg, { pointerId: 1 })
    expect(onCursor.mock.calls.map(([i]) => i)).toEqual([3, 12])
  })

  it('период подсвечен: неделя — 7 дней по выбранный', () => {
    const { svg } = chart({ cursor: 12, period: 7 })
    const band = svg.querySelector('[data-period]')!
    const [left, right] = all(svg, '[data-bracket]').map((l) => Number(l.getAttribute('x1')))
    expect(Number(band.getAttribute('width'))).toBeCloseTo(7 * (right! - left!))
  })

  it('без периода подсветки нет', () => {
    expect(chart({ period: null }).svg.querySelector('[data-period]')).toBeNull()
  })
})
