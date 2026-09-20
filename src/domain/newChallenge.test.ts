import { describe, expect, it } from 'vitest'
import { buildChallenge, pickColor, suggestCode } from './newChallenge'
import type { Challenge, ChallengeDraft } from './types'

const existing = (over: Partial<Challenge> = {}): Challenge => ({
  id: 'c1',
  name: 'Читать 20 страниц',
  code: 'ЧТН',
  kind: 'do',
  measure: 'binary',
  goal: 1,
  unit: null,
  color: 'var(--chart-1)',
  tag: null,
  startDate: '2026-09-01',
  lengthDays: null,
  status: 'active',
  sortOrder: 0,
  ...over,
})

const draft = (over: Partial<ChallengeDraft> = {}): ChallengeDraft => ({
  name: 'Читать 20 страниц',
  code: 'ЧТН',
  kind: 'do',
  measure: 'binary',
  goal: 1,
  unit: '',
  tag: '',
  lengthDays: null,
  ...over,
})

describe('suggestCode', () => {
  it('из нескольких слов берёт первые буквы', () => {
    expect(suggestCode('Без сигарет навсегда')).toBe('БСН')
  })

  it('из одного слова берёт первые три буквы', () => {
    expect(suggestCode('отжимания')).toBe('ОТЖ')
  })

  it('пропускает числа и короткие слова', () => {
    expect(suggestCode('30 дней отжимаюсь')).toBe('ДО')
  })

  it('на пустом названии не падает', () => {
    expect(suggestCode('   ')).toBe('')
  })
})

describe('pickColor', () => {
  it('первому челленджу даёт первый цвет', () => {
    expect(pickColor([])).toBe('var(--chart-1)')
  })

  it('берёт первый свободный цвет, а не следующий по счёту', () => {
    const used = [existing({ color: 'var(--chart-1)' }), existing({ color: 'var(--chart-3)' })]
    expect(pickColor(used)).toBe('var(--chart-2)')
  })

  it('когда все шесть заняты — идёт по кругу', () => {
    const used = Array.from({ length: 6 }, (_, i) => existing({ color: `var(--chart-${i + 1})` }))
    expect(pickColor(used)).toBe('var(--chart-1)')
  })
})

describe('buildChallenge', () => {
  it('ставит дату старта, активный статус и следующий порядок', () => {
    const c = buildChallenge(draft(), [existing({ sortOrder: 4 })], '2026-09-21')
    expect(c.startDate).toBe('2026-09-21')
    expect(c.status).toBe('active')
    expect(c.sortOrder).toBe(5)
  })

  it('у галочки цель всегда единица, а единица измерения пустая', () => {
    const c = buildChallenge(draft({ measure: 'binary', goal: 99, unit: 'раз' }), [], '2026-09-21')
    expect(c.goal).toBe(1)
    expect(c.unit).toBeNull()
  })

  it('у счётного челленджа сохраняет цель и единицу', () => {
    const c = buildChallenge(
      draft({ measure: 'count', goal: 10000, unit: 'шагов' }),
      [],
      '2026-09-21',
    )
    expect(c.goal).toBe(10000)
    expect(c.unit).toBe('шагов')
  })

  it('отказ всегда галочка: счётного отказа не бывает', () => {
    const c = buildChallenge(draft({ kind: 'quit', measure: 'count', goal: 5 }), [], '2026-09-21')
    expect(c.measure).toBe('binary')
    expect(c.goal).toBe(1)
  })

  it('пустой тег превращается в null, а не в пустую строку', () => {
    expect(buildChallenge(draft({ tag: '  ' }), [], '2026-09-21').tag).toBeNull()
  })

  it('код подставляется из названия, если не задан руками', () => {
    expect(buildChallenge(draft({ code: '' , name: 'Без сахара' }), [], '2026-09-21').code).toBe('БС')
  })

  it('бессрочный челлендж — lengthDays null', () => {
    expect(buildChallenge(draft({ lengthDays: null }), [], '2026-09-21').lengthDays).toBeNull()
  })
})
